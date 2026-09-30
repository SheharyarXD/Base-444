import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Phase 0 re-audit found this only ever cleaned up rows the user directly
// created/sent — it never touched their Contractor listing, so a deleted
// user's profile stayed live and publicly bookable (Contractor.read RLS is
// fully public) with no account behind it to ever respond. It also left
// Reminder rows addressed to them and Message rows where they were only the
// recipient (not sender) as orphaned data. All four are now cleaned up.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get all user data to delete
    const [bookings, reviews, sentMessages, receivedMessages, contractors, reminders, acceptedBookings] = await Promise.all([
      base44.asServiceRole.entities.Booking.filter({ created_by: user.email }),
      base44.asServiceRole.entities.Review.filter({ created_by: user.email }),
      base44.asServiceRole.entities.Message.filter({ sender_email: user.email }),
      base44.asServiceRole.entities.Message.filter({ recipient_email: user.email }),
      base44.asServiceRole.entities.Contractor.filter({ created_by: user.email }),
      base44.asServiceRole.entities.Reminder.filter({ recipient_email: user.email }),
      // Jobs this user ACCEPTED as a provider. These belong to the customer,
      // not to this user, so they must not be deleted — but Phase 3 stores
      // the provider's GPS coordinates on the customer's booking row, so
      // filtering only by created_by left a deleted provider's last known
      // position behind on someone else's record. That directly contradicted
      // the "all associated data deleted" message this function returns.
      base44.asServiceRole.entities.Booking.filter({ accepted_by_email: user.email }),
    ]);
    // A booking's chat can have messages from both sides — dedupe in case a
    // message satisfies both filters (shouldn't normally happen since
    // sender/recipient differ, but avoids a double-delete attempt either way).
    const messageIds = new Set([...sentMessages, ...receivedMessages].map(m => m.id));

    // Delete all associated data
    const deletePromises = [
      ...bookings.map(b => base44.asServiceRole.entities.Booking.delete(b.id)),
      ...reviews.map(r => base44.asServiceRole.entities.Review.delete(r.id)),
      ...[...messageIds].map(id => base44.asServiceRole.entities.Message.delete(id)),
      ...contractors.map(c => base44.asServiceRole.entities.Contractor.delete(c.id)),
      ...reminders.map(r => base44.asServiceRole.entities.Reminder.delete(r.id)),
      // Scrub, don't delete: the customer keeps their booking and its history,
      // but nothing of the departed provider's location survives on it.
      // NOTE (product decision, deliberately not invented here): what should
      // happen to a still-active job whose provider deletes their account —
      // auto-cancel, return to pending, or notify the customer — is not
      // specified anywhere in the current requirements. Flagged in the Phase 3
      // report rather than guessed at; this change is limited to the location
      // data, which is unambiguously covered by the deletion promise.
      ...acceptedBookings
        .filter(b => b.created_by !== user.email)
        .map(b => base44.asServiceRole.entities.Booking.update(b.id, {
          contractor_lat: null,
          contractor_lng: null,
          contractor_location_updated_at: null,
          contractor_location_accuracy_m: null,
        })),
    ];

    if (deletePromises.length > 0) {
      await Promise.all(deletePromises);
    }

    // Delete the user account
    await base44.asServiceRole.entities.User.delete(user.id);
    
    return Response.json({ 
      success: true, 
      message: 'Account and all associated data deleted successfully' 
    });
  } catch (error) {
    console.error('Account deletion error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});