import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { review_id } = await req.json();

    if (!review_id) {
      return Response.json({ error: 'Missing review_id' }, { status: 400 });
    }

    // Get the review
    const review = await base44.asServiceRole.entities.Review.get(review_id);
    if (!review) {
      return Response.json({ error: 'Review not found' }, { status: 404 });
    }

    // Get the contractor
    const contractors = await base44.asServiceRole.entities.Contractor.filter({ id: review.contractor_id });
    if (!contractors.length) {
      return Response.json({ error: 'Contractor not found' }, { status: 404 });
    }
    const contractor = contractors[0];

    // Get the contractor's user email
    const users = await base44.asServiceRole.entities.User.filter({ id: contractor.created_by });
    if (!users.length) {
      console.log('Contractor user not found');
      return Response.json({ error: 'Contractor user not found' }, { status: 404 });
    }
    const contractorUser = users[0];

    // Send email notification
    const rating = review.rating || 0;
    const stars = '⭐'.repeat(rating);
    const emailBody = `
Hi ${contractor.name},

You've received a new ${rating}-star review from a customer!

${stars}

${review.comment ? `Review: "${review.comment}"` : 'No comment provided'}

${review.reviewer_name ? `From: ${review.reviewer_name}` : ''}

Check out your profile to see all your reviews and keep building your reputation!

Best regards,
The Linked Team
    `.trim();

    await base44.asServiceRole.integrations.Core.SendEmail({
      to: contractorUser.email,
      subject: `New ${rating}-Star Review on Linked!`,
      body: emailBody,
      from_name: 'Linked',
    });

    console.log(`Review notification sent to ${contractorUser.email}`);
    return Response.json({ success: true });
  } catch (error) {
    console.error('Error sending review notification:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});