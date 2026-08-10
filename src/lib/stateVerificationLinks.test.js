import { describe, it, expect } from "vitest";
import { STATE_VERIFICATION_LINKS, getStateVerificationLinks } from "./stateVerificationLinks";
import { US_STATES } from "./usStates";

describe("stateVerificationLinks", () => {
  it("has an entry for every state in US_STATES", () => {
    for (const code of US_STATES) {
      expect(STATE_VERIFICATION_LINKS[code], `missing entry for ${code}`).toBeTruthy();
    }
  });

  it("has no entries for codes outside US_STATES (single source of truth stays in sync)", () => {
    const stateSet = new Set(US_STATES);
    for (const code of Object.keys(STATE_VERIFICATION_LINKS)) {
      expect(stateSet.has(code), `${code} is not in US_STATES`).toBe(true);
    }
  });

  it("every entry has a name, a business entity search URL, and a license board URL/label", () => {
    for (const [code, entry] of Object.entries(STATE_VERIFICATION_LINKS)) {
      expect(entry.name, `${code} missing name`).toBeTruthy();
      expect(entry.businessEntitySearchUrl, `${code} missing businessEntitySearchUrl`).toMatch(/^https:\/\//);
      expect(entry.licenseBoardUrl, `${code} missing licenseBoardUrl`).toMatch(/^https:\/\//);
      expect(entry.licenseBoardLabel, `${code} missing licenseBoardLabel`).toBeTruthy();
    }
  });

  it("getStateVerificationLinks returns the entry for a known state", () => {
    expect(getStateVerificationLinks("CA")?.name).toBe("California");
  });

  it("getStateVerificationLinks returns null for an unknown/missing code", () => {
    expect(getStateVerificationLinks("XX")).toBeNull();
    expect(getStateVerificationLinks(undefined)).toBeNull();
  });
});
