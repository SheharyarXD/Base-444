// Shared provider/job eligibility predicate.
//
// NOTE on duplication: this same logic is re-implemented (not imported) in
// base44/functions/acceptJob/entry.ts, which is the actual enforcement point.
// Every other function in base44/functions/ only imports `npm:` packages —
// none import a relative file from src/ — so there's no proven pattern in
// this codebase for sharing a module across the Deno function boundary and
// the Vite frontend build. This file is the source of truth for the
// *frontend* (JobsMap's client-side "don't even show it" filter, and unit
// tests); the copy inside acceptJob/entry.ts is the source of truth for
// actual enforcement and must be kept logically identical to this one.
export function isProviderEligibleForJob(contractor, booking) {
  if (!contractor || !booking) return false;

  // Direct booking: only the specifically-targeted contractor may accept it.
  if (booking.contractor_id) {
    return contractor.id === booking.contractor_id;
  }

  // Open job post: any contractor whose category matches may accept it.
  return !!booking.category && contractor.category === booking.category;
}
