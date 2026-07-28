import { describe, it, expect } from "vitest";
import { canViewFullJobDetails, maskedCityStateZip } from "./jobPrivacy";

const booking = {
  customer_email: "customer@x.com",
  accepted_by_email: null,
  city: "Springfield",
  state: "IL",
  zip: "62701",
};

describe("canViewFullJobDetails", () => {
  it("grants the customer full details even before acceptance", () => {
    expect(canViewFullJobDetails(booking, "customer@x.com")).toBe(true);
  });

  it("denies a browsing provider who hasn't accepted the job", () => {
    expect(canViewFullJobDetails(booking, "provider@x.com")).toBe(false);
  });

  it("grants the provider once they've accepted", () => {
    const accepted = { ...booking, accepted_by_email: "provider@x.com" };
    expect(canViewFullJobDetails(accepted, "provider@x.com")).toBe(true);
  });

  it("denies a different provider even after someone else has accepted", () => {
    const accepted = { ...booking, accepted_by_email: "provider@x.com" };
    expect(canViewFullJobDetails(accepted, "someone-else@x.com")).toBe(false);
  });

  it("denies when booking or viewerEmail is missing", () => {
    expect(canViewFullJobDetails(null, "customer@x.com")).toBe(false);
    expect(canViewFullJobDetails(booking, null)).toBe(false);
  });
});

describe("maskedCityStateZip", () => {
  it("formats city, state, zip without the street address", () => {
    expect(maskedCityStateZip(booking)).toBe("Springfield, IL 62701");
  });

  it("degrades gracefully when some fields are missing", () => {
    expect(maskedCityStateZip({ city: "Springfield" })).toBe("Springfield");
    expect(maskedCityStateZip({ state: "IL", zip: "62701" })).toBe("IL 62701");
    expect(maskedCityStateZip({})).toBe("");
  });

  it("never includes the street address even if present on the object", () => {
    const withAddress = { ...booking, address: "742 Evergreen Terrace" };
    expect(maskedCityStateZip(withAddress)).not.toContain("Evergreen");
  });
});
