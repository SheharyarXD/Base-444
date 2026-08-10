// Pluggable per-state license verification providers.
//
// Nothing in this codebase currently calls a real verification API — this
// registry exists so that when one becomes available (per-state Secretary
// of State business-entity search, a third-party aggregator, etc.), it can
// be dropped in as a new provider without touching the calling code in
// submitContractorVerification or the Contractor onboarding/profile UI.
//
// Design references provided by the client (NOT scraped, NOT integrated —
// reference only, for what a future provider's `verify()` might eventually
// call out to):
//   - https://www.llcuniversity.com/50-secretary-of-state-sos-business-entity-search/
//   - https://u-bidit.com/verify-contractors-licenses-in-all-50-states
//
/**
 * @typedef {Object} VerificationProvider
 * @property {string} id
 * @property {(state: string) => boolean} supports - whether this provider handles the given state
 * @property {(input: VerificationInput) => Promise<VerificationResult>} verify
 *
 * @typedef {Object} VerificationInput
 * @property {string} licenseNumber
 * @property {string} state
 * @property {string} businessName
 * @property {string} [einNumber]
 *
 * @typedef {Object} VerificationResult
 * @property {'pending'|'verified'|'rejected'} status
 * @property {string} [notes]
 */

/** @type {VerificationProvider} */
export const ManualReviewProvider = {
  id: "manual",
  // Catch-all: handles every state, since it's not actually automating
  // anything — it just puts the submission in a human-reviewable queue.
  supports() {
    return true;
  },
  async verify({ state }) {
    return {
      status: "pending",
      notes: `Awaiting manual review — automated verification is not yet available for ${state || "this state"}.`,
    };
  },
};

// Checked in order; the first provider whose supports(state) returns true
// wins. A future state-specific provider should be unshifted to the front
// of this array so it takes priority over the manual fallback for the
// state(s) it covers — e.g.:
//   PROVIDERS.unshift(VirginiaSCCProvider);
export const PROVIDERS = [ManualReviewProvider];

export function getVerificationProvider(state) {
  return PROVIDERS.find((provider) => provider.supports(state)) || ManualReviewProvider;
}
