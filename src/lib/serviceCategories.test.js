import { describe, it, expect } from "vitest";
import { SERVICE_CATEGORIES } from "./serviceCategories";

describe("SERVICE_CATEGORIES", () => {
  it("has no duplicate entries", () => {
    expect(new Set(SERVICE_CATEGORIES).size).toBe(SERVICE_CATEGORIES.length);
  });

  it("includes all Phase 1 required categories", () => {
    for (const required of ["General Handyman", "Mobile Mechanic", "Mobile Detailer", "Lawn Care"]) {
      expect(SERVICE_CATEGORIES).toContain(required);
    }
  });

  it("preserves the original 10 legacy categories (no silent removals)", () => {
    const legacy = [
      "Plumbing", "Electrical", "Cleaning", "Painting", "Landscaping",
      "HVAC", "Carpentry", "Roofing", "General Handyman", "Moving",
    ];
    for (const cat of legacy) {
      expect(SERVICE_CATEGORIES).toContain(cat);
    }
  });

  it("includes every category from the client's expanded marketplace request", () => {
    // Merged additively on top of the existing list per product decision —
    // near-synonyms (Handymen/Mobile Mechanics/Mobile Detailers/Other
    // Service Businesses) are intentionally represented by their existing
    // counterparts (General Handyman/Mobile Mechanic/Mobile Detailer/Other)
    // rather than as duplicate categories; only genuinely new categories
    // were added.
    for (const required of ["Contractors", "Pressure Washing Services", "Lawn Care"]) {
      expect(SERVICE_CATEGORIES).toContain(required);
    }
  });

  it("has exactly 16 categories (14 legacy/Phase-1 + 2 newly added)", () => {
    expect(SERVICE_CATEGORIES).toHaveLength(16);
  });
});
