import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { event } = await req.json();

    if (event.type !== 'create') {
      return Response.json({ message: 'Not a create event' });
    }

    const booking = event.data;
    const jobZip = booking.zip;

    if (!jobZip) {
      console.log('No zip code in booking');
      return Response.json({ message: 'No zip code' });
    }

    if (!booking.category) {
      console.log('No category on booking — skipping notification');
      return Response.json({ message: 'No category on booking' });
    }

    // Find contractors in the job's category with this preferred zip code.
    const contractors = await base44.asServiceRole.entities.Contractor.filter({
      preferred_zip_code: jobZip,
      category: booking.category
    }, '-created_date', 100);

    if (contractors.length === 0) {
      console.log(`No ${booking.category} contractors found for zip ${jobZip}`);
      return Response.json({ message: 'No matching contractors for this zip/category' });
    }

    // Get user details for each contractor to send email
    const notificationPromises = contractors.map(async (contractor) => {
      try {
        const contractorUser = await base44.asServiceRole.entities.User.filter(
          { email: contractor.created_by },
          '-created_date',
          1
        );

        if (contractorUser.length === 0) return null;

        const user = contractorUser[0];

        // Send email notification
        await base44.asServiceRole.integrations.Core.SendEmail({
          to: user.email,
          subject: `New Job Posted in ${booking.city}, ${booking.state}`,
          body: `A new job has been posted in your preferred area (${jobZip})!\n\nJob: ${booking.job_title}\nCategory: ${booking.category}\nAddress: ${booking.address}, ${booking.city}, ${booking.state}\nDate: ${booking.preferred_date}\nTime: ${booking.preferred_time}\n\nLog in to Linked to view and accept this job.`
        });

        console.log(`Notification sent to ${user.email}`);
        return user.email;
      } catch (error) {
        console.error(`Error notifying contractor: ${error.message}`);
        return null;
      }
    });

    await Promise.all(notificationPromises);

    return Response.json({ 
      message: 'Notifications sent',
      contractorsNotified: contractors.length
    });
  } catch (error) {
    console.error(`Error in notifyContractorsOfNewJob: ${error.message}`);
    return Response.json({ error: error.message }, { status: 500 });
  }
});