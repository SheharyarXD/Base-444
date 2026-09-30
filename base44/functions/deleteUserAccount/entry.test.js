import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("npm:@base44/sdk@0.8.25", () => ({
  createClientFromRequest: vi.fn(() => mockClient),
}));

const mockClient = {
  auth: { me: vi.fn() },
  asServiceRole: {
    entities: {
      Booking: { filter: vi.fn(), delete: vi.fn(), update: vi.fn() },
      Review: { filter: vi.fn(), delete: vi.fn() },
      Message: { filter: vi.fn(), delete: vi.fn() },
      Contractor: { filter: vi.fn(), delete: vi.fn() },
      Reminder: { filter: vi.fn(), delete: vi.fn() },
      User: { delete: vi.fn() },
    },
  },
};

function makeReq() {
  return { json: async () => ({}) };
}

// deleteUserAccount queries Booking twice — once for jobs the user created
// (deleted outright) and once for jobs they accepted as a provider (kept, but
// scrubbed of their location). Route the mock by query shape so each can be
// set independently.
function setBookings({ created = [], accepted = [] }) {
  mockClient.asServiceRole.entities.Booking.filter.mockImplementation(async (query) =>
    query?.created_by ? created : accepted,
  );
}

async function loadHandler() {
  const handlers = [];
  globalThis.Deno = { serve: (fn) => handlers.push(fn), env: { get: () => undefined } };
  vi.resetModules();
  await import("./entry.ts");
  return handlers[0];
}

