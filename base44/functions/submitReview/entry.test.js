import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("npm:@base44/sdk@0.8.31", () => ({
  createClientFromRequest: vi.fn(() => mockClient),
}));

const mockClient = {
  auth: { me: vi.fn() },
  asServiceRole: {
    entities: {
      Booking: { get: vi.fn() },
      Review: { filter: vi.fn(), create: vi.fn() },
      Contractor: { filter: vi.fn(), update: vi.fn() },
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

describe("submitReview", () => {
  let handler;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockClient.asServiceRole.entities.Review.filter.mockResolvedValue([]);
    mockClient.asServiceRole.entities.Review.create.mockResolvedValue({ id: "rev1" });
    mockClient.asServiceRole.entities.Contractor.filter.mockResolvedValue([]);
    handler = await loadHandler();
  });

  it("rejects when unauthenticated", async () => {
    mockClient.auth.me.mockResolvedValue(null);
    const res = await handler(makeReq({ bookingId: "b1", rating: 5 }));
    expect(res.status).toBe(401);
  });

  it("rejects a missing bookingId", async () => {
    mockClient.auth.me.mockResolvedValue({ email: "cust@x.com" });
    const res = await handler(makeReq({ rating: 5 }));
    expect(res.status).toBe(400);
  });

  it.each([0, 6, "not-a-number", null])("rejects an invalid rating (%s)", async (rating) => {
    mockClient.auth.me.mockResolvedValue({ email: "cust@x.com" });
    const res = await handler(makeReq({ bookingId: "b1", rating }));
    expect(res.status).toBe(400);
  });

  it("404s when the booking doesn't exist", async () => {
    mockClient.auth.me.mockResolvedValue({ email: "cust@x.com" });
    mockClient.asServiceRole.entities.Booking.get.mockResolvedValue(null);
    const res = await handler(makeReq({ bookingId: "missing", rating: 5 }));
    expect(res.status).toBe(404);
  });

  it("403s when the caller isn't the booking's customer", async () => {
    mockClient.auth.me.mockResolvedValue({ email: "not-the-customer@x.com" });
    mockClient.asServiceRole.entities.Booking.get.mockResolvedValue({
      id: "b1", customer_email: "cust@x.com", status: "completed", contractor_id: "con1",
    });
    const res = await handler(makeReq({ bookingId: "b1", rating: 5 }));
    expect(res.status).toBe(403);
  });

  it("403s a booking that isn't completed yet", async () => {
    mockClient.auth.me.mockResolvedValue({ email: "cust@x.com" });
    mockClient.asServiceRole.entities.Booking.get.mockResolvedValue({
      id: "b1", customer_email: "cust@x.com", status: "accepted", contractor_id: "con1",
    });
    const res = await handler(makeReq({ bookingId: "b1", rating: 5 }));
    expect(res.status).toBe(403);
  });

  // Regression test for the confirmed Phase 0 bug: no path anywhere enforced
  // one review per booking.
  it("409s a second review attempt for the same booking", async () => {
    mockClient.auth.me.mockResolvedValue({ email: "cust@x.com" });
    mockClient.asServiceRole.entities.Booking.get.mockResolvedValue({
      id: "b1", customer_email: "cust@x.com", status: "completed", contractor_id: "con1",
    });
    mockClient.asServiceRole.entities.Review.filter.mockResolvedValue([{ id: "existing-review" }]);

    const res = await handler(makeReq({ bookingId: "b1", rating: 5 }));
    expect(res.status).toBe(409);
    expect(mockClient.asServiceRole.entities.Review.create).not.toHaveBeenCalled();
  });

  it("creates the review with server-derived contractor_id and reviewer_name (ignores any client-supplied values)", async () => {
    mockClient.auth.me.mockResolvedValue({ email: "cust@x.com", full_name: "Cathy Customer" });
    mockClient.asServiceRole.entities.Booking.get.mockResolvedValue({
      id: "b1", customer_email: "cust@x.com", status: "completed", contractor_id: "con1",
    });

    await handler(makeReq({
      bookingId: "b1", rating: 4, comment: "Great work",
      contractor_id: "attacker-controlled-id", reviewer_name: "Spoofed Name",
    }));

    expect(mockClient.asServiceRole.entities.Review.create).toHaveBeenCalledWith({
      contractor_id: "con1",
      booking_id: "b1",
      reviewer_name: "Cathy Customer",
      rating: 4,
      comment: "Great work",
    });
  });

  // Regression test for the confirmed Phase 0 bug: Contractor.rating/
  // review_count were never recomputed anywhere, ever, by any code path.
  it("recomputes Contractor.rating and review_count from the full live set of reviews", async () => {
    mockClient.auth.me.mockResolvedValue({ email: "cust@x.com" });
    mockClient.asServiceRole.entities.Booking.get.mockResolvedValue({
      id: "b1", customer_email: "cust@x.com", status: "completed", contractor_id: "con1",
    });
    // filter() is called twice: once for the uniqueness check (scoped to
    // this booking_id), once for the full aggregate (scoped to contractor_id).
    mockClient.asServiceRole.entities.Review.filter
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ rating: 5 }, { rating: 3 }, { rating: 4 }]);

    await handler(makeReq({ bookingId: "b1", rating: 4 }));

    expect(mockClient.asServiceRole.entities.Contractor.update).toHaveBeenCalledWith("con1", {
      rating: 4, // (5+3+4)/3 = 4
      review_count: 3,
    });
  });

  it("400s a booking with no contractor_id and no accepted_by_email to fall back to", async () => {
    mockClient.auth.me.mockResolvedValue({ email: "cust@x.com" });
    mockClient.asServiceRole.entities.Booking.get.mockResolvedValue({
      id: "b1", customer_email: "cust@x.com", status: "completed", contractor_id: null, accepted_by_email: null,
    });
    const res = await handler(makeReq({ bookingId: "b1", rating: 5 }));
    expect(res.status).toBe(400);
    expect(mockClient.asServiceRole.entities.Review.create).not.toHaveBeenCalled();
  });

  // Regression test for the confirmed Phase 0 bug: contractor_id is only
  // ever set on a *direct* booking (BookContractor.jsx) — an open job posted
  // via PostJob.jsx and picked up through acceptJob never gets it set, so a
  // naive `if (!booking.contractor_id)` check would reject reviews for the
  // majority of real bookings in the app.
  it("falls back to looking up the Contractor by accepted_by_email when contractor_id isn't set (open-job-accepted booking)", async () => {
    mockClient.auth.me.mockResolvedValue({ email: "cust@x.com" });
    mockClient.asServiceRole.entities.Booking.get.mockResolvedValue({
      id: "b1", customer_email: "cust@x.com", status: "completed", contractor_id: null, accepted_by_email: "pro@x.com",
    });
    mockClient.asServiceRole.entities.Contractor.filter.mockResolvedValue([{ id: "con-from-lookup" }]);

    await handler(makeReq({ bookingId: "b1", rating: 5 }));

    expect(mockClient.asServiceRole.entities.Contractor.filter).toHaveBeenCalledWith({ created_by: "pro@x.com" });
    expect(mockClient.asServiceRole.entities.Review.create).toHaveBeenCalledWith(
      expect.objectContaining({ contractor_id: "con-from-lookup" })
    );
    expect(mockClient.asServiceRole.entities.Contractor.update).toHaveBeenCalledWith(
      "con-from-lookup",
      expect.objectContaining({ review_count: expect.any(Number) })
    );
  });

  it("returns 500 and does not throw on an unexpected error", async () => {
    mockClient.auth.me.mockRejectedValue(new Error("network down"));
    const res = await handler(makeReq({ bookingId: "b1", rating: 5 }));
    expect(res.status).toBe(500);
  });
});
