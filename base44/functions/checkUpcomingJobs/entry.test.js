import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("npm:@base44/sdk@0.8.25", () => ({
  createClientFromRequest: vi.fn(() => mockClient),
}));

const mockClient = {
  asServiceRole: {
    entities: {
      Booking: { filter: vi.fn(), update: vi.fn() },
      Reminder: { filter: vi.fn(), create: vi.fn(), update: vi.fn() },
    },
    integrations: { Core: { SendEmail: vi.fn() } },
  },
};

function makeReq() {
  return { json: async () => ({}) };
}

async function loadHandler() {
  const handlers = [];
  globalThis.Deno = { serve: (fn) => handlers.push(fn), env: { get: () => undefined } };
  vi.resetModules();
  await import("./entry.ts");
  return handlers[0];
}

describe("checkUpcomingJobs — reminder engine", () => {
  let handler;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockClient.asServiceRole.entities.Reminder.filter.mockResolvedValue([]);
    mockClient.asServiceRole.entities.Reminder.create.mockResolvedValue({ id: "rem-new" });
    mockClient.asServiceRole.entities.Reminder.update.mockResolvedValue({ id: "rem1", status: "sent" });
    handler = await loadHandler();
  });

  it("escalates an overdue on-the-way reminder to an email and marks it sent", async () => {
    const dueAt = new Date(Date.now() - 25 * 60000); // 25 min ago, past the 20-min threshold
    mockClient.asServiceRole.entities.Booking.filter.mockResolvedValue([
      { id: "b1", status: "accepted", accepted_by_email: "pro@x.com", accepted_by_name: "Pro", job_title: "Fix sink" },
    ]);
    mockClient.asServiceRole.entities.Reminder.filter.mockResolvedValue([
      { id: "rem1", type: "on_the_way_pending", booking_id: "b1", status: "pending", due_at: dueAt.toISOString() },
    ]);

    const res = await handler(makeReq());
    const body = await res.json();

    expect(mockClient.asServiceRole.integrations.Core.SendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "pro@x.com" })
    );
    expect(mockClient.asServiceRole.entities.Reminder.update).toHaveBeenCalledWith("rem1", { status: "sent" });
    expect(body.remindersEscalated).toBe(1);
  });

  it("does not escalate a reminder that isn't overdue yet", async () => {
    const dueAt = new Date(Date.now() - 5 * 60000); // only 5 min ago
    mockClient.asServiceRole.entities.Booking.filter.mockResolvedValue([
      { id: "b1", status: "accepted", accepted_by_email: "pro@x.com", job_title: "Fix sink" },
    ]);
    mockClient.asServiceRole.entities.Reminder.filter.mockResolvedValue([
      { id: "rem1", type: "on_the_way_pending", booking_id: "b1", status: "pending", due_at: dueAt.toISOString() },
    ]);

    const res = await handler(makeReq());
    const body = await res.json();

    expect(mockClient.asServiceRole.integrations.Core.SendEmail).not.toHaveBeenCalled();
    expect(body.remindersEscalated).toBe(0);
  });

  it("does not re-escalate a reminder that's already been marked sent", async () => {
    const dueAt = new Date(Date.now() - 60 * 60000);
    mockClient.asServiceRole.entities.Booking.filter.mockResolvedValue([
      { id: "b1", status: "accepted", accepted_by_email: "pro@x.com", job_title: "Fix sink" },
    ]);
    mockClient.asServiceRole.entities.Reminder.filter.mockResolvedValue([
      { id: "rem1", type: "on_the_way_pending", booking_id: "b1", status: "sent", due_at: dueAt.toISOString() },
    ]);

    await handler(makeReq());

    expect(mockClient.asServiceRole.integrations.Core.SendEmail).not.toHaveBeenCalled();
  });

  it("creates and emails a due upcoming-job reminder, deduplicated by dedupe_key", async () => {
    // Pinned rather than derived from the real current time — the handler
    // computes `now` internally via `new Date()`, so the test's booking
    // date/time must be fixed relative to a fixed "now" to be deterministic.
    vi.setSystemTime(new Date("2026-08-01T11:40:00")); // 20 min before a 12:00 "Afternoon" start
    try {
      mockClient.asServiceRole.entities.Booking.filter.mockResolvedValue([
        {
          id: "b2",
          status: "on_the_way",
          accepted_by_email: "pro@x.com",
          job_title: "Fix fence",
          address: "1 Main St",
          preferred_date: "2026-08-01",
          preferred_time: "Afternoon (12pm-4pm)",
        },
      ]);
      // No reminders exist yet for this booking.
      mockClient.asServiceRole.entities.Reminder.filter.mockResolvedValue([]);

      const res = await handler(makeReq());
      const body = await res.json();

      expect(mockClient.asServiceRole.entities.Reminder.create).toHaveBeenCalled();
      expect(body.remindersCreated).toBeGreaterThan(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not duplicate an upcoming-job reminder that already exists", async () => {
    vi.setSystemTime(new Date("2026-08-01T11:40:00"));
    try {
      const dedupeKey = `job_upcoming_final:b2`;
      mockClient.asServiceRole.entities.Booking.filter.mockResolvedValue([
        {
          id: "b2",
          status: "on_the_way",
          accepted_by_email: "pro@x.com",
          job_title: "Fix fence",
          address: "1 Main St",
          preferred_date: "2026-08-01",
          preferred_time: "Afternoon (12pm-4pm)",
        },
      ]);
      mockClient.asServiceRole.entities.Reminder.filter.mockResolvedValue([
        { id: "existing", type: "job_upcoming_final", booking_id: "b2", status: "sent", dedupe_key: dedupeKey },
      ]);

      await handler(makeReq());

      const createdKeys = mockClient.asServiceRole.entities.Reminder.create.mock.calls.map((c) => c[0].dedupe_key);
      expect(createdKeys).not.toContain(dedupeKey);
    } finally {
      vi.useRealTimers();
    }
  });

  it("never creates reminders for a cancelled or completed booking even if present in the fetched set", async () => {
    mockClient.asServiceRole.entities.Booking.filter.mockResolvedValue([
      { id: "b3", status: "cancelled", accepted_by_email: "pro@x.com", job_title: "Old job", preferred_date: "2020-01-01", preferred_time: "Morning (8am-12pm)" },
    ]);

    await handler(makeReq());

    expect(mockClient.asServiceRole.entities.Reminder.create).not.toHaveBeenCalled();
    expect(mockClient.asServiceRole.integrations.Core.SendEmail).not.toHaveBeenCalled();
  });

  it("never creates reminders for an expired job", async () => {
    mockClient.asServiceRole.entities.Booking.filter.mockResolvedValue([
      {
        id: "b4",
        status: "on_the_way",
        accepted_by_email: "pro@x.com",
        job_title: "Very old job",
        preferred_date: "2020-01-01",
        preferred_time: "Morning (8am-12pm)",
      },
    ]);

    await handler(makeReq());

    expect(mockClient.asServiceRole.entities.Reminder.create).not.toHaveBeenCalled();
  });

  it("still returns the legacy 'checked' count alongside the new reminder stats", async () => {
    mockClient.asServiceRole.entities.Booking.filter.mockResolvedValue([]);
    const res = await handler(makeReq());
    const body = await res.json();
    expect(body).toMatchObject({ success: true, checked: 0, remindersEscalated: 0, remindersCreated: 0 });
  });
});
