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

    // Legacy provider plans still live on the user record. Left in place so
    // an existing subscriber's cancellation keeps behaving exactly as before.
    await base44.asServiceRole.entities.User.update(user.id, { plan: 'free' });

    // Customer posting subscriptions live in their own record. Cancelling
    // marks it cancelled but deliberately does NOT clear current_period_end:
    // the email below promises access until the end of the paid period, and
    // the entitlement check honours a cancelled subscription until that date.
    // Wiping the date here would cut access off immediately and contradict
    // what the customer was just told.
    const subs = await base44.asServiceRole.entities.CustomerSubscription.filter({
      customer_email: user.email,
    });
    for (const sub of subs) {
      if (sub.status === 'cancelled') continue; // already done; stay idempotent
      await base44.asServiceRole.entities.CustomerSubscription.update(sub.id, {
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
      });
    }

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