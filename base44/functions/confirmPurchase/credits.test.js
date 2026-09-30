import { describe, it, expect, vi, beforeEach } from "vitest";

// Separate from entry.test.js (which covers the pre-existing provider add-ons)
// so the credit and subscription grants get their own mock surface without
// disturbing those tests.
vi.mock("npm:@base44/sdk@0.8.31", () => ({
  createClientFromRequest: vi.fn(() => mockClient),
}));

const mockClient = {
  auth: { me: vi.fn() },
  asServiceRole: {
    entities: {
      PurchaseIntent: { filter: vi.fn(), update: vi.fn() },
      User: { update: vi.fn() },
      Contractor: { filter: vi.fn(), update: vi.fn() },
      PostCreditLedger: { filter: vi.fn(), create: vi.fn() },
      CustomerSubscription: { filter: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    },
  },
};

const req = (body) => ({ json: async () => body });

async function loadHandler() {
  const handlers = [];
  globalThis.Deno = { serve: (fn) => handlers.push(fn), env: { get: () => undefined } };
  vi.resetModules();
  await import("./entry.ts");
  return handlers[0];
}

const USER = { id: "u1", email: "cust@x.com" };
const TOKEN = "tok-abc-123";
const intent = (planId, over = {}) => [{
  id: "pi1", token: TOKEN, user_email: USER.email, plan_id: planId, status: "pending", ...over,
}];

describe("confirmPurchase — post credits", () => {
  let handler;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockClient.auth.me.mockResolvedValue(USER);
    mockClient.asServiceRole.entities.PostCreditLedger.filter.mockResolvedValue([]);
    mockClient.asServiceRole.entities.CustomerSubscription.filter.mockResolvedValue([]);
    mockClient.asServiceRole.entities.Contractor.filter.mockResolvedValue([]);
    handler = await loadHandler();
  });

  const GRANTS = [
    ["post_single", 1],
    ["post_bag_small", 3],
    ["post_bag_medium", 5],
    ["post_bag_large", 8],
  ];

  for (const [planId, credits] of GRANTS) {
    it(`grants exactly ${credits} credit(s) for ${planId}`, async () => {
      mockClient.asServiceRole.entities.PurchaseIntent.filter.mockResolvedValue(intent(planId));
      await handler(req({ token: TOKEN }));
      const entry = mockClient.asServiceRole.entities.PostCreditLedger.create.mock.calls[0][0];
      expect(entry.delta).toBe(credits);
      expect(entry.reason).toBe("purchase");
      expect(entry.customer_email).toBe(USER.email);
      expect(entry.ref).toBe(TOKEN);
    });
  }

  it("grants nothing for an arbitrary plan id", async () => {
    mockClient.asServiceRole.entities.PurchaseIntent.filter.mockResolvedValue(intent("arbitrary_plan"));
    expect((await handler(req({ token: TOKEN }))).status).toBe(400);
    expect(mockClient.asServiceRole.entities.PostCreditLedger.create).not.toHaveBeenCalled();
  });

  it("grants nothing when the token does not exist", async () => {
    mockClient.asServiceRole.entities.PurchaseIntent.filter.mockResolvedValue([]);
    expect((await handler(req({ token: "made-up" }))).status).toBe(403);
    expect(mockClient.asServiceRole.entities.PostCreditLedger.create).not.toHaveBeenCalled();
  });

  it("grants nothing for a token belonging to another customer", async () => {
    mockClient.asServiceRole.entities.PurchaseIntent.filter.mockResolvedValue(
      intent("post_bag_large", { user_email: "someone@else.com" }),
    );
    expect((await handler(req({ token: TOKEN }))).status).toBe(403);
    expect(mockClient.asServiceRole.entities.PostCreditLedger.create).not.toHaveBeenCalled();
  });

  it("grants nothing for an already-consumed intent", async () => {
    mockClient.asServiceRole.entities.PurchaseIntent.filter.mockResolvedValue(
      intent("post_bag_large", { status: "completed" }),
    );
    expect((await handler(req({ token: TOKEN }))).status).toBe(403);
    expect(mockClient.asServiceRole.entities.PostCreditLedger.create).not.toHaveBeenCalled();
  });

  it("ignores any quantity or price the caller tries to send", async () => {
    mockClient.asServiceRole.entities.PurchaseIntent.filter.mockResolvedValue(intent("post_single"));
    await handler(req({ token: TOKEN, credits: 1000, quantity: 1000, price: 0.01 }));
    const entry = mockClient.asServiceRole.entities.PostCreditLedger.create.mock.calls[0][0];
    expect(entry.delta).toBe(1);
  });

  it("does not grant twice when the confirmation is replayed", async () => {
    mockClient.asServiceRole.entities.PurchaseIntent.filter.mockResolvedValue(intent("post_bag_small"));
    // The ledger already holds this token's grant.
    mockClient.asServiceRole.entities.PostCreditLedger.filter.mockResolvedValue([{ id: "l1", ref: TOKEN }]);
    await handler(req({ token: TOKEN }));
    expect(mockClient.asServiceRole.entities.PostCreditLedger.create).not.toHaveBeenCalled();
  });

  it("consumes the intent before granting, so a crash cannot double-grant", async () => {
    mockClient.asServiceRole.entities.PurchaseIntent.filter.mockResolvedValue(intent("post_single"));
    const order = [];
    mockClient.asServiceRole.entities.PurchaseIntent.update.mockImplementation(async () => { order.push("consume"); });
    mockClient.asServiceRole.entities.PostCreditLedger.create.mockImplementation(async () => { order.push("grant"); });
    await handler(req({ token: TOKEN }));
    expect(order).toEqual(["consume", "grant"]);
  });

  it("refuses an unauthenticated caller", async () => {
    mockClient.auth.me.mockResolvedValue(null);
    expect((await handler(req({ token: TOKEN }))).status).toBe(401);
  });
});