describe("deleteUserAccount", () => {
  let handler;

  beforeEach(async () => {
    vi.clearAllMocks();
    setBookings({ created: [], accepted: [] });
    mockClient.asServiceRole.entities.Review.filter.mockResolvedValue([]);
    mockClient.asServiceRole.entities.Message.filter.mockResolvedValue([]);
    mockClient.asServiceRole.entities.Contractor.filter.mockResolvedValue([]);
    mockClient.asServiceRole.entities.Reminder.filter.mockResolvedValue([]);
    mockClient.asServiceRole.entities.User.delete.mockResolvedValue({});
    handler = await loadHandler();
  });

  it("rejects when unauthenticated", async () => {
    mockClient.auth.me.mockResolvedValue(null);
    const res = await handler(makeReq());
    expect(res.status).toBe(401);
  });

  it("deletes created bookings, own reviews, and the user row", async () => {
    mockClient.auth.me.mockResolvedValue({ id: "u1", email: "u@x.com" });
    setBookings({ created: [{ id: "b1" }, { id: "b2" }] });
    mockClient.asServiceRole.entities.Review.filter.mockResolvedValue([{ id: "rev1" }]);

    const res = await handler(makeReq());

    expect(res.status ?? 200).toBe(200);
    expect(mockClient.asServiceRole.entities.Booking.delete).toHaveBeenCalledWith("b1");
    expect(mockClient.asServiceRole.entities.Booking.delete).toHaveBeenCalledWith("b2");
    expect(mockClient.asServiceRole.entities.Review.delete).toHaveBeenCalledWith("rev1");
    expect(mockClient.asServiceRole.entities.User.delete).toHaveBeenCalledWith("u1");
  });

  // Regression test for the confirmed Phase 0 bug: the caller's Contractor
  // listing was never deleted, so it stayed live and publicly bookable
  // (Contractor.read RLS is fully public) with no account behind it.
  it("deletes the caller's Contractor listing", async () => {
    mockClient.auth.me.mockResolvedValue({ id: "u1", email: "pro@x.com" });
    mockClient.asServiceRole.entities.Contractor.filter.mockResolvedValue([{ id: "con1" }]);

    await handler(makeReq());

    expect(mockClient.asServiceRole.entities.Contractor.filter).toHaveBeenCalledWith({ created_by: "pro@x.com" });
    expect(mockClient.asServiceRole.entities.Contractor.delete).toHaveBeenCalledWith("con1");
  });

  // Regression test for the confirmed Phase 0 bug: Reminder rows addressed
  // to the caller (recipient_email) were never cleaned up.
  it("deletes Reminder rows addressed to the caller", async () => {
    mockClient.auth.me.mockResolvedValue({ id: "u1", email: "u@x.com" });
    mockClient.asServiceRole.entities.Reminder.filter.mockResolvedValue([{ id: "rem1" }]);

    await handler(makeReq());

    expect(mockClient.asServiceRole.entities.Reminder.filter).toHaveBeenCalledWith({ recipient_email: "u@x.com" });
    expect(mockClient.asServiceRole.entities.Reminder.delete).toHaveBeenCalledWith("rem1");
  });

  // Regression test for the confirmed Phase 0 bug: only sender-side Message
  // rows were deleted — rows where the caller was only the recipient (e.g.
  // a customer's messages from a provider) survived deletion untouched.
  it("deletes both sent and received Message rows", async () => {
    mockClient.auth.me.mockResolvedValue({ id: "u1", email: "u@x.com" });
    mockClient.asServiceRole.entities.Message.filter.mockImplementation(async (query) => {
      if (query.sender_email) return [{ id: "sent1" }];
      if (query.recipient_email) return [{ id: "received1" }];
      return [];
    });

    await handler(makeReq());

    expect(mockClient.asServiceRole.entities.Message.delete).toHaveBeenCalledWith("sent1");
    expect(mockClient.asServiceRole.entities.Message.delete).toHaveBeenCalledWith("received1");
  });

  it("does not double-delete a message id that appears in both sent and received results", async () => {
    mockClient.auth.me.mockResolvedValue({ id: "u1", email: "u@x.com" });
    mockClient.asServiceRole.entities.Message.filter.mockResolvedValue([{ id: "m1" }]);

    await handler(makeReq());

    expect(mockClient.asServiceRole.entities.Message.delete).toHaveBeenCalledTimes(1);
  });

  // Phase 3: a provider's coordinates live on the CUSTOMER's booking row, so
  // filtering only by created_by left them behind after "delete my account".
  it("scrubs the departing provider's location from jobs they accepted", async () => {
    mockClient.auth.me.mockResolvedValue({ id: "u1", email: "pro@x.com" });
    setBookings({
      created: [],
      accepted: [{ id: "b9", created_by: "cust@x.com", contractor_lat: 40, contractor_lng: -74 }],
    });

    await handler(makeReq());

    expect(mockClient.asServiceRole.entities.Booking.update).toHaveBeenCalledWith("b9", {
      contractor_lat: null,
      contractor_lng: null,
      contractor_location_updated_at: null,
      contractor_location_accuracy_m: null,
    });
  });

  it("does NOT delete a customer's booking just because the provider left", async () => {
    mockClient.auth.me.mockResolvedValue({ id: "u1", email: "pro@x.com" });
    setBookings({ created: [], accepted: [{ id: "b9", created_by: "cust@x.com" }] });

    await handler(makeReq());

    expect(mockClient.asServiceRole.entities.Booking.delete).not.toHaveBeenCalledWith("b9");
  });

  it("does not scrub-then-delete a booking the user both created and accepted", async () => {
    // Degenerate but possible (self-booking / seed data): the row is being
    // deleted outright, so updating it first would be a wasted write on a
    // record that is about to vanish.
    mockClient.auth.me.mockResolvedValue({ id: "u1", email: "solo@x.com" });
    setBookings({
      created: [{ id: "b1", created_by: "solo@x.com" }],
      accepted: [{ id: "b1", created_by: "solo@x.com" }],
    });

    await handler(makeReq());

    expect(mockClient.asServiceRole.entities.Booking.delete).toHaveBeenCalledWith("b1");
    expect(mockClient.asServiceRole.entities.Booking.update).not.toHaveBeenCalled();
  });

  it("returns 500 and does not throw on an unexpected error", async () => {
    mockClient.auth.me.mockRejectedValue(new Error("network down"));
    const res = await handler(makeReq());
    expect(res.status).toBe(500);
  });
});
