import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// One-time admin utility: backfills `recipient_email` on Message rows that
// predate that field's introduction. Message.jsonc's `read` RLS used to only
// allow `sender_email == self`, which meant neither party in a booking's
// chat could ever read the other's messages — recipient_email + an updated
// RLS clause fixed that going forward, but existing rows created before the
// fix have no recipient_email and stay one-sided-readable until backfilled.
// Safe to run more than once — already-backfilled rows are skipped.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (user.role !== 'admin') {
      return Response.json({ error: 'Admin only' }, { status: 403 });
    }

    const allMessages = await base44.asServiceRole.entities.Message.filter({}, '-created_date', 10000);
    const missing = allMessages.filter((m) => !m.recipient_email);

    const bookingCache = new Map();
    async function getBooking(bookingId) {
      if (bookingCache.has(bookingId)) return bookingCache.get(bookingId);
      const booking = await base44.asServiceRole.entities.Booking.get(bookingId).catch(() => null);
      bookingCache.set(bookingId, booking);
      return booking;
    }

    let updated = 0;
    let skippedNoBooking = 0;
    let skippedUndeterminable = 0;

    for (const message of missing) {
      const booking = await getBooking(message.booking_id);
      if (!booking) {
        skippedNoBooking++;
        continue;
      }

      const isFromCustomer = message.sender_email === booking.customer_email;
      const recipient_email = isFromCustomer ? booking.accepted_by_email : booking.customer_email;

      // A pending, never-accepted booking has no fixed counterpart yet for
      // customer-authored messages — nothing safe to backfill, leave as is.
      if (!recipient_email) {
        skippedUndeterminable++;
        continue;
      }

      await base44.asServiceRole.entities.Message.update(message.id, { recipient_email });
      updated++;
    }

    return Response.json({
      success: true,
      scanned: allMessages.length,
      missingRecipient: missing.length,
      updated,
      skippedNoBooking,
      skippedUndeterminable,
    });
  } catch (error) {
    console.error('Error in backfillMessageRecipients:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
