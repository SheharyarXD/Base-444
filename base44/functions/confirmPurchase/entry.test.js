import { describe, it, expect, vi, beforeEach } from "vitest";

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
    },
  },
};

function makeReq(body) {
  return { json: async () => body };
}

async function loadHandler() {
  const handlers = [];
  globalThis.Deno = { serve: (fn) => handlers.push(fn), env: { get: () => undefined } };
  vi.resetModules();
  await import("./entry.ts");
  return handlers[0];
}

describe("confirmPurchase", () => {
  let handler;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockClient.asServiceRole.entities.PurchaseIntent.update.mockResolvedValue({});
    handler = await loadHandler();
  });

  it("rejects when unauthenticated", async () => {
    mockClient.auth.me.mockResolvedValue(null);
    const res = await handler(makeReq({ token: "t1" }));
    expect(res.status).toBe(401);
  });

  it("rejects when token is missing", async () => {
    mockClient.auth.me.mockResolvedValue({ id: "u1", email: "u@x.com" });
    const res = await handler(makeReq({}));
    expect(res.status).toBe(400);
  });

  // Regression test for the free-upgrade exploit found in the Phase 0
  // re-audit: ThankYou.jsx used to grant a plan straight from a client-
  // visible ?plan= URL param with no proof of payment at all, and the old
  // grantRealtorPro function granted to any authenticated caller. Neither
  // path exists anymore — this is now the only way to grant a plan, and it
  // requires a real, single-use, server-minted token.
  it("403s (grants nothing) when no PurchaseIntent matches the token", async () => {
    mockClient.auth.me.mockResolvedValue({ id: "u1", email: "u@x.com" });
    mockClient.asServiceRole.entities.PurchaseIntent.filter.mockResolvedValue([]);
    const res = await handler(makeReq({ token: "not-a-real-token" }));
    expect(res.status).toBe(403);
    expect(mockClient.asServiceRole.entities.User.update).not.toHaveBeenCalled();
  });

  it("403s when the token belongs to a different user", async () => {
    mockClient.auth.me.mockResolvedValue({ id: "u1", email: "attacker@x.com" });
    mockClient.asServiceRole.entities.PurchaseIntent.filter.mockResolvedValue([
      { id: "pi1", token: "t1", user_email: "victim@x.com", plan_id: "handyman_pro", status: "pending" },
    ]);
    const res = await handler(makeReq({ token: "t1" }));
    expect(res.status).toBe(403);
    expect(mockClient.asServiceRole.entities.User.update).not.toHaveBeenCalled();
  });

  it("403s (single-use) when the token was already consumed", async () => {
    mockClient.auth.me.mockResolvedValue({ id: "u1", email: "u@x.com" });
    mockClient.asServiceRole.entities.PurchaseIntent.filter.mockResolvedValue([
      { id: "pi1", token: "t1", user_email: "u@x.com", plan_id: "handyman_pro", status: "completed" },
    ]);
    const res = await handler(makeReq({ token: "t1" }));
    expect(res.status).toBe(403);
    expect(mockClient.asServiceRole.entities.User.update).not.toHaveBeenCalled();
  });

  it("grants a subscription plan onto User.plan and marks the intent completed", async () => {
    mockClient.auth.me.mockResolvedValue({ id: "u1", email: "u@x.com" });
    mockClient.asServiceRole.entities.PurchaseIntent.filter.mockResolvedValue([
      { id: "pi1", token: "t1", user_email: "u@x.com", plan_id: "handyman_pro", status: "pending" },
    ]);

    const res = await handler(makeReq({ token: "t1" }));
    expect(res.status ?? 200).toBe(200);
    expect(mockClient.asServiceRole.entities.PurchaseIntent.update).toHaveBeenCalledWith("pi1", { status: "completed" });
    expect(mockClient.asServiceRole.entities.User.update).toHaveBeenCalledWith("u1", { plan: "handyman_pro" });
  });

  it("grants priority_booking as a one-shot flag on the user", async () => {
    mockClient.auth.me.mockResolvedValue({ id: "u1", email: "u@x.com" });
    mockClient.asServiceRole.entities.PurchaseIntent.filter.mockResolvedValue([
      { id: "pi1", token: "t1", user_email: "u@x.com", plan_id: "priority_booking", status: "pending" },
    ]);

    await handler(makeReq({ token: "t1" }));
    expect(mockClient.asServiceRole.entities.User.update).toHaveBeenCalledWith("u1", { pending_priority_boost: true });
  });

  it("grants verified_pro onto the caller's Contractor row", async () => {
    mockClient.auth.me.mockResolvedValue({ id: "u1", email: "pro@x.com" });
    mockClient.asServiceRole.entities.PurchaseIntent.filter.mockResolvedValue([
      { id: "pi1", token: "t1", user_email: "pro@x.com", plan_id: "verified_pro", status: "pending" },
    ]);
    mockClient.asServiceRole.entities.Contractor.filter.mockResolvedValue([{ id: "con1" }]);

    await handler(makeReq({ token: "t1" }));
    expect(mockClient.asServiceRole.entities.Contractor.filter).toHaveBeenCalledWith({ created_by: "pro@x.com" });
    expect(mockClient.asServiceRole.entities.Contractor.update).toHaveBeenCalledWith("con1", { is_verified_pro: true });
  });

  it("grants featured_listing as a 7-day featured_until on the Contractor row", async () => {
    mockClient.auth.me.mockResolvedValue({ id: "u1", email: "pro@x.com" });
    mockClient.asServiceRole.entities.PurchaseIntent.filter.mockResolvedValue([
      { id: "pi1", token: "t1", user_email: "pro@x.com", plan_id: "featured_listing", status: "pending" },
    ]);
    mockClient.asServiceRole.entities.Contractor.filter.mockResolvedValue([{ id: "con1" }]);

    const before = Date.now();
    await handler(makeReq({ token: "t1" }));
    const [, payload] = mockClient.asServiceRole.entities.Contractor.update.mock.calls[0];
    const featuredUntil = new Date(payload.featured_until).getTime();
    expect(featuredUntil).toBeGreaterThan(before + 6 * 24 * 60 * 60 * 1000);
    expect(featuredUntil).toBeLessThan(before + 8 * 24 * 60 * 60 * 1000);
  });

  it("does not throw when granting verified_pro/featured_listing but the caller has no Contractor row yet", async () => {
    mockClient.auth.me.mockResolvedValue({ id: "u1", email: "pro@x.com" });
    mockClient.asServiceRole.entities.PurchaseIntent.filter.mockResolvedValue([
      { id: "pi1", token: "t1", user_email: "pro@x.com", plan_id: "verified_pro", status: "pending" },
    ]);
    mockClient.asServiceRole.entities.Contractor.filter.mockResolvedValue([]);

    const res = await handler(makeReq({ token: "t1" }));
    expect(res.status ?? 200).toBe(200);
    expect(mockClient.asServiceRole.entities.Contractor.update).not.toHaveBeenCalled();
  });

  it("400s a token whose plan_id no longer exists in the PLANS table (e.g. retired realtor_pro)", async () => {
    mockClient.auth.me.mockResolvedValue({ id: "u1", email: "u@x.com" });
    mockClient.asServiceRole.entities.PurchaseIntent.filter.mockResolvedValue([
      { id: "pi1", token: "t1", user_email: "u@x.com", plan_id: "realtor_pro", status: "pending" },
    ]);

    const res = await handler(makeReq({ token: "t1" }));
    expect(res.status).toBe(400);
    expect(mockClient.asServiceRole.entities.User.update).not.toHaveBeenCalled();
  });

  it("returns 500 and does not throw on an unexpected error", async () => {
    mockClient.auth.me.mockRejectedValue(new Error("network down"));
    const res = await handler(makeReq({ token: "t1" }));
    expect(res.status).toBe(500);
  });
});
