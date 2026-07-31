import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Server-side foundation for contractor license/LLC/EIN verification.
//
// Why this exists instead of the client just calling
// Contractor.update(id, { verification_status: ... }) directly: Base44's RLS
// here is row-level (an owner can update any field on their own Contractor
// row), not field-level, so nothing stops a client from setting their own
// verification_status straight to 'verified' if we let the UI write that
// field directly. This function is the one sanctioned path — it always
// derives verification_status itself (from the pluggable provider result,
// currently always the manual-review fallback) and ignores any status the
// client might send.
//
// Known residual limitation (documented, not hidden — same class as
// acceptJob's non-atomicity note): because Contractor's RLS still permits an
// owner to PATCH the row directly, a technically sophisticated actor could
// still bypass this function and write verification_status themselves via
// the raw entities API. Fully closing that would require either field-level
// RLS (not available on this platform today) or moving verification onto a
// separate service-role-only entity — a valid future refactor, not done
// here since the current spec asks for these fields on the Contractor
// entity itself.
//
// No state-specific validation lives here — see src/lib/verification for
// the generic (non-state-specific) validation rules and the pluggable
// per-state provider abstraction this mirrors.
const EIN_PATTERN = /^\d{2}-?\d{7}$/;
const US_STATES = new Set([
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
]);

function validate({ licenseNumber, state, businessName, einNumber }) {
  const errors: Record<string, string> = {};

  const trimmedLicense = (licenseNumber || '').trim();
  if (!trimmedLicense) errors.licenseNumber = 'License number is required.';
  else if (trimmedLicense.length > 50) errors.licenseNumber = 'License number is too long.';

  if (!state || !US_STATES.has(state)) errors.state = 'Select a valid US state.';

  const trimmedBusinessName = (businessName || '').trim();
  if (!trimmedBusinessName) errors.businessName = 'Business name is required.';
  else if (trimmedBusinessName.length > 200) errors.businessName = 'Business name is too long.';

  const trimmedEin = (einNumber || '').trim();
  if (trimmedEin && !EIN_PATTERN.test(trimmedEin)) errors.einNumber = 'EIN should look like 12-3456789.';

  return errors;
}

// Manual-review fallback — mirrors src/lib/verification/providers.js's
// ManualReviewProvider. No automated per-state provider is wired up yet;
// see that module for how one would plug in.
function runVerification({ state }) {
  return {
    status: 'pending',
    notes: `Awaiting manual review — automated verification is not yet available for ${state || 'this state'}.`,
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!['Contractor', 'Handyman'].includes(user.user_type)) {
      return Response.json({ error: 'Only providers can submit verification.' }, { status: 403 });
    }

    const body = await req.json();
    const errors = validate(body);
    if (Object.keys(errors).length > 0) {
      return Response.json({ error: 'Invalid submission', fieldErrors: errors }, { status: 400 });
    }

    const contractors = await base44.asServiceRole.entities.Contractor.filter({ created_by: user.email });
    const contractor = contractors[0];
    if (!contractor) {
      return Response.json({ error: 'Complete your provider profile before submitting verification.' }, { status: 403 });
    }

    const { licenseNumber, state, businessName, einNumber } = body;
    const result = runVerification({ licenseNumber, state, businessName, einNumber });

    const updated = await base44.asServiceRole.entities.Contractor.update(contractor.id, {
      license_number: licenseNumber.trim(),
      state,
      business_name: businessName.trim(),
      ein_number: einNumber ? einNumber.trim() : '',
      // Server-derived, never trusts whatever the client sent for these:
      verification_status: result.status,
      verification_submitted_date: new Date().toISOString(),
      verification_notes: result.notes || '',
    });

    return Response.json({ success: true, contractor: updated });
  } catch (error) {
    console.error('Error in submitContractorVerification:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
