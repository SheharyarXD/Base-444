import { describe, it, expect } from "vitest";
import { haversineMiles, haversineFeet } from "./geo";

describe("haversineMiles", () => {
  it("returns ~0 for the same point", () => {
    expect(haversineMiles(38.9, -77.0, 38.9, -77.0)).toBeCloseTo(0, 5);
  });

  it("matches a known distance (roughly NYC to LA, ~2445 mi)", () => {
    const dist = haversineMiles(40.7128, -74.006, 34.0522, -118.2437);
    expect(dist).toBeGreaterThan(2400);
    expect(dist).toBeLessThan(2500);
  });
});

describe("haversineFeet", () => {
  it("is haversineMiles scaled by 5280", () => {
    const miles = haversineMiles(38.9, -77.0, 38.91, -77.01);
    const feet = haversineFeet(38.9, -77.0, 38.91, -77.01);
    expect(feet).toBeCloseTo(miles * 5280, 3);
  });
});
