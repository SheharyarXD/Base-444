import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Update user to remove subscription plan
    await base44.auth.updateMe({ 
      realtor_pro: null,
      realtor_pro_activated_at: null 
    });

    // Send cancellation email notification
    await base44.asServiceRole.integrations.Core.SendEmail({
      to: user.email,
      subject: 'Your Instant subscription has been cancelled',
      body: `Hi ${user.full_name || 'there'},\n\nYour subscription has been successfully cancelled. Your plan will remain active until the end of the current billing period.\n\nIf you have any questions or cancelled by mistake, you can resubscribe at any time from the Plans page.\n\nThank you for using Instant.\n\nThe Instant Team`
    });

    return Response.json({ 
      success: true, 
      message: 'Subscription cancelled successfully' 
    });
  } catch (error) {
    console.error('Subscription cancellation error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});