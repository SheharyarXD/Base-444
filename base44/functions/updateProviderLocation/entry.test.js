import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("npm:@base44/sdk@0.8.31", () => ({
  createClientFromRequest: vi.fn(() => mockClient),
}));

const mockClient = {
  auth: { me: vi.fn() },
  asServiceRole: {
    entities: {
      Booking: { get: vi.fn(), update: vi.fn() },
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

const PRO = "pro@x.com";
const CUSTOMER = "cust@x.com";

function booking(overrides = {}) {
  return {
    id: "b1",
    created_by: CUSTOMER,
    customer_email: CUSTOMER,
    accepted_by_email: PRO,
    status: "on_the_way",
    contractor_location_updated_at: null,
    ...overrides,
  };
}

const VALID = { bookingId: "b1", lat: 40.1, lng: -74.2, accuracy: 12 };

describe("updateProviderLocation", () => {
  let handler;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockClient.asServiceRole.entities.Booking.update.mockResolvedValue({
      id: "b1",
      contractor_location_updated_at: "2026-01-01T00:00:00.000Z",
    });
    handler = await loadHandler();
  });

  it("rejects when unauthenticated", async () => {
    mockClient.auth.me.mockResolvedValue(null);
    const res = await handler(makeReq(VALID));
    expect(res.status).toBe(401);
    expect(mockClient.asServiceRole.entities.Booking.update).not.toHaveBeenCalled();
  });

  describe("input validation", () => {
    beforeEach(() => {
      mockClient.auth.me.mockResolvedValue({ email: PRO });
      mockClient.asServiceRole.entities.Booking.get.mockResolvedValue(booking());
    });

    it("400s without a bookingId", async () => {
      const res = await handler(makeReq({ lat: 40, lng: -74 }));
      expect(res.status).toBe(400);
    });

    it("400s when lat/lng are not finite numbers", async () => {
      for (const body of [
        { bookingId: "b1", lat: "40", lng: -74 },
        { bookingId: "b1", lat: 40 },
        { bookingId: "b1", lat: Number.NaN, lng: -74 },
        { bookingId: "b1", lat: Number.POSITIVE_INFINITY, lng: -74 },
      ]) {
        const res = await handler(makeReq(body));
        expect(res.status).toBe(400);
      }
      expect(mockClient.asServiceRole.entities.Booking.update).not.toHaveBeenCalled();
    });

    it("400s on out-of-range coordinates", async () => {
      for (const body of [
        { bookingId: "b1", lat: 91, lng: 0 },
        { bookingId: "b1", lat: -91, lng: 0 },
        { bookingId: "b1", lat: 0, lng: 181 },
        { bookingId: "b1", lat: 0, lng: -181 },
      ]) {
        const res = await handler(makeReq(body));
        expect(res.status).toBe(400);
      }
    });

    it("400s on a malformed accuracy value", async () => {
      const res = await handler(makeReq({ ...VALID, accuracy: -1 }));
      expect(res.status).toBe(400);
    });

    it("skips (without erroring) a fix whose accuracy is too poor to be useful", async () => {
      const res = await handler(makeReq({ ...VALID, accuracy: 5000 }));
      expect(res.status ?? 200).toBe(200);
      expect(await res.json()).toMatchObject({ success: false, skipped: "accuracy_too_low" });
      expect(mockClient.asServiceRole.entities.Booking.update).not.toHaveBeenCalled();
    });

    it("accepts a fix with no accuracy reported at all", async () => {
      const res = await handler(makeReq({ bookingId: "b1", lat: 40, lng: -74 }));
      expect(await res.json()).toMatchObject({ success: true });
      const written = mockClient.asServiceRole.entities.Booking.update.mock.calls[0][1];
      expect(written.contractor_location_accuracy_m).toBeNull();
    });
  });

  it("404s when the booking does not exist", async () => {
    mockClient.auth.me.mockResolvedValue({ email: PRO });
    mockClient.asServiceRole.entities.Booking.get.mockResolvedValue(null);
    const res = await handler(makeReq(VALID));
    expect(res.status).toBe(404);
  });

  describe("authorization", () => {
    it("refuses the CUSTOMER of the booking (they must not fabricate a provider position)", async () => {
      mockClient.auth.me.mockResolvedValue({ email: CUSTOMER });
      mockClient.asServiceRole.entities.Booking.get.mockResolvedValue(booking());
      const res = await handler(makeReq(VALID));
      expect(res.status).toBe(403);
      expect(mockClient.asServiceRole.entities.Booking.update).not.toHaveBeenCalled();
    });

    it("refuses an unrelated provider guessing a booking id (IDOR)", async () => {
      mockClient.auth.me.mockResolvedValue({ email: "other-pro@x.com" });
      mockClient.asServiceRole.entities.Booking.get.mockResolvedValue(booking());
      const res = await handler(makeReq(VALID));
      expect(res.status).toBe(403);
      expect(mockClient.asServiceRole.entities.Booking.update).not.toHaveBeenCalled();
    });

    it("refuses when the booking has no accepted provider at all", async () => {
      mockClient.auth.me.mockResolvedValue({ email: PRO });
      mockClient.asServiceRole.entities.Booking.get.mockResolvedValue(
        booking({ accepted_by_email: null, status: "pending" }),
      );
      const res = await handler(makeReq(VALID));
      expect(res.status).toBe(403);
    });

    it("allows the accepted provider", async () => {
      mockClient.auth.me.mockResolvedValue({ email: PRO });
      mockClient.asServiceRole.entities.Booking.get.mockResolvedValue(booking());
      const res = await handler(makeReq(VALID));
      expect(await res.json()).toMatchObject({ success: true });
    });
  });

  describe("active-journey restriction", () => {
    beforeEach(() => mockClient.auth.me.mockResolvedValue({ email: PRO }));

    for (const status of ["pending", "accepted", "in_progress", "completed", "cancelled"]) {
      it(`409s for a "${status}" booking — no active journey to track`, async () => {
        mockClient.asServiceRole.entities.Booking.get.mockResolvedValue(booking({ status }));
        const res = await handler(makeReq(VALID));
        expect(res.status).toBe(409);
        expect(mockClient.asServiceRole.entities.Booking.update).not.toHaveBeenCalled();
      });
    }

    for (const status of ["on_the_way", "arriving"]) {
      it(`accepts a fix for a "${status}" booking`, async () => {
        mockClient.asServiceRole.entities.Booking.get.mockResolvedValue(booking({ status }));
        const res = await handler(makeReq(VALID));
        expect(await res.json()).toMatchObject({ success: true });
      });
    }
  });

  describe("server-side rate floor", () => {
    beforeEach(() => mockClient.auth.me.mockResolvedValue({ email: PRO }));

    it("skips a write that arrives too soon after the previous one", async () => {
      mockClient.asServiceRole.entities.Booking.get.mockResolvedValue(
        booking({ contractor_location_updated_at: new Date().toISOString() }),
      );
      const res = await handler(makeReq(VALID));
      expect(await res.json()).toMatchObject({ success: false, skipped: "rate_limited" });
      expect(mockClient.asServiceRole.entities.Booking.update).not.toHaveBeenCalled();
    });

    it("allows a write once enough time has passed", async () => {
      mockClient.asServiceRole.entities.Booking.get.mockResolvedValue(
        booking({ contractor_location_updated_at: new Date(Date.now() - 60_000).toISOString() }),
      );
      const res = await handler(makeReq(VALID));
      expect(await res.json()).toMatchObject({ success: true });
    });

    it("allows the first write when no previous timestamp exists", async () => {
      mockClient.asServiceRole.entities.Booking.get.mockResolvedValue(
        booking({ contractor_location_updated_at: null }),
      );
      const res = await handler(makeReq(VALID));
      expect(await res.json()).toMatchObject({ success: true });
    });

    it("ignores an unparseable stored timestamp rather than blocking forever", async () => {
      mockClient.asServiceRole.entities.Booking.get.mockResolvedValue(
        booking({ contractor_location_updated_at: "garbage" }),
      );
      const res = await handler(makeReq(VALID));
      expect(await res.json()).toMatchObject({ success: true });
    });
  });

  describe("what gets written", () => {
    beforeEach(() => {
      mockClient.auth.me.mockResolvedValue({ email: PRO });
      mockClient.asServiceRole.entities.Booking.get.mockResolvedValue(booking());
    });

    it("stamps the timestamp server-side, ignoring any client-supplied one", async () => {
      const before = Date.now();
      await handler(
        makeReq({ ...VALID, contractor_location_updated_at: "1999-01-01T00:00:00.000Z" }),
      );
      const written = mockClient.asServiceRole.entities.Booking.update.mock.calls[0][1];
      const stamped = new Date(written.contractor_location_updated_at).getTime();
      expect(stamped).toBeGreaterThanOrEqual(before);
      expect(stamped).toBeLessThanOrEqual(Date.now());
    });

    it("writes only the location fields — never status or assignment", async () => {
      await handler(makeReq({ ...VALID, status: "completed", accepted_by_email: "attacker@x.com" }));
      const written = mockClient.asServiceRole.entities.Booking.update.mock.calls[0][1];
      expect(Object.keys(written).sort()).toEqual([
        "contractor_lat",
        "contractor_lng",
        "contractor_location_accuracy_m",
        "contractor_location_updated_at",
      ]);
    });

    it("writes the reported coordinates and accuracy", async () => {
      await handler(makeReq(VALID));
      const written = mockClient.asServiceRole.entities.Booking.update.mock.calls[0][1];
      expect(written.contractor_lat).toBe(40.1);
      expect(written.contractor_lng).toBe(-74.2);
      expect(written.contractor_location_accuracy_m).toBe(12);
    });
  });

  it("500s and does not leak a stack trace when the backend throws", async () => {
    mockClient.auth.me.mockResolvedValue({ email: PRO });
    mockClient.asServiceRole.entities.Booking.get.mockRejectedValue(new Error("db down"));
    const res = await handler(makeReq(VALID));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "db down" });
  });
});
