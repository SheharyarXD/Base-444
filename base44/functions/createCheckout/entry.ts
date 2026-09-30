import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const WIX_API_KEY = Deno.env.get("WIX_PAYMENTS_API_KEY");
const WIX_SITE_ID = Deno.env.get("WIX_PAYMENTS_SITE_ID");

// Server-side source of truth for plan pricing — must be kept in sync with
// the `plans` array in src/pages/Plans.jsx. The client used to be trusted
// for `planName`/`price`/`isSubscription` directly, which let anyone call
// this function with an arbitrary price and pay whatever they chose for any
// plan. Only `planId` is taken from the client now; everything charged is
// looked up here.
const PLANS = {
  // --- Provider add-ons (pre-existing) ------------------------------------
  priority_booking: { name: "Priority Booking", price: 2.99, isSubscription: false },
  verified_pro: { name: "Verified Pro Badge", price: 9.99, isSubscription: false },
  handyman_pro: { name: "Handyman Pro", price: 12.99, isSubscription: true },
  featured_listing: { name: "Featured Listing", price: 1.99, isSubscription: false },
  business_pro: { name: "Business Pro Plan", price: 14.99, isSubscription: true },

  // --- Customer post credits ----------------------------------------------
  // Mirrors POST_CREDIT_PRODUCTS in src/lib/pricing.js. Kept in sync by
  // src/lib/pricingSync.test.js, which parses both files and fails on drift.
  // The price charged is read from here and nowhere else — the browser only
  // ever names a product id.
  post_single: { name: "Single Post", price: 0.99, isSubscription: false },
  post_bag_small: { name: "Small Bag of Posts", price: 9.99, isSubscription: false },
  post_bag_medium: { name: "Medium Bag of Posts", price: 12.99, isSubscription: false },
  post_bag_large: { name: "Large Bag of Posts", price: 15.99, isSubscription: false },

  // --- Customer subscriptions ---------------------------------------------
  customer_monthly: { name: "Linked Monthly", price: 24.99, isSubscription: true, interval: "MONTH" },
  customer_annual: { name: "Linked Annual", price: 250, isSubscription: true, interval: "YEAR" },
};

// Plans that may no longer be bought.
//
// handyman_pro and business_pro grant a subscription flag that nothing in the
// product reads, so a buyer would pay monthly for no functional benefit. They
// were taken off the pricing page, but removing them there is presentation
// only — this function is what actually starts a charge, and it would still
// have accepted either id from a crafted request. Blocking them here is the
// real withdrawal.
//
// They deliberately remain in PLANS above: confirmPurchase looks plans up by
// id to complete a purchase that was already paid for, and cancelSubscription
// needs them too, so existing subscribers keep working and can still cancel.
// Remove an id from this set to put a plan back on sale once it does something.
const WITHDRAWN_PLAN_IDS = new Set(["handyman_pro", "business_pro"]);

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { planId } = await req.json();
    const plan = PLANS[planId];
    if (!plan) {
      return Response.json({ error: "Unknown plan" }, { status: 400 });
    }
    if (WITHDRAWN_PLAN_IDS.has(planId)) {
      return Response.json(
        { error: "This plan is no longer available for purchase." },
        { status: 410 },
      );
    }
    const { name: planName, price, isSubscription } = plan;
    const origin = req.headers.get("Origin") || "https://app.base44.app";

    // Unguessable, single-use, server-minted token binding this specific
    // checkout attempt to this user + plan. Wix's hosted checkout only ever
    // redirects the browser to thankYouPageUrl after a completed payment, so
    // a token that only ever leaves this server via that redirect — and gets
    // consumed exactly once by confirmPurchase — closes the free-upgrade path
    // that used to exist (granting a plan straight from a client-visible
    // ?plan= query param with no proof of payment). See confirmPurchase's
    // header comment for the full reasoning, including its documented limits.
    const token = crypto.randomUUID();
    await base44.asServiceRole.entities.PurchaseIntent.create({
      token,
      user_email: user.email,
      plan_id: planId,
      status: "pending",
    });

    const item = {
      name: planName,
      quantity: 1,
      price: String(price),
    };

    // Billing frequency comes from the plan, not a constant. This was
    // hardcoded to MONTH, which predates the annual plan — leaving it would
    // have billed a $250 annual subscription every month.
    if (isSubscription) {
      const frequency = plan.interval === "YEAR" ? "YEAR" : "MONTH";
      item.subscriptionInfo = {
        subscriptionSettings: { frequency },
        title: planName,
        description: frequency === "YEAR"
          ? "Annual subscription billed automatically"
          : "Monthly subscription billed automatically",
      };
    }

    const response = await fetch(
      "https://www.wixapis.com/payments/platform/v1/checkout-sessions/construct",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": WIX_API_KEY,
          "wix-site-id": WIX_SITE_ID,
        },
        body: JSON.stringify({
          cart: {
            items: [item],
            customerInfo: {
              email: user.email,
              firstName: user.full_name?.split(" ")[0] || "",
              lastName: user.full_name?.split(" ").slice(1).join(" ") || "",
            },
          },
          callbackUrls: {
            postFlowUrl: origin,
            thankYouPageUrl: `${origin}/thank-you?plan=${planId}&token=${token}`,
          },
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("Wix Payments error:", JSON.stringify(data));
      return Response.json({ error: data.message || "Payment failed" }, { status: 400 });
    }

    return Response.json({ redirectUrl: data.checkoutSession.redirectUrl });
  } catch (error) {
    console.error("createCheckout error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});