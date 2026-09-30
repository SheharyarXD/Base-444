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
  post_single: { isSubscription: false },
  post_bag_small: { isSubscription: false },
  post_bag_medium: { isSubscription: false },
  post_bag_large: { isSubscription: false },
  customer_monthly: { isSubscription: true },
  customer_annual: { isSubscription: true },
};

// How many credits each product grants. This is the authoritative grant —
// the browser names a product, never a quantity, so there is no number in the
// request that could be inflated. Mirrors POST_CREDIT_PRODUCTS in
// src/lib/pricing.js; src/lib/pricingSync.test.js fails if they drift.
const CREDIT_GRANTS = {
  post_single: 1,
  post_bag_small: 3,
  post_bag_medium: 5,
  post_bag_large: 8,
};

// Length of a paid subscription period. Slightly generous so a renewal that
// lands a few hours late does not briefly revoke access.
const SUBSCRIPTION_PERIOD_DAYS = {
  customer_monthly: 31,
  customer_annual: 366,
};

const FEATURED_LISTING_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Grants post credits by appending to the ledger.
 *
 * Idempotent on the purchase token: the token is what identifies this
 * movement, so a replayed confirmation finds the existing entry and adds
 * nothing. The token is already single-use at the intent level; this is a
 * second, independent guard, because granting credits twice is the failure
 * that costs real money.
 */
async function grantCredits(base44, user, productId, ref) {
  const credits = CREDIT_GRANTS[productId];
  if (!credits) throw new Error(`No credit grant defined for "${productId}"`);

  const existing = await base44.asServiceRole.entities.PostCreditLedger.filter({ ref });
  if (existing.length > 0) return;

  await base44.asServiceRole.entities.PostCreditLedger.create({
    customer_email: user.email,
    delta: credits,
    reason: 'purchase',
    ref,
    product_id: productId,
    note: `Purchased ${credits} post credit${credits === 1 ? '' : 's'}`,
  });
}

/**
 * Starts or renews a customer subscription.
 *
 * Also idempotent on the purchase token: a duplicate confirmation would
 * otherwise extend the paid period a second time for a single payment.
 */
async function grantSubscription(base44, user, planId, ref) {
  const days = SUBSCRIPTION_PERIOD_DAYS[planId];
  if (!days) throw new Error(`No subscription period defined for "${planId}"`);

  const now = new Date();
  const existing = await base44.asServiceRole.entities.CustomerSubscription.filter({
    customer_email: user.email,
  });
  const current = existing[0];

  if (current?.last_purchase_ref === ref) return; // already applied

  // A renewal arriving before the current period ends extends from that end,
  // so a customer never loses days they already paid for.
  const base = current?.current_period_end && new Date(current.current_period_end) > now
    ? new Date(current.current_period_end)
    : now;
  const periodEnd = new Date(base.getTime() + days * DAY_MS).toISOString();

  const payload = {
    customer_email: user.email,
    plan_id: planId,
    status: 'active',
    current_period_end: periodEnd,
    last_purchase_ref: ref,
    // Clearing this matters: a customer who cancelled and then resubscribed
    // would otherwise still look cancelled.
    cancelled_at: null,
  };

  if (current) {
    await base44.asServiceRole.entities.CustomerSubscription.update(current.id, payload);
    // Collapse any duplicates so a later read cannot pick a stale row.
    for (const dupe of existing.slice(1)) {
      await base44.asServiceRole.entities.CustomerSubscription.delete(dupe.id);
    }
  } else {
    await base44.asServiceRole.entities.CustomerSubscription.create({
      ...payload,
      started_at: now.toISOString(),
    });
  }
}

async function grantEntitlement(base44, user, planId, ref) {
  if (CREDIT_GRANTS[planId]) {
    await grantCredits(base44, user, planId, ref);
    return;
  }
  if (SUBSCRIPTION_PERIOD_DAYS[planId]) {
    await grantSubscription(base44, user, planId, ref);
    return;
  }
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
    await grantEntitlement(base44, user, intent.plan_id, token);

    return Response.json({ success: true, plan_id: intent.plan_id });
  } catch (error) {
    console.error('Error in confirmPurchase:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
