import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const WIX_API_KEY = Deno.env.get("WIX_PAYMENTS_API_KEY");
const WIX_SITE_ID = Deno.env.get("WIX_PAYMENTS_SITE_ID");

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { planId, planName, price, isSubscription } = await req.json();
    const origin = req.headers.get("Origin") || "https://app.base44.app";

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
            thankYouPageUrl: `${origin}/thank-you?plan=${planId}`,
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