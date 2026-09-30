import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Redacted discovery for open jobs.
//
// Booking's read policy used to include a clause granting every signed-in user
// read access to any job while its status was "pending". That clause is what
// made map discovery work, but this platform's policies apply to whole rows,
// so it also handed out the customer's phone number, email address and exact
// street address for every open job — to anyone with an account. The interface
// showed only the general area, but that was presentation: the underlying
// record was fully readable, so anyone querying directly got the lot.
//
// This function replaces that clause. It reads jobs under the service role and
// returns only the fields a provider actually needs in order to decide whether
// to accept: what the work is, roughly where it is, when it is wanted, and
// what it pays. Contact details and the exact address are released by the
// existing policy once a provider accepts the job and becomes bound to it.
//
// Eligibility is applied here as well, because with the pending clause gone
// this is the enforcement point for what a provider may see. Kept logically
// identical to isProviderEligibleForJob() in src/lib/matching.js — the same
// mirroring constraint documented there applies.

const JOBS_LIMIT = 50;

// Coordinates are the exact address in another form: a house sits within a few
// metres of its geocode. Rounding to three decimals is roughly a 110 m grid —
// precise enough to place a marker and judge distance, not precise enough to
// identify which home it is. Exact coordinates arrive with the rest of the
// details once the job is accepted.
const COORD_PRECISION = 3;

function approximate(value: number | undefined | null) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Number(value.toFixed(COORD_PRECISION));
}

// An allow-list, not a block-list: a field added to Booking later is withheld
// by default rather than leaking because someone forgot to exclude it.
function redact(job) {
  return {
    id: job.id,
    job_title: job.job_title,
    job_description: job.job_description,
    category: job.category,
    customer_name: job.customer_name,
    customer_type: job.customer_type,
    // Deliberately absent: customer_email, customer_phone, address,
    // accepted_by_email, and the exact job_lat / job_lng.
    city: job.city,
    state: job.state,
    zip: job.zip,
    job_lat: approximate(job.job_lat),
    job_lng: approximate(job.job_lng),
    approximate_location: true,
    preferred_date: job.preferred_date,
    preferred_time: job.preferred_time,
    estimated_hours: job.estimated_hours,
    estimated_cost: job.estimated_cost,
    photo_urls: job.photo_urls || [],
    is_priority: !!job.is_priority,
    status: job.status,
    contractor_id: job.contractor_id || null,
    created_date: job.created_date,
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let bookingId = null;
    try {
      const body = await req.json();
      bookingId = body?.bookingId || null;
    } catch {
      // No body — return the full open-job list.
    }

    // Providers only ever see jobs they could actually take.
    let contractor = null;
    const isProvider = ['Contractor', 'Handyman'].includes(user.user_type);
    if (isProvider) {
      const contractors = await base44.asServiceRole.entities.Contractor.filter({ created_by: user.email });
      contractor = contractors[0] || null;
      if (!contractor) {
        // No provider profile yet — nothing is eligible, and returning every
        // open job here would reintroduce the exposure this function exists to
        // close.
        return Response.json({ jobs: [], profileIncomplete: true });
      }
    }

    const eligible = (job) => {
      if (!isProvider) return true;
      if (!contractor) return false;
      if (job.contractor_id) return contractor.id === job.contractor_id;
      return !!job.category && contractor.category === job.category;
    };

    if (bookingId) {
      const job = await base44.asServiceRole.entities.Booking.get(bookingId);
      if (!job) {
        return Response.json({ error: 'Job not found' }, { status: 404 });
      }
      // Only open jobs are discoverable this way. Once a job is accepted,
      // cancelled or completed it is reachable only by its participants
      // through the ordinary policy.
      if (job.status !== 'pending') {
        return Response.json({ error: 'This job is no longer open.' }, { status: 409 });
      }
      if (!eligible(job)) {
        return Response.json({ error: 'This job is not available to you.' }, { status: 403 });
      }
      return Response.json({ job: redact(job) });
    }

    const filter = isProvider && contractor?.category
      ? { status: 'pending', category: contractor.category }
      : { status: 'pending' };

    const raw = await base44.asServiceRole.entities.Booking.filter(filter, '-created_date', JOBS_LIMIT);
    const jobs = raw.filter(eligible).map(redact);

    return Response.json({ jobs });
  } catch (error) {
    console.error('Error in getOpenJobs:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
