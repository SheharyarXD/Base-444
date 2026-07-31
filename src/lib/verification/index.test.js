import { describe, it, expect } from "vitest";
import { validateVerificationSubmission, runVerification, VERIFICATION_STATUS } from "./index";
import { getVerificationProvider, ManualReviewProvider, PROVIDERS } from "./providers";

const validInput = {
  licenseNumber: "2705123456",
  state: "VA",
  businessName: "Smith's Plumbing LLC",
  einNumber: "12-3456789",
};

describe("validateVerificationSubmission", () => {
  it("accepts a fully valid submission", () => {
    const { valid, errors } = validateVerificationSubmission(validInput);
    expect(valid).toBe(true);
    expect(errors).toEqual({});
  });

  it("requires a license number", () => {
    const { valid, errors } = validateVerificationSubmission({ ...validInput, licenseNumber: "  " });
    expect(valid).toBe(false);
    expect(errors.licenseNumber).toBeTruthy();
  });

  it("requires a valid US state (no per-state format assumed)", () => {
    const { valid, errors } = validateVerificationSubmission({ ...validInput, state: "ZZ" });
    expect(valid).toBe(false);
    expect(errors.state).toBeTruthy();
  });

  it("requires a business name", () => {
    const { valid, errors } = validateVerificationSubmission({ ...validInput, businessName: "" });
    expect(valid).toBe(false);
    expect(errors.businessName).toBeTruthy();
  });

  it("does not require an EIN (optional field)", () => {
    const { valid } = validateVerificationSubmission({ ...validInput, einNumber: "" });
    expect(valid).toBe(true);
  });

  it("validates EIN against the universal federal format when provided", () => {
    const { valid, errors } = validateVerificationSubmission({ ...validInput, einNumber: "not-an-ein" });
    expect(valid).toBe(false);
    expect(errors.einNumber).toBeTruthy();
  });

  it("accepts an EIN without the dash too", () => {
    const { valid } = validateVerificationSubmission({ ...validInput, einNumber: "123456789" });
    expect(valid).toBe(true);
  });

  it("never applies a per-state license-number format rule (same rules for every state)", () => {
    const states = ["VA", "CA", "TX", "NY", "WY"];
    for (const state of states) {
      const { valid } = validateVerificationSubmission({ ...validInput, state, licenseNumber: "ABC-123" });
      expect(valid).toBe(true);
    }
  });
});

describe("getVerificationProvider / providers registry", () => {
  it("falls back to the manual-review provider for any state, since none are automated yet", () => {
    for (const state of ["VA", "CA", "TX"]) {
      expect(getVerificationProvider(state)).toBe(ManualReviewProvider);
    }
  });

  it("is a registry a future provider can be unshifted onto without touching call sites", () => {
    expect(Array.isArray(PROVIDERS)).toBe(true);
    expect(PROVIDERS[PROVIDERS.length - 1]).toBe(ManualReviewProvider);
  });
});

describe("runVerification", () => {
  it("always resolves to 'pending' today (no automated backend wired up)", async () => {
    const result = await runVerification(validInput);
    expect(result.status).toBe(VERIFICATION_STATUS.PENDING);
    expect(result.notes).toContain("manual review");
  });

  it("never returns 'verified' or 'rejected' on its own — those require a real reviewer/future automated provider", async () => {
    const result = await runVerification(validInput);
    expect(result.status).not.toBe(VERIFICATION_STATUS.VERIFIED);
    expect(result.status).not.toBe(VERIFICATION_STATUS.REJECTED);
  });
});
