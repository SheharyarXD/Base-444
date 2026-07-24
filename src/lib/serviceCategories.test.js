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
});
