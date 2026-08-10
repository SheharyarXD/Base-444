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
  priority_booking: { name: "Priority Booking", price: 2.99, isSubscription: false },
  verified_pro: { name: "Verified Pro Badge", price: 9.99, isSubscription: false },
  handyman_pro: { name: "Handyman Pro", price: 12.99, isSubscription: true },
  featured_listing: { name: "Featured Listing", price: 1.99, isSubscription: false },
  business_pro: { name: "Business Pro Plan", price: 14.99, isSubscription: true },
};

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

    // Realtor Pro is a monthly subscription
    if (isSubscription) {
      item.subscriptionInfo = {
        subscriptionSettings: { frequency: "MONTH" },
        title: planName,
        description: "Monthly subscription billed automatically",
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