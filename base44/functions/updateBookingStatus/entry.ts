import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Server-side enforcement for every Booking status transition after accept
// (accept itself is acceptJob's job — this function refuses to grant
// 'accepted'). Phase 0 re-audit found on_the_way/in_progress/completed/
// cancelled were all raw client-side Booking.update({status}) calls in
// BookingDetail.jsx and RealtorDashboard.jsx — Booking's RLS is row-level
// only (created_by OR accepted_by_email OR admin can write ANY field), so
// nothing stopped either party from writing any status at any time,
// including skipping steps or going backwards. Same class of gap acceptJob
// was already built to close for the pending->accepted step; this closes it
// for the rest of the lifecycle, using the same "re-read immediately before
// writing" pattern (see acceptJob's header comment on why that isn't a fully
// atomic compare-and-swap, just a much smaller race window than a client
// round trip).
// Actor requirement per transition: 'contractor' means only the accepted
// provider may make this change; 'customer' means only whoever created the
// booking; 'either' means both. on_the_way is contractor-only (only the
// provider knows they've actually started driving), but "arrived"/completed
// deliberately allow either side — RealtorDashboard.jsx already has a
// working customer-side flow (geofence-triggered "arrived" detection, and a
// manual "Complete" button) alongside BookingDetail.jsx's contractor-side
// "I've Arrived"/"Mark as Completed" actions, and both are legitimate: a
// contractor self-reporting and a customer confirming are both real-world
// completion signals, not a bug to pick one side for.
const TRANSITIONS = {
  pending: { cancelled: 'customer' },
  accepted: { on_the_way: 'contractor', cancelled: 'either' },
  on_the_way: { in_progress: 'either', completed: 'either', cancelled: 'either' },
  in_progress: { completed: 'either', cancelled: 'either' },
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { bookingId, status } = await req.json();
    if (!bookingId || !status) {
      return Response.json({ error: 'bookingId and status are required' }, { status: 400 });
    }

    const booking = await base44.asServiceRole.entities.Booking.get(bookingId);
    if (!booking) {
      return Response.json({ error: 'Booking not found' }, { status: 404 });
    }

    // Re-checked as late as possible, immediately before the write below —
    // see acceptJob/entry.ts's header comment for why this narrows but does
    // not fully close the race window.
    const allowedFromCurrent = TRANSITIONS[booking.status] || {};
    const requiredActor = allowedFromCurrent[status];
    if (!requiredActor) {
      return Response.json(
        { error: `Cannot move a "${booking.status}" booking to "${status}".` },
        { status: 409 }
      );
    }

    const isCustomer = user.email === booking.created_by || user.email === booking.customer_email;
    const isAcceptedContractor = !!booking.accepted_by_email && user.email === booking.accepted_by_email;

    const authorized =
      (requiredActor === 'customer' && isCustomer) ||
      (requiredActor === 'contractor' && isAcceptedContractor) ||
      (requiredActor === 'either' && (isCustomer || isAcceptedContractor));

    if (!authorized) {
      return Response.json({ error: 'You are not authorized to make this change.' }, { status: 403 });
    }

    const updated = await base44.asServiceRole.entities.Booking.update(bookingId, { status });

    if (status === 'completed') {
      // Contractor.completed_jobs was never incremented anywhere in the
      // codebase before this — a real, provable trust signal for the
      // provider profile, not just cosmetic.
      const contractors = await base44.asServiceRole.entities.Contractor.filter({ created_by: booking.accepted_by_email });
      const contractor = contractors[0];
      if (contractor) {
        await base44.asServiceRole.entities.Contractor.update(contractor.id, {
          completed_jobs: (contractor.completed_jobs || 0) + 1,
        });
      }
    }

    if (status === 'completed' || status === 'cancelled') {
      // Reminders must not outlive the booking they're about — a stale
      // "mark yourself on the way" or "job starting soon" reminder for a
      // job that's already done/cancelled was a confirmed Phase 0 bug.
      const activeReminders = await base44.asServiceRole.entities.Reminder.filter({
        booking_id: bookingId,
        status: { $in: ['pending', 'sent'] },
      });
      await Promise.all(
        activeReminders.map((r) => base44.asServiceRole.entities.Reminder.update(r.id, { status: 'cancelled' }))
      );
    }

    return Response.json({ success: true, booking: updated });
  } catch (error) {
    console.error('Error in updateBookingStatus:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
