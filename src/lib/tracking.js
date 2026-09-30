// Phase 3 provider-tracking policy — the pure, testable core.
//
// Everything in this file is deliberately side-effect free so it can be unit
// tested without a browser, a geolocation permission, or a Base44 backend.
// The impure parts live in:
//   - src/hooks/useProviderLocationTracking.js  (browser geolocation capture)
//   - base44/functions/updateProviderLocation/  (authorized backend write)
//
// NOTE on duplication: the freshness thresholds below are re-declared in
// base44/functions/updateProviderLocation/entry.ts rather than imported —
// same src/ <-> Deno boundary constraint already documented in
// src/lib/matching.js and src/lib/reminders.js. Keep them mirrored.

// Relative rather than the "@/lib/..." alias used elsewhere in the app:
// vitest.config.js deliberately omits the Base44 Vite plugin (and with it the
// "@" alias), so a tested module inside src/lib must resolve its siblings
// relatively — same convention the *.test.js files here already use.
import { haversineMiles } from "./geo.js";

const METERS_PER_MILE = 1609.344;

export function haversineMeters(lat1, lng1, lat2, lng2) {
  return haversineMiles(lat1, lng1, lat2, lng2) * METERS_PER_MILE;
}

// --- Which booking states are actually tracked -----------------------------

// Tracking is deliberately NOT active for "accepted": accepting commits a
// provider to a job, it does not mean they've left yet (see acceptJob's
// header comment). Following someone's GPS from the moment they accept until
// whenever they happen to drive over would be continuous background tracking
// with no active journey to justify it — exactly what Phase 3 §3 forbids.
export const TRACKED_STATUSES = ["on_the_way", "arriving"];

// Terminal states clear any stored coordinates (see updateBookingStatus).
export const TRACKING_TERMINAL_STATUSES = ["completed", "cancelled"];

export function isTrackingStatus(status) {
  return TRACKED_STATUSES.includes(status);
}

/**
 * The single predicate for "should this device be sampling GPS right now".
 * Both the provider-side hook and the tests go through this so the answer
 * can never drift between them.
 */
export function shouldTrackLocation({ booking, viewerEmail }) {
  if (!booking || !viewerEmail) return false;
  // Only the provider who actually accepted the job — never "any user whose
  // user_type is Contractor", which previously let an unrelated provider's
  // device write coordinates onto a booking with no accepted provider yet.
  if (!booking.accepted_by_email) return false;
  if (booking.accepted_by_email !== viewerEmail) return false;
  return isTrackingStatus(booking.status);
}

// --- Update throttling (Phase 3 §6) ----------------------------------------

// A GPS watch fires far more often than a marketplace needs. These rules turn
// a raw fix stream into a bounded write rate:
//   - never write more than once per MIN_UPDATE_INTERVAL_MS (hard rate ceiling)
//   - past that, only write if the provider actually moved MIN_UPDATE_DISTANCE_METERS
//   - but always write at least once per HEARTBEAT_INTERVAL_MS so a stationary
//     provider's location doesn't silently age into "stale" (§26)
//
// Worst case per active job: one write per 15s while moving, one per 2min
// while stopped — vs. one write per GPS fix (potentially ~1/sec) before.
export const MIN_UPDATE_INTERVAL_MS = 15_000;
export const MIN_UPDATE_DISTANCE_METERS = 50;
export const HEARTBEAT_INTERVAL_MS = 120_000;

// Fixes worse than this are too imprecise to be worth a write or to show a
// customer as the provider's position.
export const MAX_ACCEPTABLE_ACCURACY_METERS = 200;

/**
 * Decide whether a freshly-observed position is worth sending to the backend.
 *
 * @param {{lat:number,lng:number,at:number}|null} last  previously SENT fix
 * @param {{lat:number,lng:number,at:number,accuracy?:number}} next
 * @returns {{send:boolean, reason:string, distanceMeters:number|null}}
 */
