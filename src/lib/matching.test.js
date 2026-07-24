import { describe, it, expect } from "vitest";
import { isProviderEligibleForJob } from "./matching";

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
