import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// The authoritative answer to "can this customer post, and what will it cost
// them?" Everything the posting screen and the billing screen display comes
// from here.
//
// The balance is summed from the ledger rather than read from a stored
// number. A stored balance would be one field on one record, which is both
// losable to a concurrent update and — if it lived on the user account
// record, which has no access rules of its own — grantable by the customer
// to themselves. Summing an admin-write-only ledger has neither problem.

// A cancelled subscription keeps access until the period it was paid for
// actually ends, which is what the cancellation email promises.
const ENTITLED_STATUSES = ['active', 'cancelled'];

function subscriptionIsCurrent(sub, now) {
  if (!sub) return false;
  if (!ENTITLED_STATUSES.includes(sub.status)) return false;
  if (!sub.current_period_end) return false;
  const end = new Date(sub.current_period_end).getTime();
  if (Number.isNaN(end)) return false;
  return end > now;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const now = Date.now();

    const [entries, subs] = await Promise.all([
      base44.asServiceRole.entities.PostCreditLedger.filter({ customer_email: user.email }),
      base44.asServiceRole.entities.CustomerSubscription.filter({ customer_email: user.email }),
    ]);

    const credits = entries.reduce((sum, e) => sum + (Number(e.delta) || 0), 0);
    const subscription = subs[0] || null;
    const hasSubscription = subscriptionIsCurrent(subscription, now);

    // History for the billing screen. Only this customer's own movements are
    // ever read, and nothing payment-sensitive is stored to begin with — the
    // payment provider holds the card details, never this application.
    const history = entries
      .map((e) => ({
        id: e.id,
        delta: Number(e.delta) || 0,
        reason: e.reason,
        product_id: e.product_id || null,
        booking_id: e.booking_id || null,
        note: e.note || '',
        created_date: e.created_date,
      }))
      .sort((a, b) => new Date(b.created_date || 0).getTime() - new Date(a.created_date || 0).getTime())
      .slice(0, 50);

    return Response.json({
      credits,
      // A subscription means posting spends no credit at all.
      canPost: hasSubscription || credits > 0,
      willConsumeCredit: !hasSubscription && credits > 0,
      subscription: subscription
        ? {
            plan_id: subscription.plan_id,
            status: subscription.status,
            active: hasSubscription,
            current_period_end: subscription.current_period_end || null,
            cancelled_at: subscription.cancelled_at || null,
          }
        : null,
      history,
    });
  } catch (error) {
    console.error('Error in getPostEntitlement:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
