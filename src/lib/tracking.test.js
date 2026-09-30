import { describe, it, expect } from "vitest";
import {
  haversineMeters,
  shouldTrackLocation,
  shouldSendLocationUpdate,
  classifyLocationFreshness,
  isPresentableAsLive,
  estimateStraightLineEtaMinutes,
  isTrackingStatus,
  FRESHNESS,
  MIN_UPDATE_INTERVAL_MS,
  HEARTBEAT_INTERVAL_MS,
  MIN_UPDATE_DISTANCE_METERS,
  MAX_ACCEPTABLE_ACCURACY_METERS,
  FRESHNESS_LIVE_MS,
  FRESHNESS_RECENT_MS,
} from "./tracking.js";

// A degree of latitude is ~111.32 km, so this is a convenient way to build a
// point a known distance north of another one.
const metersNorth = (lat, m) => lat + m / 111_320;

describe("haversineMeters", () => {
  it("measures a known north-south offset to within 1%", () => {
    const d = haversineMeters(40, -74, metersNorth(40, 1000), -74);
    expect(d).toBeGreaterThan(990);
    expect(d).toBeLessThan(1010);
  });

  it("is zero for identical points", () => {
    expect(haversineMeters(40, -74, 40, -74)).toBeCloseTo(0, 5);
  });
});

describe("isTrackingStatus", () => {
  it("tracks only on_the_way and arriving", () => {
    expect(isTrackingStatus("on_the_way")).toBe(true);
    expect(isTrackingStatus("arriving")).toBe(true);
  });

  it("does NOT track accepted — accepting is not departing", () => {
    expect(isTrackingStatus("accepted")).toBe(false);
  });

  it("does not track pending, in_progress, completed or cancelled", () => {
    for (const s of ["pending", "in_progress", "completed", "cancelled"]) {
      expect(isTrackingStatus(s)).toBe(false);
    }
  });
});

describe("shouldTrackLocation", () => {
  const booking = {
    accepted_by_email: "pro@x.com",
    status: "on_the_way",
  };

  it("tracks for the accepted provider on an on_the_way job", () => {
    expect(shouldTrackLocation({ booking, viewerEmail: "pro@x.com" })).toBe(true);
  });

  it("tracks for the accepted provider on an arriving job", () => {
    expect(
      shouldTrackLocation({ booking: { ...booking, status: "arriving" }, viewerEmail: "pro@x.com" }),
    ).toBe(true);
  });

  it("never tracks for the customer", () => {
    expect(shouldTrackLocation({ booking, viewerEmail: "cust@x.com" })).toBe(false);
  });

  it("never tracks for an unrelated provider", () => {
    expect(shouldTrackLocation({ booking, viewerEmail: "other-pro@x.com" })).toBe(false);
  });

  it("never tracks a booking with no accepted provider, whoever is asking", () => {
    // Regression guard: the previous implementation fell back to
    // "any user whose user_type is Contractor" when accepted_by_email was
    // unset, which let an unrelated device write onto the booking.
    expect(
      shouldTrackLocation({
        booking: { accepted_by_email: null, status: "on_the_way" },
        viewerEmail: "any-pro@x.com",
      }),
    ).toBe(false);
  });

  it("stops tracking once the job is completed or cancelled", () => {
    for (const status of ["completed", "cancelled"]) {
      expect(shouldTrackLocation({ booking: { ...booking, status }, viewerEmail: "pro@x.com" })).toBe(false);
    }
  });

  it("returns false for missing inputs rather than throwing", () => {
    expect(shouldTrackLocation({ booking: null, viewerEmail: "pro@x.com" })).toBe(false);
    expect(shouldTrackLocation({ booking, viewerEmail: null })).toBe(false);
  });
});

