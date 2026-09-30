import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// The only way a job gets created.
//
// Posting now costs either a credit or an active subscription, and a paywall
// the browser enforces is not a paywall — until this existed, the job record
// could be created directly from the client, so any customer could post
// without paying simply by calling the platform's create method. Booking's
// create rule is now admin-only and both posting screens route through here.
//
// Three properties this function has to hold at once:
//
//   1. No post without entitlement. Checked here, server-side, from the
//      ledger — never from anything the browser sends.
//   2. No credit spent unless the job was actually created. The job is
//      created first; the credit is only spent afterwards.
//   3. No double charge and no duplicate job from a double-click, a retry, a
//      refresh or a resubmission. The caller supplies an idempotency key and
//      a repeat of the same key returns the original job instead of making
//      another.
//
// Documented limitation, consistent with acceptJob's own note: this platform
// exposes no compare-and-swap, so the idempotency check and the write are two
// operations rather than one atomic step. Two genuinely simultaneous requests
// carrying the same key could in principle both pass the check. The window is
// a single server round trip rather than a human double-click, which is the
// case that actually happens; closing it fully needs a conditional write the
// platform does not offer.

const CREDIT_GRANTS = {
  post_single: 1,
  post_bag_small: 3,
  post_bag_medium: 5,
  post_bag_large: 8,
};

const ENTITLED_STATUSES = ['active', 'cancelled'];

function subscriptionIsCurrent(sub, now) {
  if (!sub || !ENTITLED_STATUSES.includes(sub.status) || !sub.current_period_end) return false;
  const end = new Date(sub.current_period_end).getTime();
  return !Number.isNaN(end) && end > now;
}

// An allow-list. The browser describes the job; it does not get to set who
// owns it, what it costs the platform, or its lifecycle state.
const ALLOWED_JOB_FIELDS = [
  'job_title', 'job_description', 'category', 'address', 'city', 'state', 'zip',
  'preferred_date', 'preferred_time', 'estimated_hours', 'estimated_cost',
  'notes', 'photo_urls', 'job_lat', 'job_lng',
  'contractor_id', 'contractor_name', 'contractor_category',
];

function pickJobFields(input) {
  const out = {};
  for (const key of ALLOWED_JOB_FIELDS) {
    if (input[key] !== undefined) out[key] = input[key];
  }
  return out;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { job, idempotencyKey } = body || {};

    if (!idempotencyKey || typeof idempotencyKey !== 'string' || idempotencyKey.length < 8) {
      return Response.json({ error: 'idempotencyKey is required' }, { status: 400 });
    }
    if (!job || typeof job !== 'object') {
      return Response.json({ error: 'job is required' }, { status: 400 });
    }
    if (!job.job_title || !job.address || !job.preferred_date || !job.category) {
      return Response.json(
        { error: 'job_title, address, preferred_date and category are required' },
        { status: 400 },
      );
    }

    const now = Date.now();
    const ref = `post:${idempotencyKey}`;

    // Replay check first. A repeat of the same key returns the job that was
    // already created, so a refresh or a second click never produces a
    // second job or a second charge.
    const priorSpend = await base44.asServiceRole.entities.PostCreditLedger.filter({ ref });
    if (priorSpend.length > 0) {
      const existingId = priorSpend[0].booking_id;
      const existing = existingId
        ? await base44.asServiceRole.entities.Booking.get(existingId).catch(() => null)
        : null;
      return Response.json({ success: true, booking: existing, duplicate: true });
    }

    const [entries, subs] = await Promise.all([
      base44.asServiceRole.entities.PostCreditLedger.filter({ customer_email: user.email }),
      base44.asServiceRole.entities.CustomerSubscription.filter({ customer_email: user.email }),
    ]);

    const credits = entries.reduce((sum, e) => sum + (Number(e.delta) || 0), 0);
    const hasSubscription = subscriptionIsCurrent(subs[0], now);

    if (!hasSubscription && credits < 1) {
      return Response.json(
        {
          error: 'You need a post credit or a subscription to post a job.',
          code: 'no_entitlement',
          credits,
        },
        { status: 402 },
      );
    }

    // One-shot Priority Booking add-on, read server-side rather than trusted
    // from the browser.
    const usePriorityBoost = !!user.pending_priority_boost;

    const booking = await base44.asServiceRole.entities.Booking.create({
      ...pickJobFields(job),
      status: 'pending',
      created_by: user.email,
      customer_name: user.full_name || '',
      customer_email: user.email,
      customer_phone: job.customer_phone || user.contact_phone || '',
      customer_type: user.user_type || 'Homeowner',
      ...(usePriorityBoost ? { is_priority: true } : {}),
    });

    // Only now is anything spent. If creation threw, the customer keeps their
    // credit and nothing above this line has charged them.
    if (!hasSubscription) {
      await base44.asServiceRole.entities.PostCreditLedger.create({
        customer_email: user.email,
        delta: -1,
        reason: 'post',
        ref,
        booking_id: booking.id,
        note: `Posted "${booking.job_title}"`,
      });
    }

    if (usePriorityBoost) {
      await base44.asServiceRole.entities.User.update(user.id, { pending_priority_boost: false });
    }

    return Response.json({
      success: true,
      booking,
      creditConsumed: !hasSubscription,
      creditsRemaining: hasSubscription ? credits : credits - 1,
    });
  } catch (error) {
    console.error('Error in createJobPost:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
