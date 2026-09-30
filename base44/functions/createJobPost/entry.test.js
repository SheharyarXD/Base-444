import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("npm:@base44/sdk@0.8.31", () => ({
  createClientFromRequest: vi.fn(() => mockClient),
}));

const mockClient = {
  auth: { me: vi.fn() },
  asServiceRole: {
    entities: {
      Booking: { create: vi.fn(), get: vi.fn() },
      PostCreditLedger: { filter: vi.fn(), create: vi.fn() },
      CustomerSubscription: { filter: vi.fn() },
      User: { update: vi.fn() },
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

const CUSTOMER = { id: "u1", email: "cust@x.com", full_name: "Jordan Blake", user_type: "Homeowner" };
const KEY = "idem-key-0001";
const JOB = {
  job_title: "Fix leaking sink", category: "Plumbing", address: "482 Willow Creek Dr",
  city: "Austin", state: "TX", zip: "78745", preferred_date: "2026-10-10",
};
const body = (over = {}) => ({ idempotencyKey: KEY, job: JOB, ...over });

/** Ledger entries summing to `n` credits. */
const ledger = (n) => (n === 0 ? [] : [{ id: "l1", delta: n, reason: "purchase" }]);
const activeSub = [{
  id: "s1", plan_id: "customer_monthly", status: "active",
  current_period_end: new Date(Date.now() + 5 * 864e5).toISOString(),
}];

describe("createJobPost", () => {
  let handler;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockClient.auth.me.mockResolvedValue(CUSTOMER);
    // No prior spend for this key; balance of 3; no subscription.
    mockClient.asServiceRole.entities.PostCreditLedger.filter.mockImplementation(async (q) =>
      q.ref ? [] : ledger(3),
    );
    mockClient.asServiceRole.entities.CustomerSubscription.filter.mockResolvedValue([]);
    mockClient.asServiceRole.entities.Booking.create.mockResolvedValue({ id: "b1", job_title: JOB.job_title });
    handler = await loadHandler();
  });

  it("rejects an unauthenticated caller", async () => {
    mockClient.auth.me.mockResolvedValue(null);
    const res = await handler(req(body()));
    expect(res.status).toBe(401);
    expect(mockClient.asServiceRole.entities.Booking.create).not.toHaveBeenCalled();
  });

  describe("input validation", () => {
    it("requires an idempotency key", async () => {
      expect((await handler(req({ job: JOB }))).status).toBe(400);
      expect((await handler(req({ job: JOB, idempotencyKey: "short" }))).status).toBe(400);
    });

    it("requires the mandatory job fields", async () => {
      for (const missing of ["job_title", "address", "preferred_date", "category"]) {
        const job = { ...JOB };
        delete job[missing];
        expect((await handler(req(body({ job })))).status).toBe(400);
      }
    });
  });

  describe("entitlement", () => {
    it("refuses to post with no credits and no subscription", async () => {
      mockClient.asServiceRole.entities.PostCreditLedger.filter.mockImplementation(async (q) =>
        q.ref ? [] : ledger(0),
      );
      const res = await handler(req(body()));
      expect(res.status).toBe(402);
      expect((await res.json()).code).toBe("no_entitlement");
      expect(mockClient.asServiceRole.entities.Booking.create).not.toHaveBeenCalled();
    });

    it("refuses when the balance has been spent down to zero", async () => {
      mockClient.asServiceRole.entities.PostCreditLedger.filter.mockImplementation(async (q) =>
        q.ref ? [] : [{ delta: 3 }, { delta: -1 }, { delta: -1 }, { delta: -1 }],
      );
      expect((await handler(req(body()))).status).toBe(402);
    });

    it("posts and spends one credit when credits are available", async () => {
      const res = await handler(req(body()));
      const out = await res.json();
      expect(out.success).toBe(true);
      expect(out.creditConsumed).toBe(true);
      expect(out.creditsRemaining).toBe(2);
      const spend = mockClient.asServiceRole.entities.PostCreditLedger.create.mock.calls[0][0];
      expect(spend.delta).toBe(-1);
      expect(spend.reason).toBe("post");
      expect(spend.booking_id).toBe("b1");
    });

    it("spends exactly one credit, never more", async () => {
      await handler(req(body()));
      expect(mockClient.asServiceRole.entities.PostCreditLedger.create).toHaveBeenCalledTimes(1);
    });

    it("posts without spending a credit when a subscription is active", async () => {
      mockClient.asServiceRole.entities.CustomerSubscription.filter.mockResolvedValue(activeSub);
      mockClient.asServiceRole.entities.PostCreditLedger.filter.mockImplementation(async (q) =>
        q.ref ? [] : ledger(0),
      );
      const out = await (await handler(req(body()))).json();
      expect(out.success).toBe(true);
      expect(out.creditConsumed).toBe(false);
      expect(mockClient.asServiceRole.entities.PostCreditLedger.create).not.toHaveBeenCalled();
    });

    it("honours a cancelled subscription until its paid period ends", async () => {
      mockClient.asServiceRole.entities.CustomerSubscription.filter.mockResolvedValue([
        { ...activeSub[0], status: "cancelled" },
      ]);
      mockClient.asServiceRole.entities.PostCreditLedger.filter.mockImplementation(async (q) =>
        q.ref ? [] : ledger(0),
      );
      expect((await (await handler(req(body()))).json()).success).toBe(true);
    });

    it("does not honour an expired subscription", async () => {
      mockClient.asServiceRole.entities.CustomerSubscription.filter.mockResolvedValue([
        { ...activeSub[0], current_period_end: new Date(Date.now() - 864e5).toISOString() },
      ]);
      mockClient.asServiceRole.entities.PostCreditLedger.filter.mockImplementation(async (q) =>
        q.ref ? [] : ledger(0),
      );
      expect((await handler(req(body()))).status).toBe(402);
    });

    it("does not honour a failed-payment subscription", async () => {
      mockClient.asServiceRole.entities.CustomerSubscription.filter.mockResolvedValue([
        { ...activeSub[0], status: "payment_failed" },
      ]);
      mockClient.asServiceRole.entities.PostCreditLedger.filter.mockImplementation(async (q) =>
        q.ref ? [] : ledger(0),
      );
      expect((await handler(req(body()))).status).toBe(402);
    });
  });

  describe("no credit is lost when posting fails", () => {
    it("spends nothing if creating the job throws", async () => {
      mockClient.asServiceRole.entities.Booking.create.mockRejectedValue(new Error("db down"));
      const res = await handler(req(body()));
      expect(res.status).toBe(500);
      expect(mockClient.asServiceRole.entities.PostCreditLedger.create).not.toHaveBeenCalled();
    });

    it("creates the job before spending, never the other way round", async () => {
      const order = [];
      mockClient.asServiceRole.entities.Booking.create.mockImplementation(async () => {
        order.push("create"); return { id: "b1", job_title: "x" };
      });
      mockClient.asServiceRole.entities.PostCreditLedger.create.mockImplementation(async () => {
        order.push("spend"); return {};
      });
      await handler(req(body()));
      expect(order).toEqual(["create", "spend"]);
    });
  });

  describe("double submission", () => {
    it("returns the original job instead of posting twice", async () => {
      mockClient.asServiceRole.entities.PostCreditLedger.filter.mockImplementation(async (q) =>
        q.ref ? [{ id: "l9", ref: q.ref, booking_id: "b1", delta: -1 }] : ledger(3),
      );
      mockClient.asServiceRole.entities.Booking.get.mockResolvedValue({ id: "b1" });

      const out = await (await handler(req(body()))).json();
      expect(out.duplicate).toBe(true);
      expect(out.booking.id).toBe("b1");
      expect(mockClient.asServiceRole.entities.Booking.create).not.toHaveBeenCalled();
      expect(mockClient.asServiceRole.entities.PostCreditLedger.create).not.toHaveBeenCalled();
    });

    it("keys the spend on the idempotency key so a replay is detectable", async () => {
      await handler(req(body()));
      const spend = mockClient.asServiceRole.entities.PostCreditLedger.create.mock.calls[0][0];
      expect(spend.ref).toBe(`post:${KEY}`);
    });

    it("treats a different key as a genuinely new post", async () => {
      await handler(req(body({ idempotencyKey: "another-key-0002" })));
      expect(mockClient.asServiceRole.entities.Booking.create).toHaveBeenCalledTimes(1);
    });
  });

  describe("the browser does not get to decide", () => {
    it("ignores a client-supplied owner, status and priority flag", async () => {
      await handler(req(body({
        job: { ...JOB, created_by: "someone@else.com", customer_email: "someone@else.com", status: "completed", is_priority: true },
      })));
      const created = mockClient.asServiceRole.entities.Booking.create.mock.calls[0][0];
      expect(created.created_by).toBe(CUSTOMER.email);
      expect(created.customer_email).toBe(CUSTOMER.email);
      expect(created.status).toBe("pending");
      expect(created.is_priority).toBeUndefined();
    });

    it("reads the priority add-on from the account, not the request", async () => {
      mockClient.auth.me.mockResolvedValue({ ...CUSTOMER, pending_priority_boost: true });
      await handler(req(body()));
      const created = mockClient.asServiceRole.entities.Booking.create.mock.calls[0][0];
      expect(created.is_priority).toBe(true);
      // And it is one-shot.
      expect(mockClient.asServiceRole.entities.User.update).toHaveBeenCalledWith("u1", { pending_priority_boost: false });
    });

    it("drops unknown fields rather than writing them", async () => {
      await handler(req(body({ job: { ...JOB, some_injected_field: "x", verification_status: "verified" } })));
      const created = mockClient.asServiceRole.entities.Booking.create.mock.calls[0][0];
      expect(created.some_injected_field).toBeUndefined();
      expect(created.verification_status).toBeUndefined();
    });

    it("cannot spend another customer's credits", async () => {
      // The balance query is always scoped to the caller's own email.
      await handler(req(body()));
      const balanceQuery = mockClient.asServiceRole.entities.PostCreditLedger.filter.mock.calls
        .find((c) => c[0] && c[0].customer_email);
      expect(balanceQuery[0].customer_email).toBe(CUSTOMER.email);
      const spend = mockClient.asServiceRole.entities.PostCreditLedger.create.mock.calls[0][0];
      expect(spend.customer_email).toBe(CUSTOMER.email);
    });
  });

  it("returns 500 without throwing on an unexpected error", async () => {
    mockClient.auth.me.mockRejectedValue(new Error("network down"));
    expect((await handler(req(body()))).status).toBe(500);
  });
});
