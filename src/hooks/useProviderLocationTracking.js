import { useEffect, useRef, useState, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import {
  shouldTrackLocation,
  shouldSendLocationUpdate,
  MIN_UPDATE_INTERVAL_MS,
} from "@/lib/tracking";

// Provider-side location capture (Phase 3 §3/§16/§25).
//
// Replaces the previous inline `navigator.geolocation.watchPosition` in
// BookingDetail.jsx, which wrote EVERY fix straight to the backend with a raw
// `Booking.update()`. Three things changed:
//
//   1. Writes go through the updateProviderLocation function, which is the
//      only authorized writer of those fields (see that function's header).
//   2. Fixes are throttled by src/lib/tracking.js before a request is made,
//      so a 1Hz GPS stream becomes at most one write per 15s while moving
//      and one per 2 minutes while stationary.
//   3. Tracking starts and stops on a defined lifecycle instead of running
//      for as long as the component happens to be mounted.
//
// Platform note: this is a browser geolocation watch, so it only runs while
// the page is in the foreground. There is no background location collection
// — a mobile browser suspends the watch when the tab is backgrounded, and
// the app does not (and cannot, as a web app) request the "always" location
// permission. This is a real limitation, documented rather than papered
// over, and it is also why the customer-facing UI must treat a position as
// possibly stale (see classifyLocationFreshness).

export const TRACKING_STATE = {
  /** Not tracking — no active journey for this viewer. */
  IDLE: "idle",
  /** Permission granted (or not yet prompted); waiting on a first fix. */
  ACQUIRING: "acquiring",
  /** Actively reporting position. */
  ACTIVE: "active",
  /** The user declined the location permission. */
  DENIED: "denied",
  /** No geolocation API, or the device cannot produce a position. */
  UNAVAILABLE: "unavailable",
};

const GEO_OPTIONS = {
  enableHighAccuracy: true,
  // A fix up to a third of the write interval old is fine — asking for a
  // fresher one than we could even send costs battery for nothing.
  maximumAge: Math.floor(MIN_UPDATE_INTERVAL_MS / 3),
  timeout: 20_000,
};

/**
 * @param {object}  args
 * @param {object|null} args.booking      the booking being viewed
 * @param {string|null} args.viewerEmail  the signed-in user's email
 * @returns {{state: string, lastSentAt: number|null, retry: () => void}}
 */
export function useProviderLocationTracking({ booking, viewerEmail }) {
  const [state, setState] = useState(TRACKING_STATE.IDLE);
  const [lastSentAt, setLastSentAt] = useState(null);
  // Bumping this re-runs the effect so a provider who denied the permission
  // and then fixed it in browser settings can retry without a reload.
  const [retryToken, setRetryToken] = useState(0);

  // The last fix we actually SENT — the throttle compares against this, not
  // against the last fix observed, so a slow drift can't sneak past the
  // distance threshold one metre at a time.
  const lastSentRef = useRef(null);
  // Guards against overlapping requests if a write is slower than the fix
  // interval; without it a stalled network turns into a queue of writes.
  const inFlightRef = useRef(false);

  const active = shouldTrackLocation({ booking, viewerEmail });
  const bookingId = booking?.id ?? null;

  const retry = useCallback(() => setRetryToken((n) => n + 1), []);

  useEffect(() => {
    if (!active || !bookingId) {
      setState(TRACKING_STATE.IDLE);
      lastSentRef.current = null;
      return undefined;
    }

    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setState(TRACKING_STATE.UNAVAILABLE);
      return undefined;
    }

    let cancelled = false;
    setState(TRACKING_STATE.ACQUIRING);
    // A new journey starts a new throttle baseline.
    lastSentRef.current = null;

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        if (cancelled) return;
        const fix = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          at: Date.now(),
        };

        const decision = shouldSendLocationUpdate(lastSentRef.current, fix);
        if (!decision.send || inFlightRef.current) return;

        inFlightRef.current = true;
        base44.functions
          .invoke("updateProviderLocation", {
            bookingId,
            lat: fix.lat,
            lng: fix.lng,
            accuracy: fix.accuracy,
          })
          .then((res) => {
            if (cancelled) return;
            // The server can legitimately decline a fix (its own rate floor,
            // or accuracy) — that is not an error, but it also must not
            // advance the local baseline, or the next genuine move would be
            // measured from a position that was never stored.
            if (res?.data?.success) {
              lastSentRef.current = fix;
              setLastSentAt(fix.at);
              setState(TRACKING_STATE.ACTIVE);
            }
          })
          .catch(() => {
            // Network/backend failure: stay in the current state and let the
            // next fix retry. The customer side degrades on its own via the
            // freshness classifier, so there is nothing to alarm the provider
            // about on a single dropped update.
          })
          .finally(() => {
            inFlightRef.current = false;
          });
      },
      (err) => {
        if (cancelled) return;
        // 1 = PERMISSION_DENIED, 2 = POSITION_UNAVAILABLE, 3 = TIMEOUT
        if (err?.code === 1) {
          setState(TRACKING_STATE.DENIED);
        } else if (err?.code === 2) {
          setState(TRACKING_STATE.UNAVAILABLE);
        }
        // A timeout is transient — the watch stays registered and will fire
        // again, so the state is deliberately left as-is rather than
        // flapping the UI between "active" and "unavailable".
      },
      GEO_OPTIONS,
    );

    return () => {
      cancelled = true;
      navigator.geolocation.clearWatch(watchId);
      inFlightRef.current = false;
      setState(TRACKING_STATE.IDLE);
    };
    // `active` collapses booking status + accepted provider + viewer into the
    // single question the effect cares about, so the watch is torn down the
    // moment the job stops being trackable (completed, cancelled, reassigned,
    // or the user logging out).
  }, [active, bookingId, retryToken]);

  return { state, lastSentAt, retry };
}
