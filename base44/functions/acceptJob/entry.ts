import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Server-side job acceptance. Moves the "who gets this job" decision out of
// the client (which previously called Booking.update() directly with no
// eligibility check and no re-check of status immediately before writing)
// and into one place that:
//   1. re-checks the booking is still "pending" right before writing,
//   2. enforces category eligibility for open jobs,
//   3. enforces that a direct booking can only be accepted by the contractor
//      it was actually created for.
//
// Limitation (documented, not hidden): the Base44 client SDK exposes no
// compare-and-swap / conditional-update primitive. Step 1 below shrinks the
// race window from "an entire client round trip + human click latency" down
// to "the gap between the read and the write inside this one function call,"
// which is a real improvement over the previous client-side implementation,
// but it is not a mathematically atomic guarantee. See the Phase 1 report
// for how to close this fully if Base44 ever exposes a conditional write.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { bookingId } = await req.json();
    if (!bookingId) {
      return Response.json({ error: 'bookingId is required' }, { status: 400 });
    }

    if (!['Contractor', 'Handyman'].includes(user.user_type)) {
      return Response.json({ error: 'Only providers can accept jobs' }, { status: 403 });
    }

    const booking = await base44.asServiceRole.entities.Booking.get(bookingId);
    if (!booking) {
      return Response.json({ error: 'Job not found' }, { status: 404 });
    }

    // Re-checked as late as possible, immediately before the write below.
    if (booking.status !== 'pending') {
      return Response.json(
        { error: 'This job is no longer available — it may have already been accepted.' },
        { status: 409 }
      );
    }

    const contractors = await base44.asServiceRole.entities.Contractor.filter({ created_by: user.email });
    const contractor = contractors[0];
    if (!contractor) {
      return Response.json({ error: 'Complete your provider profile before accepting jobs.' }, { status: 403 });
    }

    // Eligibility — kept logically identical to isProviderEligibleForJob() in src/lib/matching.js.
    const eligible = booking.contractor_id
      ? contractor.id === booking.contractor_id
      : !!booking.category && contractor.category === booking.category;

    if (!eligible) {
      return Response.json(
        {
          error: booking.contractor_id
            ? 'This job was booked directly for a different provider.'
            : "This job isn't in your service category.",
        },
        { status: 403 }
      );
    }

    const updated = await base44.asServiceRole.entities.Booking.update(bookingId, {
      status: 'on_the_way',
      accepted_by_email: user.email,
      accepted_by_name: user.full_name,
    });

    return Response.json({ success: true, booking: updated });
  } catch (error) {
    console.error('Error in acceptJob:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
