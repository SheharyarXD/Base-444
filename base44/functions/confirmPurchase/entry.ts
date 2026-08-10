import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Replaces the old grantRealtorPro function, which the Phase 0 re-audit found
// granted its plan to *any* authenticated caller with zero proof of payment —
// live, exploitable, and (separately) unused by any UI, since no Plans.jsx
// card even sells "realtor_pro" today. That whole class of bug — ThankYou.jsx
// also used to grant plans straight from a client-visible `?plan=` URL query
// param — is closed here structurally, not just patched at one call site.
//
// How this closes it without depending on Wix's private order-verification
// API (which this repo has no live sandbox to test against): createCheckout
// mints an unguessable, single-use `token` server-side, stores it in a
// PurchaseIntent row bound to the specific user + plan_id *before* redirecting
// to Wix, and embeds it in `thankYouPageUrl`. Wix's hosted checkout only ever
// redirects the browser there after a completed payment (standard behavior
// for hosted-checkout flows) — so a caller can no longer reach an entitlement
// by typing the thank-you URL directly or invoking a grant function with no
// arguments, because they'd need a token that was never exposed anywhere
// except that post-payment redirect, and this function consumes it exactly
// once.
//
// Documented residual limitation: this assumes Wix's redirect-only-on-success
// behavior holds, which is the standard contract for hosted checkout but has
// not been independently verified against a live Wix account from this repo.
// A fully airtight close would add server-to-server Wix webhook confirmation
// as a second factor — that requires Wix webhook credentials/setup this repo
// does not have today. Documented here rather than silently assumed solid.
//
// PLANS mirrors createCheckout/entry.ts's table (kept in sync manually, same
// as that file already documents for its own relationship to Plans.jsx) —
// only entries that exist here are grantable, which is also why "realtor_pro"
// (no longer sold anywhere) can no longer be granted through any path at all.
const PLANS = {
  priority_booking: { isSubscription: false },
  verified_pro: { isSubscription: false },
  handyman_pro: { isSubscription: true },
  featured_listing: { isSubscription: false },
  business_pro: { isSubscription: true },
};

const FEATURED_LISTING_DAYS = 7;

async function grantEntitlement(base44, user, planId) {
  switch (planId) {
    case 'priority_booking':
      await base44.asServiceRole.entities.User.update(user.id, { pending_priority_boost: true });
      return;
    case 'handyman_pro':
    case 'business_pro':
      await base44.asServiceRole.entities.User.update(user.id, { plan: planId });
      return;
    case 'verified_pro': {
      const contractors = await base44.asServiceRole.entities.Contractor.filter({ created_by: user.email });
      const contractor = contractors[0];
      if (contractor) {
        await base44.asServiceRole.entities.Contractor.update(contractor.id, { is_verified_pro: true });
      }
      return;
    }
    case 'featured_listing': {
      const contractors = await base44.asServiceRole.entities.Contractor.filter({ created_by: user.email });
      const contractor = contractors[0];
      if (contractor) {
        const featuredUntil = new Date(Date.now() + FEATURED_LISTING_DAYS * 24 * 60 * 60 * 1000).toISOString();
        await base44.asServiceRole.entities.Contractor.update(contractor.id, { featured_until: featuredUntil });
      }
      return;
    }
    default:
      throw new Error(`No grant behavior defined for plan "${planId}"`);
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { token } = await req.json();
    if (!token) {
      return Response.json({ error: 'token is required' }, { status: 400 });
    }

    const intents = await base44.asServiceRole.entities.PurchaseIntent.filter({ token });
    const intent = intents[0];

    // Fails closed: no matching token, wrong owner, or already-consumed
    // token all produce the same "nothing granted" outcome.
    if (!intent || intent.user_email !== user.email || intent.status !== 'pending') {
      return Response.json({ error: 'Invalid or already-used purchase confirmation.' }, { status: 403 });
    }

    if (!PLANS[intent.plan_id]) {
      return Response.json({ error: 'Unknown plan on this purchase intent.' }, { status: 400 });
    }

    // Marked completed before granting so a retried/duplicate call can never
    // grant twice, even if grantEntitlement partially fails and this handler
    // is invoked again for the same token.
    await base44.asServiceRole.entities.PurchaseIntent.update(intent.id, { status: 'completed' });
    await grantEntitlement(base44, user, intent.plan_id);

    return Response.json({ success: true, plan_id: intent.plan_id });
  } catch (error) {
    console.error('Error in confirmPurchase:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
