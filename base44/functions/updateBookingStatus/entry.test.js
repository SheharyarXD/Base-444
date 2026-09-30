import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("npm:@base44/sdk@0.8.31", () => ({
  createClientFromRequest: vi.fn(() => mockClient),
}));

const mockClient = {
  auth: { me: vi.fn() },
  asServiceRole: {
    entities: {
      Booking: { get: vi.fn(), update: vi.fn() },
      Contractor: { filter: vi.fn(), update: vi.fn() },
      Reminder: { filter: vi.fn(), update: vi.fn() },
    },
  },
};

function makeReq(body) {
  return { json: async () => body };
}

async function loadHandler() {
  const handlers = [];
  globalThis.Deno = { serve: (fn) => handlers.push(fn), env: { get: () => undefined } };
  vi.resetModules();
  await import("./entry.ts");
  return handlers[0];
}

describe("updateBookingStatus", () => {
  let handler;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockClient.asServiceRole.entities.Booking.update.mockResolvedValue({ id: "b1" });
    mockClient.asServiceRole.entities.Contractor.filter.mockResolvedValue([]);
    mockClient.asServiceRole.entities.Reminder.filter.mockResolvedValue([]);
    handler = await loadHandler();
  });

  it("rejects when unauthenticated", async () => {
    mockClient.auth.me.mockResolvedValue(null);
    const res = await handler(makeReq({ bookingId: "b1", status: "on_the_way" }));
    expect(res.status).toBe(401);
  });

  it("rejects when bookingId or status is missing", async () => {
    mockClient.auth.me.mockResolvedValue({ email: "c@x.com" });
    const res = await handler(makeReq({ bookingId: "b1" }));
    expect(res.status).toBe(400);
  });

  it("404s when the booking doesn't exist", async () => {
    mockClient.auth.me.mockResolvedValue({ email: "c@x.com" });
    mockClient.asServiceRole.entities.Booking.get.mockResolvedValue(null);
    const res = await handler(makeReq({ bookingId: "missing", status: "on_the_way" }));
    expect(res.status).toBe(404);
  });

  it("409s an illegal transition (e.g. pending straight to completed)", async () => {
    mockClient.auth.me.mockResolvedValue({ email: "c@x.com" });
    mockClient.asServiceRole.entities.Booking.get.mockResolvedValue({ id: "b1", status: "pending", customer_email: "c@x.com" });
    const res = await handler(makeReq({ bookingId: "b1", status: "completed" }));
    expect(res.status).toBe(409);
    expect(mockClient.asServiceRole.entities.Booking.update).not.toHaveBeenCalled();
  });

  it("409s a backwards transition (completed -> accepted)", async () => {
    mockClient.auth.me.mockResolvedValue({ email: "c@x.com" });
    mockClient.asServiceRole.entities.Booking.get.mockResolvedValue({ id: "b1", status: "completed", customer_email: "c@x.com" });
    const res = await handler(makeReq({ bookingId: "b1", status: "accepted" }));
    expect(res.status).toBe(409);
  });

  it("403s on_the_way when the caller is not the accepted contractor", async () => {
    mockClient.auth.me.mockResolvedValue({ email: "someone-else@x.com" });
    mockClient.asServiceRole.entities.Booking.get.mockResolvedValue({
      id: "b1", status: "accepted", accepted_by_email: "c@x.com", customer_email: "cust@x.com",
    });
    const res = await handler(makeReq({ bookingId: "b1", status: "on_the_way" }));
    expect(res.status).toBe(403);
  });

  it("allows the accepted contractor to move accepted -> on_the_way", async () => {
    mockClient.auth.me.mockResolvedValue({ email: "c@x.com" });
    mockClient.asServiceRole.entities.Booking.get.mockResolvedValue({
      id: "b1", status: "accepted", accepted_by_email: "c@x.com", customer_email: "cust@x.com",
    });
    const res = await handler(makeReq({ bookingId: "b1", status: "on_the_way" }));
    expect(res.status ?? 200).toBe(200);
    expect(mockClient.asServiceRole.entities.Booking.update).toHaveBeenCalledWith("b1", { status: "on_the_way" });
  });

  it("allows the customer to cancel a pending booking", async () => {
    mockClient.auth.me.mockResolvedValue({ email: "cust@x.com" });
    mockClient.asServiceRole.entities.Booking.get.mockResolvedValue({
      id: "b1", status: "pending", created_by: "cust@x.com", customer_email: "cust@x.com",
    });
    const res = await handler(makeReq({ bookingId: "b1", status: "cancelled" }));
    expect(res.status ?? 200).toBe(200);
  });

  it("rejects the contractor cancelling a pending booking (only the customer may, before anyone has accepted)", async () => {
    mockClient.auth.me.mockResolvedValue({ email: "rando@x.com" });
    mockClient.asServiceRole.entities.Booking.get.mockResolvedValue({
      id: "b1", status: "pending", created_by: "cust@x.com", customer_email: "cust@x.com",
    });
    const res = await handler(makeReq({ bookingId: "b1", status: "cancelled" }));
    expect(res.status).toBe(403);
  });

  it("allows either party to cancel an accepted booking", async () => {
    mockClient.auth.me.mockResolvedValue({ email: "c@x.com" });
    mockClient.asServiceRole.entities.Booking.get.mockResolvedValue({
      id: "b1", status: "accepted", accepted_by_email: "c@x.com", customer_email: "cust@x.com",
    });
    const res = await handler(makeReq({ bookingId: "b1", status: "cancelled" }));
    expect(res.status ?? 200).toBe(200);
  });

  it("allows the contractor to go straight from on_the_way to completed (arrival step optional)", async () => {
    mockClient.auth.me.mockResolvedValue({ email: "c@x.com" });
    mockClient.asServiceRole.entities.Booking.get.mockResolvedValue({
      id: "b1", status: "on_the_way", accepted_by_email: "c@x.com", customer_email: "cust@x.com",
    });
    const res = await handler(makeReq({ bookingId: "b1", status: "completed" }));
    expect(res.status ?? 200).toBe(200);
  });

  // RealtorDashboard.jsx has a working customer-side flow: geofence-detected
  // "arrived" and a manual "Complete" button, both triggered by whoever
  // created the booking, not the contractor. in_progress/completed must stay
  // reachable by either side — this is what would have broken if that step
  // were restricted to 'contractor' only.
  it("allows the customer (not just the contractor) to mark on_the_way -> in_progress", async () => {
    mockClient.auth.me.mockResolvedValue({ email: "cust@x.com" });
    mockClient.asServiceRole.entities.Booking.get.mockResolvedValue({
      id: "b1", status: "on_the_way", accepted_by_email: "c@x.com", created_by: "cust@x.com", customer_email: "cust@x.com",
    });
    const res = await handler(makeReq({ bookingId: "b1", status: "in_progress" }));
    expect(res.status ?? 200).toBe(200);
  });

  it("allows the customer to mark in_progress -> completed", async () => {
    mockClient.auth.me.mockResolvedValue({ email: "cust@x.com" });
    mockClient.asServiceRole.entities.Booking.get.mockResolvedValue({
      id: "b1", status: "in_progress", accepted_by_email: "c@x.com", created_by: "cust@x.com", customer_email: "cust@x.com",
    });
    const res = await handler(makeReq({ bookingId: "b1", status: "completed" }));
    expect(res.status ?? 200).toBe(200);
  });

  it("still rejects a third party who is neither the customer nor the accepted contractor from completing a job", async () => {
    mockClient.auth.me.mockResolvedValue({ email: "rando@x.com" });
    mockClient.asServiceRole.entities.Booking.get.mockResolvedValue({
      id: "b1", status: "in_progress", accepted_by_email: "c@x.com", created_by: "cust@x.com", customer_email: "cust@x.com",
    });
    const res = await handler(makeReq({ bookingId: "b1", status: "completed" }));
    expect(res.status).toBe(403);
  });

  it("increments the accepted contractor's completed_jobs on completion", async () => {
    mockClient.auth.me.mockResolvedValue({ email: "c@x.com" });
    mockClient.asServiceRole.entities.Booking.get.mockResolvedValue({
      id: "b1", status: "in_progress", accepted_by_email: "c@x.com", customer_email: "cust@x.com",
    });
    mockClient.asServiceRole.entities.Contractor.filter.mockResolvedValue([{ id: "con1", completed_jobs: 4 }]);

    await handler(makeReq({ bookingId: "b1", status: "completed" }));

    expect(mockClient.asServiceRole.entities.Contractor.filter).toHaveBeenCalledWith({ created_by: "c@x.com" });
    expect(mockClient.asServiceRole.entities.Contractor.update).toHaveBeenCalledWith("con1", { completed_jobs: 5 });
  });

  it("does not throw incrementing completed_jobs when the contractor row is missing", async () => {
    mockClient.auth.me.mockResolvedValue({ email: "c@x.com" });
    mockClient.asServiceRole.entities.Booking.get.mockResolvedValue({
      id: "b1", status: "in_progress", accepted_by_email: "c@x.com", customer_email: "cust@x.com",
    });
    mockClient.asServiceRole.entities.Contractor.filter.mockResolvedValue([]);

    const res = await handler(makeReq({ bookingId: "b1", status: "completed" }));
    expect(res.status ?? 200).toBe(200);
    expect(mockClient.asServiceRole.entities.Contractor.update).not.toHaveBeenCalled();
  });

  it("dismisses active reminders for the booking on completion", async () => {
    mockClient.auth.me.mockResolvedValue({ email: "c@x.com" });
    mockClient.asServiceRole.entities.Booking.get.mockResolvedValue({
      id: "b1", status: "in_progress", accepted_by_email: "c@x.com", customer_email: "cust@x.com",
    });
    mockClient.asServiceRole.entities.Reminder.filter.mockResolvedValue([{ id: "rem1" }, { id: "rem2" }]);

    await handler(makeReq({ bookingId: "b1", status: "completed" }));

    expect(mockClient.asServiceRole.entities.Reminder.filter).toHaveBeenCalledWith({
      booking_id: "b1",
      status: { $in: ["pending", "sent"] },
    });
    expect(mockClient.asServiceRole.entities.Reminder.update).toHaveBeenCalledWith("rem1", { status: "cancelled" });
    expect(mockClient.asServiceRole.entities.Reminder.update).toHaveBeenCalledWith("rem2", { status: "cancelled" });
  });

  it("dismisses active reminders for the booking on cancellation too", async () => {
    mockClient.auth.me.mockResolvedValue({ email: "cust@x.com" });
    mockClient.asServiceRole.entities.Booking.get.mockResolvedValue({
      id: "b1", status: "accepted", accepted_by_email: "c@x.com", customer_email: "cust@x.com",
    });
    mockClient.asServiceRole.entities.Reminder.filter.mockResolvedValue([{ id: "rem1" }]);

    await handler(makeReq({ bookingId: "b1", status: "cancelled" }));
    expect(mockClient.asServiceRole.entities.Reminder.update).toHaveBeenCalledWith("rem1", { status: "cancelled" });
  });

  it("does not touch reminders or completed_jobs for a non-terminal transition", async () => {
    mockClient.auth.me.mockResolvedValue({ email: "c@x.com" });
    mockClient.asServiceRole.entities.Booking.get.mockResolvedValue({
      id: "b1", status: "accepted", accepted_by_email: "c@x.com", customer_email: "cust@x.com",
    });

    await handler(makeReq({ bookingId: "b1", status: "on_the_way" }));
    expect(mockClient.asServiceRole.entities.Reminder.filter).not.toHaveBeenCalled();
    expect(mockClient.asServiceRole.entities.Contractor.update).not.toHaveBeenCalled();
  });

  it("returns 500 and does not throw on an unexpected error", async () => {
    mockClient.auth.me.mockRejectedValue(new Error("network down"));
    const res = await handler(makeReq({ bookingId: "b1", status: "on_the_way" }));
    expect(res.status).toBe(500);
  });

  // --- Phase 3: the 'arriving' state -------------------------------------
  describe("arriving", () => {
    const PRO = "c@x.com";
    const CUST = "cust@x.com";
    const onTheWay = {
      id: "b1", status: "on_the_way", accepted_by_email: PRO, created_by: CUST, customer_email: CUST,
    };

    it("lets the accepted contractor move on_the_way -> arriving", async () => {
      mockClient.auth.me.mockResolvedValue({ email: PRO });
      mockClient.asServiceRole.entities.Booking.get.mockResolvedValue(onTheWay);
      const res = await handler(makeReq({ bookingId: "b1", status: "arriving" }));
      expect(res.status ?? 200).toBe(200);
      expect(mockClient.asServiceRole.entities.Booking.update).toHaveBeenCalledWith("b1", { status: "arriving" });
    });

    it("does NOT let the customer declare the provider arriving", async () => {
      mockClient.auth.me.mockResolvedValue({ email: CUST });
      mockClient.asServiceRole.entities.Booking.get.mockResolvedValue(onTheWay);
      const res = await handler(makeReq({ bookingId: "b1", status: "arriving" }));
      expect(res.status).toBe(403);
    });

    it("does not let an unrelated user declare arriving", async () => {
      mockClient.auth.me.mockResolvedValue({ email: "rando@x.com" });
      mockClient.asServiceRole.entities.Booking.get.mockResolvedValue(onTheWay);
      const res = await handler(makeReq({ bookingId: "b1", status: "arriving" }));
      expect(res.status).toBe(403);
    });

    it("409s skipping straight from accepted to arriving", async () => {
      mockClient.auth.me.mockResolvedValue({ email: PRO });
      mockClient.asServiceRole.entities.Booking.get.mockResolvedValue({ ...onTheWay, status: "accepted" });
      const res = await handler(makeReq({ bookingId: "b1", status: "arriving" }));
      expect(res.status).toBe(409);
    });

    it("409s going backwards from arriving to on_the_way", async () => {
      mockClient.auth.me.mockResolvedValue({ email: PRO });
      mockClient.asServiceRole.entities.Booking.get.mockResolvedValue({ ...onTheWay, status: "arriving" });
      const res = await handler(makeReq({ bookingId: "b1", status: "on_the_way" }));
      expect(res.status).toBe(409);
    });

    it("keeps the arrival step optional — on_the_way -> in_progress still works", async () => {
      mockClient.auth.me.mockResolvedValue({ email: PRO });
      mockClient.asServiceRole.entities.Booking.get.mockResolvedValue(onTheWay);
      const res = await handler(makeReq({ bookingId: "b1", status: "in_progress" }));
      expect(res.status ?? 200).toBe(200);
    });

    for (const next of ["in_progress", "completed", "cancelled"]) {
      it(`allows arriving -> ${next}`, async () => {
        mockClient.auth.me.mockResolvedValue({ email: PRO });
        mockClient.asServiceRole.entities.Booking.get.mockResolvedValue({ ...onTheWay, status: "arriving" });
        const res = await handler(makeReq({ bookingId: "b1", status: next }));
        expect(res.status ?? 200).toBe(200);
      });
    }
  });

  // --- Phase 3: location retention (§9/§22) ------------------------------
  describe("clearing tracked location on terminal states", () => {
    const PRO = "c@x.com";
    const CUST = "cust@x.com";
    const tracked = {
      id: "b1", accepted_by_email: PRO, created_by: CUST, customer_email: CUST,
      contractor_lat: 40, contractor_lng: -74,
      contractor_location_updated_at: "2026-01-01T00:00:00.000Z",
      contractor_location_accuracy_m: 12,
    };

    it("wipes the stored position in the same write that completes the job", async () => {
      mockClient.auth.me.mockResolvedValue({ email: PRO });
      mockClient.asServiceRole.entities.Booking.get.mockResolvedValue({ ...tracked, status: "arriving" });

      await handler(makeReq({ bookingId: "b1", status: "completed" }));

      expect(mockClient.asServiceRole.entities.Booking.update).toHaveBeenCalledWith("b1", {
        status: "completed",
        contractor_lat: null,
        contractor_lng: null,
        contractor_location_updated_at: null,
        contractor_location_accuracy_m: null,
      });
    });

    it("wipes the stored position on cancellation too", async () => {
      mockClient.auth.me.mockResolvedValue({ email: CUST });
      mockClient.asServiceRole.entities.Booking.get.mockResolvedValue({ ...tracked, status: "on_the_way" });

      await handler(makeReq({ bookingId: "b1", status: "cancelled" }));

      const patch = mockClient.asServiceRole.entities.Booking.update.mock.calls[0][1];
      expect(patch.contractor_lat).toBeNull();
      expect(patch.contractor_lng).toBeNull();
      expect(patch.contractor_location_updated_at).toBeNull();
      expect(patch.contractor_location_accuracy_m).toBeNull();
    });

    it("leaves the position alone on a non-terminal transition", async () => {
      mockClient.auth.me.mockResolvedValue({ email: PRO });
      mockClient.asServiceRole.entities.Booking.get.mockResolvedValue({ ...tracked, status: "on_the_way" });

      await handler(makeReq({ bookingId: "b1", status: "arriving" }));

      expect(mockClient.asServiceRole.entities.Booking.update).toHaveBeenCalledWith("b1", { status: "arriving" });
    });
  });
});
