// Contractor license/LLC/EIN verification — validation + provider lookup.
// See providers.js for the pluggable per-state automated-verification
// abstraction. Deliberately has NO state-specific format rules (license
// number formats vary by state and licensing board in ways that would be
// wrong to hardcode) — only generic, structural checks.
import { US_STATES } from "../usStates";
import { getVerificationProvider } from "./providers";

export { getVerificationProvider, PROVIDERS, ManualReviewProvider } from "./providers";

export const VERIFICATION_STATUS = {
  NOT_SUBMITTED: "not_submitted",
  PENDING: "pending",
  VERIFIED: "verified",
  REJECTED: "rejected",
};

export const VERIFICATION_STATUS_LABELS = {
  [VERIFICATION_STATUS.NOT_SUBMITTED]: "Not Submitted",
  [VERIFICATION_STATUS.PENDING]: "Pending Review",
  [VERIFICATION_STATUS.VERIFIED]: "Verified",
  [VERIFICATION_STATUS.REJECTED]: "Rejected",
};

// Federal EIN format (NN-NNNNNNN) — this is a single nationwide IRS
// standard, not a per-state rule, so checking its shape is fine.
const EIN_PATTERN = /^\d{2}-?\d{7}$/;

/**
 * Validates a verification submission generically (no per-state license
 * format rules). Returns { valid, errors } where errors is a map of
 * field -> message for any invalid/missing field.
 * @param {{ licenseNumber?: string, state?: string, businessName?: string, einNumber?: string }} [input]
 */
export function validateVerificationSubmission({ licenseNumber, state, businessName, einNumber } = {}) {
  const errors = {};

  const trimmedLicense = (licenseNumber || "").trim();
  if (!trimmedLicense) {
    errors.licenseNumber = "License number is required.";
  } else if (trimmedLicense.length > 50) {
    errors.licenseNumber = "License number is too long.";
  }

  if (!state || !US_STATES.includes(state)) {
    errors.state = "Select a valid US state.";
  }

  const trimmedBusinessName = (businessName || "").trim();
  if (!trimmedBusinessName) {
    errors.businessName = "Business name is required.";
  } else if (trimmedBusinessName.length > 200) {
    errors.businessName = "Business name is too long.";
  }

  const trimmedEin = (einNumber || "").trim();
  if (trimmedEin && !EIN_PATTERN.test(trimmedEin)) {
    errors.einNumber = "EIN should look like 12-3456789.";
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

/**
 * Runs whatever verification is currently possible for the given state.
 * Today this always resolves to the manual-review provider (status:
 * 'pending') since no automated backend exists yet — see providers.js for
 * how a future per-state integration plugs in without changing this call
 * site.
 */
export async function runVerification(input) {
  const provider = getVerificationProvider(input.state);
  return provider.verify(input);
}
