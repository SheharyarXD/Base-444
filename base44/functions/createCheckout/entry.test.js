import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("npm:@base44/sdk@0.8.25", () => ({
  createClientFromRequest: vi.fn(() => mockClient),
}));

const mockClient = {
  auth: { me: vi.fn() },
  asServiceRole: {
    entities: {
      PurchaseIntent: { create: vi.fn() },
    },
  },
};

function makeReq(body, headers = {}) {
  return {
    json: async () => body,
    headers: { get: (k) => headers[k] ?? null },
  };
}

async function loadHandler() {
  const handlers = [];
  globalThis.Deno = { serve: (fn) => handlers.push(fn), env: { get: () => "test-key" } };
  vi.resetModules();
  await import("./entry.ts");
  return handlers[0];
}

describe("createCheckout", () => {
  let handler;
  let fetchMock;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockClient.auth.me.mockResolvedValue({ email: "u@x.com", full_name: "Uma User" });
    fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ checkoutSession: { redirectUrl: "https://pay.example/session" } }),
    });
    vi.stubGlobal("fetch", fetchMock);
    mockClient.asServiceRole.entities.PurchaseIntent.create.mockResolvedValue({ id: "pi1" });
    handler = await loadHandler();
  });

  it("rejects when unauthenticated", async () => {
    mockClient.auth.me.mockResolvedValue(null);
    const res = await handler(makeReq({ planId: "priority_booking" }));
    expect(res.status).toBe(401);
  });

  it("rejects an unknown planId", async () => {
    const res = await handler(makeReq({ planId: "not_a_real_plan" }));
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // Regression test for the price-tampering vulnerability found in the Phase 1
  // audit: price/planName/isSubscription used to be trusted verbatim from the
  // client, so a caller could request any plan for any price. The server must
  // now look pricing up itself from `planId` and ignore any client-supplied
  // price/name/subscription fields.
  it("ignores a client-supplied price and charges the real server-side plan price", async () => {
    await handler(
      makeReq({ planId: "priority_booking", planName: "Free Money", price: 0.01, isSubscription: false })
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, options] = fetchMock.mock.calls[0];
    const sentBody = JSON.parse(options.body);
    const item = sentBody.cart.items[0];
    expect(item.price).toBe("2.99");
    expect(item.name).toBe("Priority Booking");
  });

  it("marks a subscription plan's checkout session as a monthly subscription", async () => {
    await handler(makeReq({ planId: "handyman_pro" }));

    const [, options] = fetchMock.mock.calls[0];
    const item = JSON.parse(options.body).cart.items[0];
    expect(item.price).toBe("12.99");
    expect(item.subscriptionInfo?.subscriptionSettings?.frequency).toBe("MONTH");
  });

  it("does not attach subscriptionInfo for a one-time plan", async () => {
    await handler(makeReq({ planId: "featured_listing" }));

    const [, options] = fetchMock.mock.calls[0];
    const item = JSON.parse(options.body).cart.items[0];
    expect(item.subscriptionInfo).toBeUndefined();
  });

  it("propagates a Wix Payments failure as a 400", async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ message: "card declined" }) });
    const res = await handler(makeReq({ planId: "verified_pro" }));
    expect(res.status).toBe(400);
  });

  // Regression coverage for the free-upgrade exploit found in the Phase 0
  // re-audit: ThankYou.jsx used to grant a plan purely from a client-visible
  // ?plan= query param, so anyone could type the URL and get it for free.
  // The fix is that this function now mints a single-use token, records it
  // server-side bound to this user + plan *before* redirecting to Wix, and
  // only confirmPurchase (given that exact token) can ever grant anything.
  it("creates a pending PurchaseIntent bound to the caller and plan before redirecting to Wix", async () => {
    await handler(makeReq({ planId: "priority_booking" }));

    expect(mockClient.asServiceRole.entities.PurchaseIntent.create).toHaveBeenCalledWith(
      expect.objectContaining({ user_email: "u@x.com", plan_id: "priority_booking", status: "pending" })
    );
  });

  it("embeds the minted token in the Wix thankYouPageUrl redirect", async () => {
    await handler(makeReq({ planId: "priority_booking" }));

    const [createdIntent] = mockClient.asServiceRole.entities.PurchaseIntent.create.mock.calls[0];
    const [, options] = fetchMock.mock.calls[0];
    const sentBody = JSON.parse(options.body);
    expect(sentBody.callbackUrls.thankYouPageUrl).toContain(`token=${createdIntent.token}`);
  });
});
