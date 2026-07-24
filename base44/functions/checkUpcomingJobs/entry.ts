import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Get all accepted or on-the-way bookings
    const bookings = await base44.asServiceRole.entities.Booking.filter({
      status: { $in: ['accepted', 'on_the_way'] }
    });

    const now = new Date();

    for (const booking of bookings) {
      if (!booking.preferred_date || !booking.preferred_time || !booking.accepted_by_email) continue;

      // Parse job time
      const jobDate = new Date(booking.preferred_date);
      const timeMatch = booking.preferred_time.match(/(\d{1,2}):?(\d{2})?\s*(am|pm)?/i);
      
      let jobTime = new Date(booking.preferred_date);
      if (booking.preferred_time === 'Flexible') {
        continue; // Skip flexible times
      } else if (timeMatch) {
        // Handle ranges like "Morning (8am-12pm)"
        const match = booking.preferred_time.match(/(\d{1,2})(am|pm)/i);
        if (match) {
          let hours = parseInt(match[1]);
          const period = match[2].toLowerCase();
          if (period === 'pm' && hours !== 12) hours += 12;
          if (period === 'am' && hours === 12) hours = 0;
          jobTime.setHours(hours, 0, 0, 0);
        }
      } else {
        continue;
      }

      const diffMs = jobTime.getTime() - now.getTime();
      const diffMins = diffMs / 1000 / 60;

      // Check for 30-min notification
      if (diffMins > 29 && diffMins <= 30 && !booking.notified_30min) {
        await base44.asServiceRole.integrations.Core.SendEmail({
          to: booking.accepted_by_email,
          subject: '⏰ Reminder: Job in 30 minutes',
          body: `Hi ${booking.accepted_by_name || 'Contractor'},\n\nThis is a reminder that your job "${booking.job_title}" is scheduled in 30 minutes.\n\nTime: ${booking.preferred_time}\nLocation: ${booking.address}, ${booking.city}, ${booking.state} ${booking.zip}\n\nSee you soon!`
        });
        await base44.asServiceRole.entities.Booking.update(booking.id, { notified_30min: true });
        console.log(`30-min notification sent to ${booking.accepted_by_email} for job ${booking.id}`);
      }

      // Check for 10-min notification
      if (diffMins > 9 && diffMins <= 10 && !booking.notified_10min) {
        await base44.asServiceRole.integrations.Core.SendEmail({
          to: booking.accepted_by_email,
          subject: '⏰ Reminder: Job in 10 minutes',
          body: `Hi ${booking.accepted_by_name || 'Contractor'},\n\nYour job "${booking.job_title}" is starting in 10 minutes!\n\nLocation: ${booking.address}, ${booking.city}, ${booking.state} ${booking.zip}\n\nMake sure you're on your way!`
        });
        await base44.asServiceRole.entities.Booking.update(booking.id, { notified_10min: true });
        console.log(`10-min notification sent to ${booking.accepted_by_email} for job ${booking.id}`);
      }
    }

    return Response.json({ success: true, checked: bookings.length });
  } catch (error) {
    console.error('Upcoming jobs check error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});