describe("confirmPurchase — customer subscriptions", () => {
  let handler;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockClient.auth.me.mockResolvedValue(USER);
    mockClient.asServiceRole.entities.PostCreditLedger.filter.mockResolvedValue([]);
    mockClient.asServiceRole.entities.CustomerSubscription.filter.mockResolvedValue([]);
    mockClient.asServiceRole.entities.Contractor.filter.mockResolvedValue([]);
    handler = await loadHandler();
  });

  it("activates a monthly subscription for about a month", async () => {
    mockClient.asServiceRole.entities.PurchaseIntent.filter.mockResolvedValue(intent("customer_monthly"));
    await handler(req({ token: TOKEN }));
    const created = mockClient.asServiceRole.entities.CustomerSubscription.create.mock.calls[0][0];
    expect(created.plan_id).toBe("customer_monthly");
    expect(created.status).toBe("active");
    expect(created.customer_email).toBe(USER.email);
    const days = (new Date(created.current_period_end) - Date.now()) / 864e5;
    expect(days).toBeGreaterThan(28);
    expect(days).toBeLessThan(32);
  });

  it("activates an annual subscription for about a year", async () => {
    mockClient.asServiceRole.entities.PurchaseIntent.filter.mockResolvedValue(intent("customer_annual"));
    await handler(req({ token: TOKEN }));
    const created = mockClient.asServiceRole.entities.CustomerSubscription.create.mock.calls[0][0];
    const days = (new Date(created.current_period_end) - Date.now()) / 864e5;
    expect(days).toBeGreaterThan(360);
    expect(days).toBeLessThan(370);
  });

  it("extends from the existing end date on renewal, losing no paid days", async () => {
    mockClient.asServiceRole.entities.PurchaseIntent.filter.mockResolvedValue(intent("customer_monthly"));
    mockClient.asServiceRole.entities.CustomerSubscription.filter.mockResolvedValue([{
      id: "s1", customer_email: USER.email, status: "active",
      current_period_end: new Date(Date.now() + 10 * 864e5).toISOString(),
      last_purchase_ref: "an-older-token",
    }]);
    await handler(req({ token: TOKEN }));
    const patch = mockClient.asServiceRole.entities.CustomerSubscription.update.mock.calls[0][1];
    const days = (new Date(patch.current_period_end) - Date.now()) / 864e5;
    expect(days).toBeGreaterThan(38);
  });

  it("does not extend twice for a duplicate confirmation of one payment", async () => {
    mockClient.asServiceRole.entities.PurchaseIntent.filter.mockResolvedValue(intent("customer_monthly"));
    mockClient.asServiceRole.entities.CustomerSubscription.filter.mockResolvedValue([
      { id: "s1", customer_email: USER.email, status: "active", last_purchase_ref: TOKEN },
    ]);
    await handler(req({ token: TOKEN }));
    expect(mockClient.asServiceRole.entities.CustomerSubscription.update).not.toHaveBeenCalled();
    expect(mockClient.asServiceRole.entities.CustomerSubscription.create).not.toHaveBeenCalled();
  });

  it("reactivates a previously cancelled subscription cleanly", async () => {
    mockClient.asServiceRole.entities.PurchaseIntent.filter.mockResolvedValue(intent("customer_annual"));
    mockClient.asServiceRole.entities.CustomerSubscription.filter.mockResolvedValue([{
      id: "s1", customer_email: USER.email, status: "cancelled",
      cancelled_at: "2026-01-01T00:00:00Z", last_purchase_ref: "an-older-token",
    }]);
    await handler(req({ token: TOKEN }));
    const patch = mockClient.asServiceRole.entities.CustomerSubscription.update.mock.calls[0][1];
    expect(patch.status).toBe("active");
    expect(patch.cancelled_at).toBeNull();
  });

  it("collapses duplicate subscription records so a stale one cannot be read", async () => {
    mockClient.asServiceRole.entities.PurchaseIntent.filter.mockResolvedValue(intent("customer_monthly"));
    mockClient.asServiceRole.entities.CustomerSubscription.filter.mockResolvedValue([
      { id: "s1", customer_email: USER.email, status: "active", last_purchase_ref: "older" },
      { id: "s2", customer_email: USER.email, status: "active", last_purchase_ref: "older" },
    ]);
    await handler(req({ token: TOKEN }));
    expect(mockClient.asServiceRole.entities.CustomerSubscription.delete).toHaveBeenCalledWith("s2");
    expect(mockClient.asServiceRole.entities.CustomerSubscription.delete).not.toHaveBeenCalledWith("s1");
  });

  it("cannot be granted by a forged status in the request", async () => {
    mockClient.asServiceRole.entities.PurchaseIntent.filter.mockResolvedValue([]);
    const res = await handler(req({ token: TOKEN, subscription: "active", plan: "customer_annual" }));
    expect(res.status).toBe(403);
    expect(mockClient.asServiceRole.entities.CustomerSubscription.create).not.toHaveBeenCalled();
  });

  it("still grants the pre-existing provider add-ons unchanged", async () => {
    mockClient.asServiceRole.entities.PurchaseIntent.filter.mockResolvedValue(intent("priority_booking"));
    await handler(req({ token: TOKEN }));
    expect(mockClient.asServiceRole.entities.User.update).toHaveBeenCalledWith("u1", { pending_priority_boost: true });
    expect(mockClient.asServiceRole.entities.PostCreditLedger.create).not.toHaveBeenCalled();
  });
});
