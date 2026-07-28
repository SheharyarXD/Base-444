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
});
