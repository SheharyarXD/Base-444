import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("npm:@base44/sdk@0.8.31", () => ({
  createClientFromRequest: vi.fn(() => mockClient),
}));

const mockClient = {
  auth: { me: vi.fn() },
  asServiceRole: {
    entities: {
      Contractor: { filter: vi.fn(), update: vi.fn() },
      ContractorVerification: { filter: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
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
    mockClient.asServiceRole.entities.ContractorVerification.filter.mockResolvedValue([]);
    mockClient.asServiceRole.entities.ContractorVerification.create.mockResolvedValue({ id: "cv1" });
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
        // license_number / ein_number are deliberately NOT here any more —
        // they go to the restricted ContractorVerification record, and are
        // explicitly nulled on the public profile. See the
        // "keeps identifiers off the public profile" suite below.
        license_number: null,
        ein_number: null,
        state: "VA",
        business_name: "Smith's Plumbing LLC",
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

  // The whole point of the split: identifiers must never be written back onto
  // the publicly readable provider profile.
  describe("keeps identifiers off the public profile", () => {
    beforeEach(() => {
      mockClient.auth.me.mockResolvedValue({ email: "pro@x.com", user_type: "Contractor" });
      mockClient.asServiceRole.entities.Contractor.filter.mockResolvedValue([{ id: "con1" }]);
      mockClient.asServiceRole.entities.Contractor.update.mockResolvedValue({ id: "con1" });
    });

    it("writes the licence number and EIN to the restricted record", async () => {
      await handler(makeReq(validSubmission));
      const created = mockClient.asServiceRole.entities.ContractorVerification.create.mock.calls[0][0];
      expect(created.license_number).toBe("2705123456");
      expect(created.contractor_email).toBe("pro@x.com");
      expect(created.contractor_id).toBe("con1");
    });

    it("does NOT write the licence number or EIN onto the public profile", async () => {
      await handler(makeReq(validSubmission));
      const publicPatch = mockClient.asServiceRole.entities.Contractor.update.mock.calls[0][1];
      expect(publicPatch.license_number).toBeNull();
      expect(publicPatch.ein_number).toBeNull();
    });

    it("still puts the non-sensitive trust signals on the public profile", async () => {
      await handler(makeReq(validSubmission));
      const publicPatch = mockClient.asServiceRole.entities.Contractor.update.mock.calls[0][1];
      expect(publicPatch.state).toBe("VA");
      expect(publicPatch.verification_status).toBeTruthy();
      expect(publicPatch.business_name).toBeTruthy();
    });

    it("clears identifiers left on an older profile, so resubmitting repairs it", async () => {
      await handler(makeReq(validSubmission));
      const publicPatch = mockClient.asServiceRole.entities.Contractor.update.mock.calls[0][1];
      expect(Object.keys(publicPatch)).toContain("license_number");
      expect(publicPatch.license_number).toBeNull();
    });

    it("updates the existing restricted record instead of creating duplicates", async () => {
      mockClient.asServiceRole.entities.ContractorVerification.filter.mockResolvedValue([{ id: "cv-existing" }]);
      await handler(makeReq(validSubmission));
      expect(mockClient.asServiceRole.entities.ContractorVerification.update).toHaveBeenCalledWith(
        "cv-existing",
        expect.objectContaining({ license_number: "2705123456" }),
      );
      expect(mockClient.asServiceRole.entities.ContractorVerification.create).not.toHaveBeenCalled();
    });

    it("collapses pre-existing duplicates down to one record", async () => {
      mockClient.asServiceRole.entities.ContractorVerification.filter.mockResolvedValue([
        { id: "cv-a" }, { id: "cv-b" }, { id: "cv-c" },
      ]);
      await handler(makeReq(validSubmission));
      expect(mockClient.asServiceRole.entities.ContractorVerification.delete).toHaveBeenCalledWith("cv-b");
      expect(mockClient.asServiceRole.entities.ContractorVerification.delete).toHaveBeenCalledWith("cv-c");
      expect(mockClient.asServiceRole.entities.ContractorVerification.delete).not.toHaveBeenCalledWith("cv-a");
    });
  });
});
