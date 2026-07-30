import { describe, it, expect } from "vitest";
import { isProviderEligibleForJob, filterJobsForViewer } from "./matching";

const mechanic = { id: "c1", category: "Mobile Mechanic" };
const detailer = { id: "c2", category: "Mobile Detailer" };

describe("isProviderEligibleForJob", () => {
  it("accepts a matching category on an open job", () => {
    const job = { category: "Mobile Mechanic" };
    expect(isProviderEligibleForJob(mechanic, job)).toBe(true);
  });

  it("rejects a mismatched category on an open job", () => {
    const job = { category: "Mobile Mechanic" };
    expect(isProviderEligibleForJob(detailer, job)).toBe(false);
  });

  it("rejects an open job with no category set", () => {
    const job = {};
    expect(isProviderEligibleForJob(mechanic, job)).toBe(false);
  });

  it("accepts a direct booking for the targeted contractor, even if category differs", () => {
    const job = { contractor_id: "c1", category: "Mobile Detailer" };
    expect(isProviderEligibleForJob(mechanic, job)).toBe(true);
  });

  it("rejects a direct booking for a different contractor", () => {
    const job = { contractor_id: "c1", category: "Mobile Mechanic" };
    expect(isProviderEligibleForJob(detailer, job)).toBe(false);
  });

  it("rejects when contractor or booking is missing", () => {
    expect(isProviderEligibleForJob(null, { category: "Mobile Mechanic" })).toBe(false);
    expect(isProviderEligibleForJob(mechanic, null)).toBe(false);
  });

  // Newly added categories (client's expanded marketplace request) must
  // participate in eligibility exactly like every pre-existing category —
  // no special-casing anywhere in isProviderEligibleForJob's logic.
  it("matches the new 'Contractors' category on an open job", () => {
    const generalContractor = { id: "c4", category: "Contractors" };
    expect(isProviderEligibleForJob(generalContractor, { category: "Contractors" })).toBe(true);
    expect(isProviderEligibleForJob(generalContractor, { category: "Pressure Washing Services" })).toBe(false);
  });

  it("matches the new 'Pressure Washing Services' category on an open job", () => {
    const pressureWasher = { id: "c5", category: "Pressure Washing Services" };
    expect(isProviderEligibleForJob(pressureWasher, { category: "Pressure Washing Services" })).toBe(true);
    expect(isProviderEligibleForJob(pressureWasher, { category: "Contractors" })).toBe(false);
  });

  it("honors a direct booking to a new-category contractor regardless of the booking's stamped category", () => {
    const pressureWasher = { id: "c5", category: "Pressure Washing Services" };
    const job = { contractor_id: "c5", category: "Pressure Washing Services" };
    expect(isProviderEligibleForJob(pressureWasher, job)).toBe(true);
  });
});

// Regression coverage for the JobsMap PII leak found in the Phase 1 audit:
// a category-only query also matches direct bookings targeted at a
// *different* same-category contractor, which used to be shown as-is.
describe("filterJobsForViewer", () => {
  const openJobA = { id: "j1", category: "Mobile Mechanic" };
  const directBookingForC2 = { id: "j2", category: "Mobile Mechanic", contractor_id: "c2" };
  const directBookingForC1 = { id: "j3", category: "Mobile Mechanic", contractor_id: "c1" };
  const rawJobs = [openJobA, directBookingForC2, directBookingForC1];

  it("passes every job through unfiltered for a non-provider viewer (customers/other viewers)", () => {
    expect(filterJobsForViewer(rawJobs, null)).toEqual(rawJobs);
  });

  it("drops a direct booking meant for a different contractor in the same category", () => {
    const result = filterJobsForViewer(rawJobs, mechanic); // mechanic.id === "c1"
    const ids = result.map((j) => j.id);
    expect(ids).toContain("j1"); // open job — eligible
    expect(ids).toContain("j3"); // direct booking for this contractor — eligible
    expect(ids).not.toContain("j2"); // direct booking for someone else — must be dropped
  });

  it("returns an empty list for a viewer whose category matches nothing and who was targeted by nothing", () => {
    const otherCategoryContractor = { id: "c3", category: "Roofing" };
    expect(filterJobsForViewer(rawJobs, otherCategoryContractor)).toEqual([]);
  });

  it("correctly scopes a viewer in one of the newly added categories", () => {
    const pressureWasher = { id: "c5", category: "Pressure Washing Services" };
    const jobs = [
      { id: "j4", category: "Pressure Washing Services" },
      { id: "j5", category: "Contractors" },
      { id: "j6", category: "Pressure Washing Services", contractor_id: "someone-else" },
    ];
    const result = filterJobsForViewer(jobs, pressureWasher).map((j) => j.id);
    expect(result).toEqual(["j4"]);
  });
});
