import { describe, it, expect, vi, beforeEach } from "vitest";

// Covers the customer products specifically: that the charge is decided
// server-side, and that nothing the browser sends can change it.
vi.mock("npm:@base44/sdk@0.8.25", () => ({
  createClientFromRequest: vi.fn(() => mockClient),
}));

const mockClient = {
  auth: { me: vi.fn() },
  asServiceRole: { entities: { PurchaseIntent: { create: vi.fn() } } },
};

const req = (body) => ({ json: async () => body, headers: { get: () => "https://linked.example" } });

let fetchMock;

async function loadHandler() {
  const handlers = [];
  globalThis.Deno = {
    serve: (fn) => handlers.push(fn),
    env: { get: (k) => (k === "WIX_PAYMENTS_API_KEY" ? "key" : "site") },
  };
  fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ checkoutSession: { id: "cs1", checkoutUrl: "https://pay.example/cs1" } }),
  });
  globalThis.fetch = fetchMock;
  vi.resetModules();
  await import("./entry.ts");
  return handlers[0];
}

/** The item as it was actually sent to the payment provider. */
function sentItem() {
  const [, options] = fetchMock.mock.calls[0];
  return JSON.parse(options.body).cart.items[0];
}

describe("createCheckout — customer products", () => {
  let handler;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockClient.auth.me.mockResolvedValue({ id: "u1", email: "cust@x.com" });
    mockClient.asServiceRole.entities.PurchaseIntent.create.mockResolvedValue({ id: "pi1" });
    handler = await loadHandler();
  });

  const CREDIT_PRODUCTS = [
    ["post_single", "0.99"],
    ["post_bag_small", "9.99"],
    ["post_bag_medium", "12.99"],
    ["post_bag_large", "15.99"],
  ];

  for (const [planId, price] of CREDIT_PRODUCTS) {
    it(`charges ${price} for ${planId} and bills it once`, async () => {
      await handler(req({ planId }));
      const item = sentItem();
      expect(item.price).toBe(price);
      expect(item.quantity).toBe(1);
      expect(item.subscriptionInfo).toBeUndefined();
    });
  }

  it("bills the monthly subscription at 24.99 every month", async () => {
    await handler(req({ planId: "customer_monthly" }));
    const item = sentItem();
    expect(item.price).toBe("24.99");
    expect(item.subscriptionInfo.subscriptionSettings.frequency).toBe("MONTH");
  });

  it("bills the annual subscription at 250 every year, not every month", async () => {
    // The frequency was hardcoded to MONTH before the annual plan existed,
    // which would have charged $250 twelve times a year.
    await handler(req({ planId: "customer_annual" }));
    const item = sentItem();
    expect(item.price).toBe("250");
    expect(item.subscriptionInfo.subscriptionSettings.frequency).toBe("YEAR");
  });

  describe("the browser cannot change what is charged", () => {
    it("ignores a price sent alongside the product", async () => {
      await handler(req({ planId: "post_bag_large", price: 0.01, amount: 0.01 }));
      expect(sentItem().price).toBe("15.99");
    });

    it("ignores a quantity sent alongside the product", async () => {
      await handler(req({ planId: "post_single", quantity: 1000, credits: 1000 }));
      const item = sentItem();
      expect(item.quantity).toBe(1);
      expect(item.price).toBe("0.99");
    });

    it("ignores a product name sent alongside the product", async () => {
      await handler(req({ planId: "post_single", planName: "Free Everything" }));
      expect(sentItem().name).toBe("Single Post");
    });

    it("refuses an arbitrary product id", async () => {
      const res = await handler(req({ planId: "arbitrary_plan" }));
      expect(res.status).toBe(400);
      expect(fetchMock).not.toHaveBeenCalled();
      expect(mockClient.asServiceRole.entities.PurchaseIntent.create).not.toHaveBeenCalled();
    });

    it("refuses a missing product id", async () => {
      expect((await handler(req({}))).status).toBe(400);
    });

    it("refuses an unauthenticated caller", async () => {
      mockClient.auth.me.mockResolvedValue(null);
      expect((await handler(req({ planId: "post_single" }))).status).toBe(401);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe("purchase intent", () => {
    it("binds the intent to the caller and the product before any payment", async () => {
      await handler(req({ planId: "post_bag_medium" }));
      const intent = mockClient.asServiceRole.entities.PurchaseIntent.create.mock.calls[0][0];
      expect(intent.user_email).toBe("cust@x.com");
      expect(intent.plan_id).toBe("post_bag_medium");
      expect(intent.status).toBe("pending");
      expect(intent.token).toBeTruthy();
    });

    it("mints a distinct token per checkout, so one cannot be reused", async () => {
      await handler(req({ planId: "post_single" }));
      await handler(req({ planId: "post_single" }));
      const [a, b] = mockClient.asServiceRole.entities.PurchaseIntent.create.mock.calls;
      expect(a[0].token).not.toBe(b[0].token);
    });

    it("does not take the token from the caller", async () => {
      await handler(req({ planId: "post_single", token: "attacker-chosen-token" }));
      const intent = mockClient.asServiceRole.entities.PurchaseIntent.create.mock.calls[0][0];
      expect(intent.token).not.toBe("attacker-chosen-token");
    });
  });
});
