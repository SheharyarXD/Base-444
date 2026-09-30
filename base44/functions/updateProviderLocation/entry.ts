import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Server-side enforcement for every provider location write (Phase 3 §4/§5).
//
// Before this function existed, BookingDetail.jsx wrote coordinates with a
// raw client-side `Booking.update(id, { contractor_lat, contractor_lng })`.
// Booking's RLS is row-level only — it grants write access to the row to
// `created_by` OR `accepted_by_email` — so it could not distinguish "the
// provider is reporting where they are" from "someone is writing whatever
// coordinates they like". Concretely, that meant:
//
//   1. The CUSTOMER (created_by) could write the provider's position onto
//      their own booking, fabricating a "your plumber is 2 minutes away".
//   2. Coordinates could be written in any status, including `pending`,
//      `completed` and `cancelled` — i.e. tracking with no active journey.
//   3. Nothing stamped *when* a fix was taken, so a stale position was
//      indistinguishable from a live one (see §26).
//
// This function is the only authorized writer of those fields. It re-derives
// the actor from the request's own credentials rather than trusting anything
// in the body, so a caller cannot manipulate `bookingId` to write onto a
// booking that isn't theirs — the accepted-provider check below is what
// actually stops the IDOR, not the client UI.
//
// Mirrors the policy constants in src/lib/tracking.js. They are re-declared
// rather than imported: nothing in base44/functions/ imports a relative file
// from src/ (only `npm:` packages), the same boundary constraint already
// documented in src/lib/matching.js and src/lib/reminders.js. Keep them
// mirrored.

// Only these statuses represent an active journey worth tracking. `accepted`
// is deliberately excluded — accepting commits a provider to a job, it does
// not mean they have left yet.
const TRACKED_STATUSES = ['on_the_way', 'arriving'];

const MAX_ACCEPTABLE_ACCURACY_METERS = 200;

// Server-side floor on write frequency. The client throttles first (see
// src/lib/tracking.js), but a client is not a trust boundary — this stops a
// modified or looping client from turning tracking into a write firehose.
// Slightly below the client's 15s ceiling so ordinary jitter isn't rejected.
const MIN_SERVER_WRITE_INTERVAL_MS = 10_000;

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { bookingId, lat, lng, accuracy } = await req.json();

    if (!bookingId) {
      return Response.json({ error: 'bookingId is required' }, { status: 400 });
    }
    if (typeof lat !== 'number' || typeof lng !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      return Response.json({ error: 'lat and lng must be finite numbers' }, { status: 400 });
    }
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return Response.json({ error: 'lat/lng out of range' }, { status: 400 });
    }
    if (accuracy !== undefined && accuracy !== null) {
      if (typeof accuracy !== 'number' || !Number.isFinite(accuracy) || accuracy < 0) {
        return Response.json({ error: 'accuracy must be a non-negative number' }, { status: 400 });
      }
      if (accuracy > MAX_ACCEPTABLE_ACCURACY_METERS) {
        // Not an error the provider can act on — just not worth storing or
        // showing a customer as a position.
        return Response.json({ success: false, skipped: 'accuracy_too_low' });
      }
    }

    const booking = await base44.asServiceRole.entities.Booking.get(bookingId);
    if (!booking) {
      return Response.json({ error: 'Booking not found' }, { status: 404 });
    }

    // THE authorization check. Only the provider who actually accepted this
    // specific booking may report a position for it — not the customer, not
    // another provider, not an unassigned provider who happens to know the id.
    if (!booking.accepted_by_email || booking.accepted_by_email !== user.email) {
      return Response.json(
        { error: 'Only the provider assigned to this job can report its location.' },
        { status: 403 },
      );
    }

    // No active journey => no tracking, regardless of who is asking. This is
    // what stops location collection from outliving the job (§9/§22).
    if (!TRACKED_STATUSES.includes(booking.status)) {
      return Response.json(
        { error: `Location tracking is not active for a "${booking.status}" job.` },
        { status: 409 },
      );
    }

    // Server-side rate floor, based on the timestamp this function itself
    // wrote last time (not on anything the caller supplied).
    const previous = booking.contractor_location_updated_at
      ? new Date(booking.contractor_location_updated_at).getTime()
      : NaN;
    if (!Number.isNaN(previous) && Date.now() - previous < MIN_SERVER_WRITE_INTERVAL_MS) {
      return Response.json({ success: false, skipped: 'rate_limited' });
    }

    const updated = await base44.asServiceRole.entities.Booking.update(bookingId, {
      contractor_lat: lat,
      contractor_lng: lng,
      // Stamped server-side on purpose: a client-supplied timestamp could be
      // backdated or forward-dated to make a stale position look live.
      contractor_location_updated_at: new Date().toISOString(),
      contractor_location_accuracy_m: typeof accuracy === 'number' ? accuracy : null,
    });

    return Response.json({
      success: true,
      updated_at: updated?.contractor_location_updated_at ?? null,
    });
  } catch (error) {
    console.error('Error in updateProviderLocation:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
