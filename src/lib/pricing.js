// Single source of truth for everything a customer can buy.
//
// Prices and credit counts are declared here ONCE. No component may hardcode
// a price, and nothing the browser sends decides what is charged or granted:
// the checkout function looks the price up from its own copy of this table by
// product id, and the confirmation function looks the credit count up the
// same way. The browser only ever names a product.
//
// NOTE on duplication: base44/functions/createCheckout and confirmPurchase
// re-declare these values rather than importing them — nothing in
// base44/functions/ can import from src/ (only `npm:` packages), the same
// boundary already documented in src/lib/matching.js and src/lib/reminders.js.
// src/lib/pricingSync.test.js parses both sides and fails if any price or
// credit count drifts, so the duplication cannot silently rot.

/**
 * Post credits. A customer buys these and spends one per job posted.
 * `credits` is the authoritative grant — never a quantity from the client.
 */
export const POST_CREDIT_PRODUCTS = {
  post_single: {
    name: "Single Post",
    description: "One job post",
    price: 0.99,
    credits: 1,
  },
  post_bag_small: {
    name: "Small Bag of Posts",
    description: "Three job posts",
    price: 9.99,
    credits: 3,
  },
  post_bag_medium: {
    name: "Medium Bag of Posts",
    description: "Five job posts",
    price: 12.99,
    credits: 5,
  },
  post_bag_large: {
    name: "Large Bag of Posts",
    description: "Eight job posts",
    price: 15.99,
    credits: 8,
  },
};

/**
 * Customer subscriptions. An active subscription lets a customer post without
 * spending credits; it grants no other benefit, because no other benefit is
 * implemented. Do not add one here without building it.
 */
export const CUSTOMER_SUBSCRIPTIONS = {
  customer_monthly: {
    name: "Monthly",
    description: "Post jobs without buying credits",
    price: 24.99,
    interval: "MONTH",
    intervalLabel: "month",
    periodDays: 31,
  },
  customer_annual: {
    name: "Annual",
    description: "Post jobs without buying credits, billed yearly",
    price: 250,
    interval: "YEAR",
    intervalLabel: "year",
    periodDays: 366,
  },
};

/** Display order for the credit products, cheapest first. */
export const POST_CREDIT_ORDER = [
  "post_single",
  "post_bag_small",
  "post_bag_medium",
  "post_bag_large",
];

export const CUSTOMER_SUBSCRIPTION_ORDER = ["customer_monthly", "customer_annual"];

export function isPostCreditProduct(productId) {
  return Object.prototype.hasOwnProperty.call(POST_CREDIT_PRODUCTS, productId);
}

export function isCustomerSubscription(productId) {
  return Object.prototype.hasOwnProperty.call(CUSTOMER_SUBSCRIPTIONS, productId);
}

/** Credits a product grants, or 0 for anything that is not a credit product. */
export function creditsFor(productId) {
  return POST_CREDIT_PRODUCTS[productId]?.credits ?? 0;
}

/** Formats a price for display. Kept here so no component invents its own. */
export function formatPrice(amount) {
  return Number.isInteger(amount) ? `$${amount}` : `$${amount.toFixed(2)}`;
}

/**
 * Value per post, used only to label the better-value bags. Derived, never
 * stored — so it cannot drift from the prices above.
 */
export function pricePerPost(productId) {
  const product = POST_CREDIT_PRODUCTS[productId];
  if (!product || !product.credits) return null;
  return product.price / product.credits;
}
