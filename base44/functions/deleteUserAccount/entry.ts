import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get all user data to delete
    const [bookings, reviews, messages] = await Promise.all([
      base44.asServiceRole.entities.Booking.filter({ created_by: user.email }),
      base44.asServiceRole.entities.Review.filter({ created_by: user.email }),
      base44.asServiceRole.entities.Message.filter({ sender_email: user.email }),
    ]);

    // Delete all associated data
    const deletePromises = [
      ...bookings.map(b => base44.asServiceRole.entities.Booking.delete(b.id)),
      ...reviews.map(r => base44.asServiceRole.entities.Review.delete(r.id)),
      ...messages.map(m => base44.asServiceRole.entities.Message.delete(m.id)),
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