import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("npm:@base44/sdk@0.8.31", () => ({
  createClientFromRequest: vi.fn(() => mockClient),
}));

const mockClient = {
  auth: { me: vi.fn() },
  asServiceRole: {
    entities: {
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

const validSubmission = {
  licenseNumber: "2705123456",
  state: "VA",
  businessName: "Smith's Plumbing LLC",
  einNumber: "12-3456789",
};

describe("submitContractorVerification", () => {
  let handler;

  beforeEach(async () => {
    vi.clearAllMocks();
    handler = await loadHandler();
  });

  it("rejects when unauthenticated", async () => {
    mockClient.auth.me.mockResolvedValue(null);
    const res = await handler(makeReq(validSubmission));
    expect(res.status).toBe(401);
  });

  it("rejects non-provider account types", async () => {
    mockClient.auth.me.mockResolvedValue({ email: "h@x.com", user_type: "Homeowner" });
    const res = await handler(makeReq(validSubmission));
    expect(res.status).toBe(403);
  });

  it("400s with field errors on an invalid submission (missing business name)", async () => {
    mockClient.auth.me.mockResolvedValue({ email: "c@x.com", user_type: "Contractor" });
    const res = await handler(makeReq({ ...validSubmission, businessName: "" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.fieldErrors.businessName).toBeTruthy();
  });

  it("400s on an invalid state (no per-state format assumed, just a valid-state check)", async () => {
    mockClient.auth.me.mockResolvedValue({ email: "c@x.com", user_type: "Contractor" });
    const res = await handler(makeReq({ ...validSubmission, state: "ZZ" }));
    expect(res.status).toBe(400);
  });

  it("403s when the user has no Contractor profile yet", async () => {
    mockClient.auth.me.mockResolvedValue({ email: "c@x.com", user_type: "Contractor" });
    mockClient.asServiceRole.entities.Contractor.filter.mockResolvedValue([]);
    const res = await handler(makeReq(validSubmission));
    expect(res.status).toBe(403);
  });

  it("submits successfully and sets verification_status to 'pending' server-side, ignoring any client-sent status", async () => {
    mockClient.auth.me.mockResolvedValue({ email: "c@x.com", user_type: "Contractor" });
    mockClient.asServiceRole.entities.Contractor.filter.mockResolvedValue([{ id: "con1" }]);
    mockClient.asServiceRole.entities.Contractor.update.mockResolvedValue({ id: "con1", verification_status: "pending" });

    // Even if a malicious/careless client tries to set its own status...
    const res = await handler(makeReq({ ...validSubmission, verification_status: "verified" }));

    expect(res.status ?? 200).toBe(200);
    expect(mockClient.asServiceRole.entities.Contractor.update).toHaveBeenCalledWith(
      "con1",
      expect.objectContaining({
        license_number: "2705123456",
        state: "VA",
        business_name: "Smith's Plumbing LLC",
        ein_number: "12-3456789",
        verification_status: "pending", // ...the server always derives this itself
        verification_submitted_date: expect.any(String),
      })
    );
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it("only ever scopes the Contractor lookup to the authenticated user's own record", async () => {
    mockClient.auth.me.mockResolvedValue({ email: "c@x.com", user_type: "Contractor" });
    mockClient.asServiceRole.entities.Contractor.filter.mockResolvedValue([{ id: "con1" }]);
    mockClient.asServiceRole.entities.Contractor.update.mockResolvedValue({ id: "con1" });

    await handler(makeReq(validSubmission));

    expect(mockClient.asServiceRole.entities.Contractor.filter).toHaveBeenCalledWith({ created_by: "c@x.com" });
  });

  it("returns 500 and does not throw on an unexpected error", async () => {
    mockClient.auth.me.mockRejectedValue(new Error("network down"));
    const res = await handler(makeReq(validSubmission));
    expect(res.status).toBe(500);
  });
});
