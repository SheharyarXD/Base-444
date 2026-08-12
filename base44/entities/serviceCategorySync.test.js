import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { SERVICE_CATEGORIES } from "../../src/lib/serviceCategories";

// Contractor.jsonc and Booking.jsonc each declare their own `category` enum
// — Base44's .jsonc schema files are static and can't import
// src/lib/serviceCategories.js, so those two enums are a manually-kept-in-
// sync duplication of the one real source of truth (see that file's header
// comment). This test is the guardrail against that duplication silently
// drifting: it doesn't matter which entity a category is added to first, or
// whether the picker UI and the stored value ever fall out of sync — if any
// of the three lists disagree, this fails immediately instead of surfacing
// as a hard-to-diagnose "provider can't see jobs in their own category" bug
// in production.
const here = dirname(fileURLToPath(import.meta.url));
function loadEntity(name) {
  return JSON.parse(readFileSync(join(here, `${name}.jsonc`), "utf8"));
}

describe("category enum sync (Contractor.jsonc / Booking.jsonc / serviceCategories.js)", () => {
  const contractor = loadEntity("Contractor");
  const booking = loadEntity("Booking");

  it("Contractor.jsonc's category enum exactly matches SERVICE_CATEGORIES", () => {
    expect(new Set(contractor.properties.category.enum)).toEqual(new Set(SERVICE_CATEGORIES));
  });

  it("Booking.jsonc's category enum exactly matches SERVICE_CATEGORIES", () => {
    expect(new Set(booking.properties.category.enum)).toEqual(new Set(SERVICE_CATEGORIES));
  });

  it("neither entity enum has internal duplicates", () => {
    expect(new Set(contractor.properties.category.enum).size).toBe(contractor.properties.category.enum.length);
    expect(new Set(booking.properties.category.enum).size).toBe(booking.properties.category.enum.length);
  });
});
