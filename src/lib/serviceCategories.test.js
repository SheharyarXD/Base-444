import { describe, it, expect } from "vitest";
import { SERVICE_CATEGORIES, CATEGORY_DESCRIPTIONS } from "./serviceCategories";

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

  it("includes every category from the client's second expanded-marketplace request", () => {
    const newlyAdded = [
      "Fencing Services",
      "Heavy Wheel Mechanic",
      "Garage Door Specialists",
      "Tree Services",
      "Appliance Repair",
      "Small Engine Repair",
      "Towing Service",
      "Concrete Services",
    ];
    for (const cat of newlyAdded) {
      expect(SERVICE_CATEGORIES).toContain(cat);
    }
  });

  it("did not create separate subcategories for the examples called out in the request (18-wheelers, semi trucks, lawn mowers, etc.)", () => {
    const shouldNotExist = ["18-Wheelers", "Semi Trucks", "Lawn Mowers", "Service Trucks"];
    for (const notACategory of shouldNotExist) {
      expect(SERVICE_CATEGORIES).not.toContain(notACategory);
    }
  });

  it("has exactly 24 categories after the second expansion (16 previous + 8 newly added)", () => {
    expect(SERVICE_CATEGORIES).toHaveLength(24);
  });
});

describe("CATEGORY_DESCRIPTIONS", () => {
  it("provides the client-specified help text for Heavy Wheel Mechanic", () => {
    expect(CATEGORY_DESCRIPTIONS["Heavy Wheel Mechanic"]).toBe(
      "18-wheelers, semi trucks, heavy-duty service trucks and other large commercial vehicles."
    );
  });

  it("provides the client-specified help text for Small Engine Repair", () => {
    expect(CATEGORY_DESCRIPTIONS["Small Engine Repair"]).toBe(
      "Lawn mowers and other small-engine equipment."
    );
  });

  it("every key is a real, valid category (no orphaned descriptions)", () => {
    for (const key of Object.keys(CATEGORY_DESCRIPTIONS)) {
      expect(SERVICE_CATEGORIES).toContain(key);
    }
  });
});