export function shouldSendLocationUpdate(last, next) {
  if (!next || !Number.isFinite(next.lat) || !Number.isFinite(next.lng)) {
    return { send: false, reason: "invalid_fix", distanceMeters: null };
  }
  if (
    Number.isFinite(next.accuracy) &&
    next.accuracy > MAX_ACCEPTABLE_ACCURACY_METERS
  ) {
    return { send: false, reason: "accuracy_too_low", distanceMeters: null };
  }
  // First fix of a journey always goes — the customer has nothing to show yet.
  if (!last) return { send: true, reason: "first_fix", distanceMeters: null };

  const elapsed = next.at - last.at;
  const distanceMeters = haversineMeters(last.lat, last.lng, next.lat, next.lng);

  // Hard rate ceiling wins over everything, including large jumps: a noisy or
  // spoofed fix stream must not be able to drive the write rate.
  if (elapsed < MIN_UPDATE_INTERVAL_MS) {
    return { send: false, reason: "rate_limited", distanceMeters };
  }
  if (elapsed >= HEARTBEAT_INTERVAL_MS) {
    return { send: true, reason: "heartbeat", distanceMeters };
  }
  if (distanceMeters >= MIN_UPDATE_DISTANCE_METERS) {
    return { send: true, reason: "moved", distanceMeters };
  }
  return { send: false, reason: "stationary", distanceMeters };
}

// --- Freshness / staleness (Phase 3 §26) -----------------------------------

// A customer must never be shown an old position as if it were live.
export const FRESHNESS_LIVE_MS = 90_000;    // updated within ~1.5 heartbeats
export const FRESHNESS_RECENT_MS = 300_000; // 5 min

export const FRESHNESS = {
  LIVE: "live",
  RECENT: "recent",
  STALE: "stale",
  UNAVAILABLE: "unavailable",
};

/**
 * Classify how much a stored provider position can be trusted right now.
 * `updatedAt` is the ISO string written by updateProviderLocation.
 */
export function classifyLocationFreshness(updatedAt, now = Date.now()) {
  if (!updatedAt) return FRESHNESS.UNAVAILABLE;
  const t = new Date(updatedAt).getTime();
  if (Number.isNaN(t)) return FRESHNESS.UNAVAILABLE;
  const age = now - t;
  // A timestamp meaningfully in the future means clock skew or a bad write —
  // treat it as untrustworthy rather than "extremely fresh".
  if (age < -FRESHNESS_LIVE_MS) return FRESHNESS.UNAVAILABLE;
  if (age <= FRESHNESS_LIVE_MS) return FRESHNESS.LIVE;
  if (age <= FRESHNESS_RECENT_MS) return FRESHNESS.RECENT;
  return FRESHNESS.STALE;
}

export const FRESHNESS_LABELS = {
  [FRESHNESS.LIVE]: "Live",
  [FRESHNESS.RECENT]: "Recently updated",
  [FRESHNESS.STALE]: "Location may be out of date",
  [FRESHNESS.UNAVAILABLE]: "Location unavailable",
};

/** Only a LIVE fix may be presented to a customer as real-time movement. */
export function isPresentableAsLive(freshness) {
  return freshness === FRESHNESS.LIVE;
}

// --- ETA foundation (Phase 3 §12) ------------------------------------------
//
// FOUNDATION ONLY — deliberately NOT surfaced in the UI.
//
// This is a straight-line (great-circle) estimate divided by an assumed
// average speed. It ignores roads, turns, traffic and one-way systems, so it
// is NOT an ETA a customer should ever be shown as a promise. It exists so
// that the stored location shape (position + timestamp + accuracy) is proven
// sufficient to compute distance/duration once a real routing provider
// (Google Directions, Mapbox Directions) is introduced.
//
// Phase 3 §27 forbids shipping this as if it were a real ETA, so no component
// renders it. See the Phase 3 report's "Future Recommendations".
export const ASSUMED_AVERAGE_SPEED_MPH = 25;

export function estimateStraightLineEtaMinutes(
  fromLat, fromLng, toLat, toLng,
  speedMph = ASSUMED_AVERAGE_SPEED_MPH,
) {
  if (![fromLat, fromLng, toLat, toLng].every(Number.isFinite)) return null;
  if (!Number.isFinite(speedMph) || speedMph <= 0) return null;
  const miles = haversineMiles(fromLat, fromLng, toLat, toLng);
  return (miles / speedMph) * 60;
}

// --- Geofence thresholds ---------------------------------------------------

// Distance at which a provider is considered close enough that the booking
// may move to "arriving", and at which the customer is told they've arrived.
export const ARRIVING_RADIUS_FEET = 1500;
export const ARRIVED_RADIUS_FEET = 300;
