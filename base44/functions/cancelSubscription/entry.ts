import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Reverts any subscription-type plan (handyman_pro, business_pro — realtor_pro
// is no longer sold, see confirmPurchase's header comment) back to 'free'.
// Previously wrote `realtor_pro`/`realtor_pro_activated_at`, fields that were
// never declared on User.jsonc (only `plan` is) — meaning cancellation never
// actually reverted anything. Fixed to write the real field.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await base44.asServiceRole.entities.User.update(user.id, { plan: 'free' });

    // Send cancellation email notification
    await base44.asServiceRole.integrations.Core.SendEmail({
      to: user.email,
      subject: 'Your Linked subscription has been cancelled',
      body: `Hi ${user.full_name || 'there'},\n\nYour subscription has been successfully cancelled. Your plan will remain active until the end of the current billing period.\n\nIf you have any questions or cancelled by mistake, you can resubscribe at any time from the Plans page.\n\nThank you for using Linked.\n\nThe Linked Team`
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