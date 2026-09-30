import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  POST_CREDIT_PRODUCTS,
  CUSTOMER_SUBSCRIPTIONS,
  creditsFor,
  isPostCreditProduct,
  isCustomerSubscription,
  formatPrice,
  pricePerPost,
} from "./pricing.js";

const here = dirname(fileURLToPath(import.meta.url));
const fn = (name) => readFileSync(join(here, "..", "..", "base44", "functions", name, "entry.ts"), "utf8");
const checkout = fn("createCheckout");
const confirm = fn("confirmPurchase");
const createJob = fn("createJobPost");

// The client-approved prices, written out literally. If a price in the
// application changes, this file must be changed deliberately — which is the
// point. Nothing here is derived from the source it checks.
const APPROVED = {
  post_single: { price: 0.99, credits: 1, name: "Single Post" },
  post_bag_small: { price: 9.99, credits: 3, name: "Small Bag of Posts" },
  post_bag_medium: { price: 12.99, credits: 5, name: "Medium Bag of Posts" },
  post_bag_large: { price: 15.99, credits: 8, name: "Large Bag of Posts" },
};
const APPROVED_SUBS = {
  customer_monthly: { price: 24.99, interval: "MONTH" },
  customer_annual: { price: 250, interval: "YEAR" },
};

describe("approved product definitions", () => {
  for (const [id, want] of Object.entries(APPROVED)) {
    it(`${want.name} is ${formatPrice(want.price)} for ${want.credits} post(s)`, () => {
      const product = POST_CREDIT_PRODUCTS[id];
      expect(product).toBeTruthy();
      expect(product.price).toBe(want.price);
      expect(product.credits).toBe(want.credits);
      expect(product.name).toBe(want.name);
    });
  }

  it("monthly is $24.99 billed monthly", () => {
    expect(CUSTOMER_SUBSCRIPTIONS.customer_monthly.price).toBe(24.99);
    expect(CUSTOMER_SUBSCRIPTIONS.customer_monthly.interval).toBe("MONTH");
  });

  it("annual is $250 billed yearly", () => {
    expect(CUSTOMER_SUBSCRIPTIONS.customer_annual.price).toBe(250);
    expect(CUSTOMER_SUBSCRIPTIONS.customer_annual.interval).toBe("YEAR");
  });

  it("defines exactly these four credit products and two subscriptions", () => {
    // Guards against a tier being invented without a decision behind it.
    expect(Object.keys(POST_CREDIT_PRODUCTS).sort()).toEqual(Object.keys(APPROVED).sort());
    expect(Object.keys(CUSTOMER_SUBSCRIPTIONS).sort()).toEqual(Object.keys(APPROVED_SUBS).sort());
  });

  // Documents the approved pricing as it actually is, rather than as one
  // might assume. At these prices a bag costs MORE per post than a single
  // post ($0.99 vs $3.33 / $2.60 / $2.00), so the interface must not claim a
  // saving. This test exists to make that property explicit and to fail
  // loudly if the prices are ever revised, so the copy can be revisited.
  it("records the per-post economics of the approved prices", () => {
    expect(pricePerPost("post_single")).toBeCloseTo(0.99, 2);
    expect(pricePerPost("post_bag_small")).toBeCloseTo(3.33, 2);
    expect(pricePerPost("post_bag_medium")).toBeCloseTo(2.598, 2);
    expect(pricePerPost("post_bag_large")).toBeCloseTo(1.99875, 2);
  });

  it("larger bags are at least cheaper per post than smaller bags", () => {
    expect(pricePerPost("post_bag_large")).toBeLessThan(pricePerPost("post_bag_medium"));
    expect(pricePerPost("post_bag_medium")).toBeLessThan(pricePerPost("post_bag_small"));
  });

  it("formats whole and fractional prices the way the UI shows them", () => {
    expect(formatPrice(250)).toBe("$250");
    expect(formatPrice(0.99)).toBe("$0.99");
    expect(formatPrice(24.99)).toBe("$24.99");
  });
});

// The backend cannot import this module, so it re-declares the numbers. These
// tests read both sides and fail if they drift — the duplication is allowed
// precisely because it is checked.
describe("backend mirrors the source of truth", () => {
  function priceInCheckout(id) {
    const m = checkout.match(new RegExp(`${id}:\\s*\\{[^}]*price:\\s*([0-9.]+)`));
    return m ? Number(m[1]) : null;
  }
  function creditsInConfirm(id) {
    const block = confirm.slice(confirm.indexOf("const CREDIT_GRANTS"));
    const m = block.match(new RegExp(`${id}:\\s*([0-9]+)`));
    return m ? Number(m[1]) : null;
  }

  for (const [id, want] of Object.entries(APPROVED)) {
    it(`checkout charges ${formatPrice(want.price)} for ${id}`, () => {
      expect(priceInCheckout(id)).toBe(want.price);
    });
    it(`confirmation grants ${want.credits} credit(s) for ${id}`, () => {
      expect(creditsInConfirm(id)).toBe(want.credits);
    });
  }

  for (const [id, want] of Object.entries(APPROVED_SUBS)) {
    it(`checkout charges ${formatPrice(want.price)} for ${id}`, () => {
      expect(priceInCheckout(id)).toBe(want.price);
    });
  }

  it("bills the annual plan yearly rather than monthly", () => {
    // The frequency was hardcoded to MONTH before the annual plan existed,
    // which would have charged $250 every month.
    expect(checkout).toMatch(/plan\.interval === "YEAR" \? "YEAR" : "MONTH"/);
    expect(checkout).toMatch(/customer_annual:.*interval: "YEAR"/);
  });

  it("grants credits only for products that actually exist", () => {
    const block = confirm.slice(confirm.indexOf("const CREDIT_GRANTS"), confirm.indexOf("const SUBSCRIPTION_PERIOD_DAYS"));
    const granted = [...block.matchAll(/(post_[a-z_]+):/g)].map((m) => m[1]).sort();
    expect(granted).toEqual(Object.keys(APPROVED).sort());
  });

  it("never reads a credit quantity from the request", () => {
    // The browser names a product; it never states how many credits it wants.
    expect(confirm).not.toMatch(/body\.credits|\bcredits\s*=\s*(body|req)/);
    expect(createJob).not.toMatch(/body\.credits/);
  });

  it("never reads a price from the request", () => {
    expect(checkout).not.toMatch(/const\s*\{[^}]*\bprice\b[^}]*\}\s*=\s*await req\.json/);
  });
});

describe("helpers", () => {
  it("reports credits only for real credit products", () => {
    expect(creditsFor("post_bag_large")).toBe(8);
    expect(creditsFor("customer_monthly")).toBe(0);
    expect(creditsFor("not_a_product")).toBe(0);
    expect(creditsFor(undefined)).toBe(0);
  });

  it("classifies products correctly", () => {
    expect(isPostCreditProduct("post_single")).toBe(true);
    expect(isPostCreditProduct("customer_annual")).toBe(false);
    expect(isCustomerSubscription("customer_annual")).toBe(true);
    expect(isCustomerSubscription("post_single")).toBe(false);
  });

  it("is not fooled by inherited object properties", () => {
    expect(isPostCreditProduct("constructor")).toBe(false);
    expect(isCustomerSubscription("toString")).toBe(false);
  });
});
