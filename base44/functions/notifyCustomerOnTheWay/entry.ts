import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { booking_id } = await req.json();

    if (!booking_id) {
      return Response.json({ error: 'booking_id is required' }, { status: 400 });
    }

    const booking = await base44.entities.Booking.get(booking_id);
    
    if (!booking || booking.status !== 'on_the_way') {
      return Response.json({ error: 'Booking not found or not on the way' }, { status: 404 });
    }

    // Send email to customer
    await base44.integrations.Core.SendEmail({
      to: booking.customer_email,
      subject: `${booking.accepted_by_name} is on the way to your job`,
      body: `Hi ${booking.customer_name},\n\n${booking.accepted_by_name} is now on the way to your job.\n\nJob: ${booking.job_title}\nAddress: ${booking.address}, ${booking.city}, ${booking.state} ${booking.zip}\n\nPlease make sure someone is home to greet them.\n\nBest regards,\nLinked`
    });

    return Response.json({ success: true, message: 'Customer notified' });
  } catch (error) {
    console.error('Error notifying customer:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});