describe("shouldSendLocationUpdate", () => {
  const t0 = 1_000_000;
  const base = { lat: 40, lng: -74, at: t0 };

  it("always sends the first fix", () => {
    const r = shouldSendLocationUpdate(null, { lat: 40, lng: -74, at: t0 });
    expect(r.send).toBe(true);
    expect(r.reason).toBe("first_fix");
  });

  it("rejects a fix with non-finite coordinates", () => {
    expect(shouldSendLocationUpdate(null, { lat: NaN, lng: -74, at: t0 }).send).toBe(false);
    expect(shouldSendLocationUpdate(null, { lat: 40, lng: undefined, at: t0 }).send).toBe(false);
  });

  it("rejects a fix whose accuracy is worse than the threshold", () => {
    const r = shouldSendLocationUpdate(null, {
      lat: 40, lng: -74, at: t0, accuracy: MAX_ACCEPTABLE_ACCURACY_METERS + 1,
    });
    expect(r.send).toBe(false);
    expect(r.reason).toBe("accuracy_too_low");
  });

  it("accepts a fix at exactly the accuracy threshold", () => {
    const r = shouldSendLocationUpdate(null, {
      lat: 40, lng: -74, at: t0, accuracy: MAX_ACCEPTABLE_ACCURACY_METERS,
    });
    expect(r.send).toBe(true);
  });

  it("rate-limits a fix that arrives sooner than the minimum interval", () => {
    const r = shouldSendLocationUpdate(base, {
      lat: metersNorth(40, 5000), lng: -74, at: t0 + MIN_UPDATE_INTERVAL_MS - 1,
    });
    expect(r.send).toBe(false);
    expect(r.reason).toBe("rate_limited");
  });

  it("rate-limits even a very large jump — the ceiling is not bypassable", () => {
    const r = shouldSendLocationUpdate(base, { lat: 51, lng: 0, at: t0 + 1000 });
    expect(r.send).toBe(false);
    expect(r.reason).toBe("rate_limited");
  });

  it("suppresses a stationary provider between heartbeats", () => {
    const r = shouldSendLocationUpdate(base, {
      lat: metersNorth(40, 5), lng: -74, at: t0 + MIN_UPDATE_INTERVAL_MS + 1,
    });
    expect(r.send).toBe(false);
    expect(r.reason).toBe("stationary");
  });

  it("sends once the provider has moved past the distance threshold", () => {
    const r = shouldSendLocationUpdate(base, {
      lat: metersNorth(40, MIN_UPDATE_DISTANCE_METERS + 10),
      lng: -74,
      at: t0 + MIN_UPDATE_INTERVAL_MS + 1,
    });
    expect(r.send).toBe(true);
    expect(r.reason).toBe("moved");
    expect(r.distanceMeters).toBeGreaterThan(MIN_UPDATE_DISTANCE_METERS);
  });

  it("sends a heartbeat for a stationary provider once the heartbeat elapses", () => {
    const r = shouldSendLocationUpdate(base, {
      lat: 40, lng: -74, at: t0 + HEARTBEAT_INTERVAL_MS,
    });
    expect(r.send).toBe(true);
    expect(r.reason).toBe("heartbeat");
  });

  it("bounds the write rate: a 1Hz fix stream over 2 minutes yields few writes", () => {
    // Drives the real decision function with a realistic fix stream rather
    // than asserting the constants back at themselves.
    let last = null;
    let writes = 0;
    for (let i = 0; i <= 120; i++) {
      const next = { lat: metersNorth(40, i * 15), lng: -74, at: t0 + i * 1000 };
      if (shouldSendLocationUpdate(last, next).send) {
        writes++;
        last = next;
      }
    }
    // 121 GPS fixes in; at a 15s ceiling that is at most 9 writes.
    expect(writes).toBeLessThanOrEqual(9);
    expect(writes).toBeGreaterThan(0);
  });
});

describe("classifyLocationFreshness", () => {
  const now = 2_000_000_000_000;
  const iso = (ms) => new Date(ms).toISOString();

  it("reports unavailable when there is no timestamp", () => {
    expect(classifyLocationFreshness(null, now)).toBe(FRESHNESS.UNAVAILABLE);
    expect(classifyLocationFreshness(undefined, now)).toBe(FRESHNESS.UNAVAILABLE);
  });

  it("reports unavailable for an unparseable timestamp", () => {
    expect(classifyLocationFreshness("not-a-date", now)).toBe(FRESHNESS.UNAVAILABLE);
  });

  it("reports live for a just-written fix", () => {
    expect(classifyLocationFreshness(iso(now - 1000), now)).toBe(FRESHNESS.LIVE);
  });

  it("reports live at exactly the live boundary", () => {
    expect(classifyLocationFreshness(iso(now - FRESHNESS_LIVE_MS), now)).toBe(FRESHNESS.LIVE);
  });

  it("reports recent just past the live boundary", () => {
    expect(classifyLocationFreshness(iso(now - FRESHNESS_LIVE_MS - 1), now)).toBe(FRESHNESS.RECENT);
  });

  it("reports stale past the recent boundary", () => {
    expect(classifyLocationFreshness(iso(now - FRESHNESS_RECENT_MS - 1), now)).toBe(FRESHNESS.STALE);
  });

  it("treats a far-future timestamp as unavailable rather than fresh", () => {
    expect(classifyLocationFreshness(iso(now + 600_000), now)).toBe(FRESHNESS.UNAVAILABLE);
  });

  it("only presents a live fix as live", () => {
    expect(isPresentableAsLive(FRESHNESS.LIVE)).toBe(true);
    for (const f of [FRESHNESS.RECENT, FRESHNESS.STALE, FRESHNESS.UNAVAILABLE]) {
      expect(isPresentableAsLive(f)).toBe(false);
    }
  });
});

describe("estimateStraightLineEtaMinutes (foundation only)", () => {
  it("returns null when any coordinate is missing", () => {
    expect(estimateStraightLineEtaMinutes(40, -74, null, -74)).toBeNull();
    expect(estimateStraightLineEtaMinutes(NaN, -74, 41, -74)).toBeNull();
  });

  it("returns null for a non-positive speed", () => {
    expect(estimateStraightLineEtaMinutes(40, -74, 41, -74, 0)).toBeNull();
    expect(estimateStraightLineEtaMinutes(40, -74, 41, -74, -5)).toBeNull();
  });

  it("computes minutes from distance and assumed speed", () => {
    // 25 miles at 25mph = 1 hour = 60 minutes.
    const twentyFiveMilesNorth = 40 + 25 / 69.0;
    const eta = estimateStraightLineEtaMinutes(40, -74, twentyFiveMilesNorth, -74, 25);
    expect(eta).toBeGreaterThan(55);
    expect(eta).toBeLessThan(65);
  });

  it("is zero for coincident points", () => {
    expect(estimateStraightLineEtaMinutes(40, -74, 40, -74)).toBeCloseTo(0, 5);
  });
});
