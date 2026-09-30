import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("npm:@base44/sdk@0.8.31", () => ({
  createClientFromRequest: vi.fn(() => mockClient),
}));

const mockClient = {
  auth: { me: vi.fn() },
  asServiceRole: {
    entities: {
      PostCreditLedger: { filter: vi.fn() },
      CustomerSubscription: { filter: vi.fn() },
    },
  },
};

const req = () => ({ json: async () => ({}) });

async function loadHandler() {
  const handlers = [];
  globalThis.Deno = { serve: (fn) => handlers.push(fn), env: { get: () => undefined } };
  vi.resetModules();
  await import("./entry.ts");
  return handlers[0];
}

const USER = { id: "u1", email: "cust@x.com" };
const future = (days) => new Date(Date.now() + days * 864e5).toISOString();
const past = (days) => new Date(Date.now() - days * 864e5).toISOString();

describe("getPostEntitlement", () => {
  let handler;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockClient.auth.me.mockResolvedValue(USER);
    mockClient.asServiceRole.entities.PostCreditLedger.filter.mockResolvedValue([]);
    mockClient.asServiceRole.entities.CustomerSubscription.filter.mockResolvedValue([]);
    handler = await loadHandler();
  });

  it("refuses an unauthenticated caller", async () => {
    mockClient.auth.me.mockResolvedValue(null);
    expect((await handler(req())).status).toBe(401);
  });

  describe("balance", () => {
    it("is the sum of the ledger, not a stored number", async () => {
      mockClient.asServiceRole.entities.PostCreditLedger.filter.mockResolvedValue([
        { delta: 3, reason: "purchase" }, { delta: 8, reason: "purchase" },
        { delta: -1, reason: "post" }, { delta: -1, reason: "post" },
      ]);
      expect((await (await handler(req())).json()).credits).toBe(9);
    });

    it("is zero for a customer with no history", async () => {
      const out = await (await handler(req())).json();
      expect(out.credits).toBe(0);
      expect(out.canPost).toBe(false);
    });

    it("never goes negative into a usable state", async () => {
      mockClient.asServiceRole.entities.PostCreditLedger.filter.mockResolvedValue([
        { delta: 1 }, { delta: -1 },
      ]);
      const out = await (await handler(req())).json();
      expect(out.credits).toBe(0);
      expect(out.canPost).toBe(false);
    });

    it("tolerates a malformed delta rather than producing NaN", async () => {
      mockClient.asServiceRole.entities.PostCreditLedger.filter.mockResolvedValue([
        { delta: 3 }, { delta: "oops" }, { delta: null },
      ]);
      expect((await (await handler(req())).json()).credits).toBe(3);
    });

    it("reads only this customer's own ledger", async () => {
      await handler(req());
      expect(mockClient.asServiceRole.entities.PostCreditLedger.filter)
        .toHaveBeenCalledWith({ customer_email: USER.email });
    });
  });

  describe("posting entitlement", () => {
    it("allows posting on credits, and says a credit will be used", async () => {
      mockClient.asServiceRole.entities.PostCreditLedger.filter.mockResolvedValue([{ delta: 2 }]);
      const out = await (await handler(req())).json();
      expect(out.canPost).toBe(true);
      expect(out.willConsumeCredit).toBe(true);
    });

    it("allows posting on a subscription without using a credit", async () => {
      mockClient.asServiceRole.entities.CustomerSubscription.filter.mockResolvedValue([
        { plan_id: "customer_monthly", status: "active", current_period_end: future(20) },
      ]);
      const out = await (await handler(req())).json();
      expect(out.canPost).toBe(true);
      expect(out.willConsumeCredit).toBe(false);
      expect(out.subscription.active).toBe(true);
    });

    it("prefers the subscription over spending a credit", async () => {
      mockClient.asServiceRole.entities.PostCreditLedger.filter.mockResolvedValue([{ delta: 5 }]);
      mockClient.asServiceRole.entities.CustomerSubscription.filter.mockResolvedValue([
        { plan_id: "customer_annual", status: "active", current_period_end: future(300) },
      ]);
      expect((await (await handler(req())).json()).willConsumeCredit).toBe(false);
    });

    it("honours a cancelled subscription until its paid period ends", async () => {
      mockClient.asServiceRole.entities.CustomerSubscription.filter.mockResolvedValue([
        { plan_id: "customer_monthly", status: "cancelled", current_period_end: future(5), cancelled_at: past(1) },
      ]);
      const out = await (await handler(req())).json();
      expect(out.canPost).toBe(true);
      expect(out.subscription.active).toBe(true);
    });

    it("stops honouring it once that period has passed", async () => {
      mockClient.asServiceRole.entities.CustomerSubscription.filter.mockResolvedValue([
        { plan_id: "customer_monthly", status: "cancelled", current_period_end: past(1) },
      ]);
      const out = await (await handler(req())).json();
      expect(out.canPost).toBe(false);
      expect(out.subscription.active).toBe(false);
    });

    it("treats an expired subscription as granting nothing", async () => {
      mockClient.asServiceRole.entities.CustomerSubscription.filter.mockResolvedValue([
        { plan_id: "customer_monthly", status: "expired", current_period_end: future(5) },
      ]);
      expect((await (await handler(req())).json()).canPost).toBe(false);
    });

    it("treats a failed payment as granting nothing", async () => {
      mockClient.asServiceRole.entities.CustomerSubscription.filter.mockResolvedValue([
        { plan_id: "customer_monthly", status: "payment_failed", current_period_end: future(5) },
      ]);
      expect((await (await handler(req())).json()).canPost).toBe(false);
    });

    it("treats a subscription with no end date as granting nothing", async () => {
      mockClient.asServiceRole.entities.CustomerSubscription.filter.mockResolvedValue([
        { plan_id: "customer_monthly", status: "active" },
      ]);
      expect((await (await handler(req())).json()).canPost).toBe(false);
    });
  });

  describe("purchase history", () => {
    it("returns newest first", async () => {
      mockClient.asServiceRole.entities.PostCreditLedger.filter.mockResolvedValue([
        { id: "a", delta: 3, reason: "purchase", created_date: past(5) },
        { id: "b", delta: -1, reason: "post", created_date: past(1) },
      ]);
      const out = await (await handler(req())).json();
      expect(out.history[0].id).toBe("b");
    });

    it("is capped so a long history cannot bloat the response", async () => {
      const many = Array.from({ length: 200 }, (_, i) => ({
        id: `e${i}`, delta: 1, reason: "purchase", created_date: past(i),
      }));
      mockClient.asServiceRole.entities.PostCreditLedger.filter.mockResolvedValue(many);
      expect((await (await handler(req())).json()).history).toHaveLength(50);
    });
  });

  it("returns 500 without throwing on an unexpected error", async () => {
    mockClient.auth.me.mockRejectedValue(new Error("network down"));
    expect((await handler(req())).status).toBe(500);
  });
});
