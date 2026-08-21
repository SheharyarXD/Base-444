import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Server-side foundation for the review system. Phase 0 re-audit found the
// review flow was non-functional in three separate ways: (1) nothing
// anywhere enforced one review per booking — the only working "Leave a
// Review" entry point (ContractorDetail.jsx) didn't even pass a booking_id;
// (2) nothing anywhere recomputed Contractor.rating/review_count when a
// review was created, so those fields were permanently stale regardless of
// how many real reviews existed; (3) the booking-gated review dialog
// (BookingDetail.jsx) had a props mismatch with ReviewForm and never
// actually opened. This function is now the one sanctioned way to create a
// Review — it owns eligibility (must be the booking's customer, booking must
// be completed), uniqueness (one review per booking_id), and the aggregate
// recompute, none of which the client is trusted to enforce on its own
// (Review's RLS is row-level only, same class of limitation documented in
// acceptJob/submitContractorVerification).
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { bookingId, rating, comment } = await req.json();
    if (!bookingId) {
      return Response.json({ error: 'bookingId is required' }, { status: 400 });
    }
    const numericRating = Number(rating);
    if (!Number.isFinite(numericRating) || numericRating < 1 || numericRating > 5) {
      return Response.json({ error: 'rating must be a number between 1 and 5' }, { status: 400 });
    }

    const booking = await base44.asServiceRole.entities.Booking.get(bookingId);
    if (!booking) {
      return Response.json({ error: 'Booking not found' }, { status: 404 });
    }
    if (booking.customer_email !== user.email) {
      return Response.json({ error: 'Only the customer on this booking can leave a review for it.' }, { status: 403 });
    }
    if (booking.status !== 'completed') {
      return Response.json({ error: 'You can only review a completed booking.' }, { status: 403 });
    }
    // A provider can only reach this line as "the customer" on their own
    // booking if they booked their own listing directly and then accepted
    // it themselves — nothing upstream (BookContractor.jsx, acceptJob)
    // currently stops that combination, so this is the one place that must
    // refuse to let it produce a self-review.
    if (booking.accepted_by_email && booking.accepted_by_email === user.email) {
      return Response.json({ error: 'You cannot review your own job.' }, { status: 403 });
    }

    const existing = await base44.asServiceRole.entities.Review.filter({ booking_id: bookingId });
    if (existing.length > 0) {
      return Response.json({ error: 'You already left a review for this booking.' }, { status: 409 });
    }

    // booking.contractor_id is only ever populated for a *direct* booking
    // (BookContractor.jsx) — a job posted open (PostJob.jsx) and picked up
    // via acceptJob never gets it set, acceptJob only stamps
    // accepted_by_email/accepted_by_name. Mirrors the same fallback lookup
    // BookingDetail.jsx already does client-side for the same reason.
    let contractorId = booking.contractor_id;
    if (!contractorId && booking.accepted_by_email) {
      const contractors = await base44.asServiceRole.entities.Contractor.filter({ created_by: booking.accepted_by_email });
      contractorId = contractors[0]?.id;
    }
    if (!contractorId) {
      return Response.json({ error: 'This booking has no contractor to review.' }, { status: 400 });
    }

    const review = await base44.asServiceRole.entities.Review.create({
      contractor_id: contractorId,
      booking_id: bookingId,
      reviewer_name: user.full_name || '',
      rating: numericRating,
      comment: (comment || '').trim(),
    });

    // Recomputed from the full live set of Review rows rather than
    // incremented against the stored Contractor.rating — that stored value
    // was already permanently stale before this function existed (nothing
    // had ever written it), so trusting it as a base for incremental math
    // would perpetuate whatever was already wrong. Recomputing from source
    // is self-healing and correct regardless of prior drift.
    const allReviews = await base44.asServiceRole.entities.Review.filter({ contractor_id: contractorId });
    const reviewCount = allReviews.length;
    const averageRating = reviewCount > 0
      ? allReviews.reduce((sum, r) => sum + (r.rating || 0), 0) / reviewCount
      : 0;

    await base44.asServiceRole.entities.Contractor.update(contractorId, {
      rating: Math.round(averageRating * 10) / 10,
      review_count: reviewCount,
    });

    return Response.json({ success: true, review });
  } catch (error) {
    console.error('Error in submitReview:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
