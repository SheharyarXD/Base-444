import { describe, it, expect, vi, beforeEach } from "vitest";

// acceptJob/entry.ts is a Deno server function: it imports the SDK via an
// `npm:` specifier and registers its handler with the global `Deno.serve`.
// To test it as written (no source changes) we mock the npm: specifier and
// stub `Deno.serve` to capture the handler instead of actually serving.
vi.mock("npm:@base44/sdk@0.8.31", () => ({
  createClientFromRequest: vi.fn(() => mockClient),
}));

const mockClient = {
  auth: { me: vi.fn() },
  asServiceRole: {
    entities: {
      Booking: { get: vi.fn(), update: vi.fn() },
      Contractor: { filter: vi.fn() },
      Reminder: { filter: vi.fn(), create: vi.fn() },
    },
  },
};

function makeReq(body) {
  return { json: async () => body };
}

async function loadHandler() {
  const handlers = [];
  globalThis.Deno = {
    serve: (fn) => handlers.push(fn),
    env: { get: () => undefined },
  };
  vi.resetModules();
  await import("./entry.ts");
  return handlers[0];
}

describe("acceptJob", () => {
  let handler;

  beforeEach(async () => {
    vi.clearAllMocks();
    // Default: no existing on-the-way reminder yet, creation succeeds —
    // most tests don't care about the reminder side effect, only the ones
    // added below assert on it directly.
    mockClient.asServiceRole.entities.Reminder.filter.mockResolvedValue([]);
    mockClient.asServiceRole.entities.Reminder.create.mockResolvedValue({ id: "rem1" });
    handler = await loadHandler();
  });

  it("rejects when unauthenticated", async () => {
    mockClient.auth.me.mockResolvedValue(null);
    const res = await handler(makeReq({ bookingId: "b1" }));
    expect(res.status).toBe(401);
  });

  it("rejects when bookingId is missing", async () => {
    mockClient.auth.me.mockResolvedValue({ email: "c@x.com", user_type: "Contractor" });
    const res = await handler(makeReq({}));
    expect(res.status).toBe(400);
  });

  it("rejects a user who isn't a Contractor or Handyman", async () => {
    mockClient.auth.me.mockResolvedValue({ email: "h@x.com", user_type: "Homeowner" });
    const res = await handler(makeReq({ bookingId: "b1" }));
    expect(res.status).toBe(403);
  });

  it("404s when the booking doesn't exist", async () => {
    mockClient.auth.me.mockResolvedValue({ email: "c@x.com", user_type: "Contractor" });
    mockClient.asServiceRole.entities.Booking.get.mockResolvedValue(null);
    const res = await handler(makeReq({ bookingId: "missing" }));
    expect(res.status).toBe(404);
  });

  it("409s (race window) when the booking is no longer pending", async () => {
    mockClient.auth.me.mockResolvedValue({ email: "c@x.com", user_type: "Contractor" });
    mockClient.asServiceRole.entities.Booking.get.mockResolvedValue({ id: "b1", status: "on_the_way" });
    const res = await handler(makeReq({ bookingId: "b1" }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/no longer available/i);
  });

  it("403s when the acting user has no Contractor profile yet", async () => {
    mockClient.auth.me.mockResolvedValue({ email: "c@x.com", user_type: "Contractor" });
    mockClient.asServiceRole.entities.Booking.get.mockResolvedValue({ id: "b1", status: "pending", category: "Plumbing" });
    mockClient.asServiceRole.entities.Contractor.filter.mockResolvedValue([]);
    const res = await handler(makeReq({ bookingId: "b1" }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/complete your provider profile/i);
  });

  it("403s an open job when the contractor's category doesn't match", async () => {
    mockClient.auth.me.mockResolvedValue({ email: "c@x.com", user_type: "Contractor" });
    mockClient.asServiceRole.entities.Booking.get.mockResolvedValue({ id: "b1", status: "pending", category: "Plumbing" });
    mockClient.asServiceRole.entities.Contractor.filter.mockResolvedValue([{ id: "con1", category: "Electrical" }]);
    const res = await handler(makeReq({ bookingId: "b1" }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/service category/i);
  });

  it("403s a direct booking when it was booked for a different contractor", async () => {
    mockClient.auth.me.mockResolvedValue({ email: "c@x.com", user_type: "Contractor" });
    mockClient.asServiceRole.entities.Booking.get.mockResolvedValue({
      id: "b1", status: "pending", category: "Plumbing", contractor_id: "someone-else",
    });
    mockClient.asServiceRole.entities.Contractor.filter.mockResolvedValue([{ id: "con1", category: "Plumbing" }]);
    const res = await handler(makeReq({ bookingId: "b1" }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/booked directly for a different provider/i);
  });

  it("accepts an eligible open job and sets status to 'accepted' (not on_the_way — that's a separate later step) plus accepted_by fields", async () => {
    mockClient.auth.me.mockResolvedValue({ email: "c@x.com", user_type: "Contractor", full_name: "Casey Contractor" });
    mockClient.asServiceRole.entities.Booking.get.mockResolvedValue({ id: "b1", status: "pending", category: "Plumbing" });
    mockClient.asServiceRole.entities.Contractor.filter.mockResolvedValue([{ id: "con1", category: "Plumbing" }]);
    mockClient.asServiceRole.entities.Booking.update.mockResolvedValue({
      id: "b1", status: "accepted", accepted_by_email: "c@x.com", accepted_by_name: "Casey Contractor",
    });

    const res = await handler(makeReq({ bookingId: "b1" }));
    expect(res.status ?? 200).toBe(200);
    expect(mockClient.asServiceRole.entities.Booking.update).toHaveBeenCalledWith("b1", {
      status: "accepted",
      accepted_by_email: "c@x.com",
      accepted_by_name: "Casey Contractor",
    });
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it("creates an on-the-way reminder when a job is accepted (Feature 1)", async () => {
    mockClient.auth.me.mockResolvedValue({ email: "c@x.com", user_type: "Contractor", full_name: "Casey Contractor" });
    mockClient.asServiceRole.entities.Booking.get.mockResolvedValue({ id: "b1", status: "pending", category: "Plumbing", job_title: "Fix sink" });
    mockClient.asServiceRole.entities.Contractor.filter.mockResolvedValue([{ id: "con1", category: "Plumbing" }]);
    mockClient.asServiceRole.entities.Booking.update.mockResolvedValue({ id: "b1", status: "accepted" });

    await handler(makeReq({ bookingId: "b1" }));

    expect(mockClient.asServiceRole.entities.Reminder.filter).toHaveBeenCalledWith({ dedupe_key: "on_the_way_pending:b1" });
    expect(mockClient.asServiceRole.entities.Reminder.create).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "on_the_way_pending",
        booking_id: "b1",
        recipient_email: "c@x.com",
        status: "pending",
        dedupe_key: "on_the_way_pending:b1",
      })
    );
  });

  it("does not create a duplicate on-the-way reminder if one already exists (dedup)", async () => {
    mockClient.auth.me.mockResolvedValue({ email: "c@x.com", user_type: "Contractor", full_name: "Casey Contractor" });
    mockClient.asServiceRole.entities.Booking.get.mockResolvedValue({ id: "b1", status: "pending", category: "Plumbing", job_title: "Fix sink" });
    mockClient.asServiceRole.entities.Contractor.filter.mockResolvedValue([{ id: "con1", category: "Plumbing" }]);
    mockClient.asServiceRole.entities.Booking.update.mockResolvedValue({ id: "b1", status: "accepted" });
    mockClient.asServiceRole.entities.Reminder.filter.mockResolvedValue([{ id: "existing-rem" }]);

    await handler(makeReq({ bookingId: "b1" }));

    expect(mockClient.asServiceRole.entities.Reminder.create).not.toHaveBeenCalled();
  });

  it("accepts a direct booking for the correct target contractor even with a different category", async () => {
    mockClient.auth.me.mockResolvedValue({ email: "c@x.com", user_type: "Handyman", full_name: "Casey" });
    mockClient.asServiceRole.entities.Booking.get.mockResolvedValue({
      id: "b1", status: "pending", category: "Mobile Detailer", contractor_id: "con1",
    });
    mockClient.asServiceRole.entities.Contractor.filter.mockResolvedValue([{ id: "con1", category: "Mobile Mechanic" }]);
    mockClient.asServiceRole.entities.Booking.update.mockResolvedValue({ id: "b1", status: "accepted" });

    const res = await handler(makeReq({ bookingId: "b1" }));
    expect(res.status ?? 200).toBe(200);
  });

  it("returns 500 and does not throw when the client rejects unexpectedly", async () => {
    mockClient.auth.me.mockRejectedValue(new Error("network down"));
    const res = await handler(makeReq({ bookingId: "b1" }));
    expect(res.status).toBe(500);
  });

  // acceptJob's eligibility check is a plain string comparison against
  // whatever category the booking/contractor carry — no hardcoded category
  // allowlist — so newly added categories need no code change, only test
  // coverage confirming they route through the same logic correctly.
  it("accepts an eligible open job in the newly added 'Pressure Washing Services' category", async () => {
    mockClient.auth.me.mockResolvedValue({ email: "c@x.com", user_type: "Contractor", full_name: "Wanda Washer" });
    mockClient.asServiceRole.entities.Booking.get.mockResolvedValue({
      id: "b2", status: "pending", category: "Pressure Washing Services",
    });
    mockClient.asServiceRole.entities.Contractor.filter.mockResolvedValue([
      { id: "con2", category: "Pressure Washing Services" },
    ]);
    mockClient.asServiceRole.entities.Booking.update.mockResolvedValue({ id: "b2", status: "accepted" });

    const res = await handler(makeReq({ bookingId: "b2" }));
    expect(res.status ?? 200).toBe(200);
    expect(mockClient.asServiceRole.entities.Booking.update).toHaveBeenCalledWith("b2", expect.objectContaining({
      status: "accepted",
      accepted_by_email: "c@x.com",
    }));
  });

  it("403s a 'Contractors'-category contractor attempting an open job in the newly added 'Pressure Washing Services' category", async () => {
    mockClient.auth.me.mockResolvedValue({ email: "c@x.com", user_type: "Contractor" });
    mockClient.asServiceRole.entities.Booking.get.mockResolvedValue({
      id: "b2", status: "pending", category: "Pressure Washing Services",
    });
    mockClient.asServiceRole.entities.Contractor.filter.mockResolvedValue([{ id: "con2", category: "Contractors" }]);

    const res = await handler(makeReq({ bookingId: "b2" }));
    expect(res.status).toBe(403);
  });
});
