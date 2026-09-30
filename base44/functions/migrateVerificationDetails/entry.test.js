import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("npm:@base44/sdk@0.8.31", () => ({
  createClientFromRequest: vi.fn(() => mockClient),
}));

const mockClient = {
  auth: { me: vi.fn() },
  asServiceRole: {
    entities: {
      Contractor: { list: vi.fn(), update: vi.fn() },
      ContractorVerification: { filter: vi.fn(), create: vi.fn(), update: vi.fn(), get: vi.fn() },
    },
  },
};

function makeReq(body) {
  return { json: async () => body };
}
const noBody = { json: async () => { throw new Error("no body"); } };

async function loadHandler() {
  const handlers = [];
  globalThis.Deno = { serve: (fn) => handlers.push(fn), env: { get: () => undefined } };
  vi.resetModules();
  await import("./entry.ts");
  return handlers[0];
}

const ADMIN = { id: "a1", email: "admin@x.com", role: "admin" };

function dirtyContractor(over = {}) {
  return {
    id: "con1", created_by: "pro@x.com",
    license_number: "2705123456", ein_number: "12-3456789",
    verification_submitted_date: "2026-01-01T00:00:00.000Z",
    ...over,
  };
}

describe("migrateVerificationDetails", () => {
  let handler;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockClient.asServiceRole.entities.ContractorVerification.filter.mockResolvedValue([]);
    mockClient.asServiceRole.entities.ContractorVerification.create.mockResolvedValue({ id: "cv1" });
    mockClient.asServiceRole.entities.ContractorVerification.get.mockResolvedValue({
      id: "cv1", license_number: "2705123456", ein_number: "12-3456789",
    });
    mockClient.asServiceRole.entities.Contractor.update.mockResolvedValue({ id: "con1" });
    handler = await loadHandler();
  });

  describe("authorization", () => {
    it("rejects an unauthenticated caller", async () => {
      mockClient.auth.me.mockResolvedValue(null);
      const res = await handler(noBody);
      expect(res.status).toBe(401);
      expect(mockClient.asServiceRole.entities.Contractor.update).not.toHaveBeenCalled();
    });

    it("rejects a normal signed-in user", async () => {
      mockClient.auth.me.mockResolvedValue({ id: "u1", email: "pro@x.com", role: "user" });
      const res = await handler(noBody);
      expect(res.status).toBe(403);
      expect(mockClient.asServiceRole.entities.Contractor.list).not.toHaveBeenCalled();
    });

    it("rejects a user with no role at all", async () => {
      mockClient.auth.me.mockResolvedValue({ id: "u1", email: "pro@x.com" });
      const res = await handler(noBody);
      expect(res.status).toBe(403);
    });

    it("allows an administrator", async () => {
      mockClient.auth.me.mockResolvedValue(ADMIN);
      mockClient.asServiceRole.entities.Contractor.list.mockResolvedValue([]);
      const res = await handler(noBody);
      expect(res.status ?? 200).toBe(200);
    });
  });

  describe("migrating a provider still carrying identifiers", () => {
    beforeEach(() => {
      mockClient.auth.me.mockResolvedValue(ADMIN);
      mockClient.asServiceRole.entities.Contractor.list.mockResolvedValue([dirtyContractor()]);
    });

    it("copies the identifiers into the restricted record", async () => {
      await handler(noBody);
      const created = mockClient.asServiceRole.entities.ContractorVerification.create.mock.calls[0][0];
      expect(created.license_number).toBe("2705123456");
      expect(created.ein_number).toBe("12-3456789");
      expect(created.contractor_email).toBe("pro@x.com");
    });

    it("clears both identifiers from the public profile", async () => {
      await handler(noBody);
      expect(mockClient.asServiceRole.entities.Contractor.update).toHaveBeenCalledWith("con1", {
        license_number: null,
        ein_number: null,
      });
    });

    it("copies BEFORE clearing, so a failure cannot destroy the only copy", async () => {
      const order = [];
      mockClient.asServiceRole.entities.ContractorVerification.create.mockImplementation(async () => {
        order.push("copy"); return { id: "cv1" };
      });
      mockClient.asServiceRole.entities.Contractor.update.mockImplementation(async () => {
        order.push("clear"); return { id: "con1" };
      });
      await handler(noBody);
      expect(order).toEqual(["copy", "clear"]);
    });

    it("does NOT clear the public fields if the private copy cannot be read back", async () => {
      mockClient.asServiceRole.entities.ContractorVerification.get.mockResolvedValue(null);
      const res = await handler(noBody);
      expect(mockClient.asServiceRole.entities.Contractor.update).not.toHaveBeenCalled();
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.report.failed).toHaveLength(1);
    });

    it("does not clear if the read-back shows a different licence number", async () => {
      mockClient.asServiceRole.entities.ContractorVerification.get.mockResolvedValue({
        id: "cv1", license_number: "SOMETHING-ELSE",
      });
      await handler(noBody);
      expect(mockClient.asServiceRole.entities.Contractor.update).not.toHaveBeenCalled();
    });

    it("skips a row with no owner email rather than creating an unreachable record", async () => {
      // A private row keyed to an empty email could be read by nobody.
      mockClient.asServiceRole.entities.Contractor.list.mockResolvedValue([
        dirtyContractor({ created_by: null }),
      ]);
      const res = await handler(noBody);
      expect(mockClient.asServiceRole.entities.ContractorVerification.create).not.toHaveBeenCalled();
      expect((await res.json()).report.failed).toHaveLength(1);
    });
  });

  describe("idempotency", () => {
    beforeEach(() => mockClient.auth.me.mockResolvedValue(ADMIN));

    it("does nothing to a profile already cleared", async () => {
      mockClient.asServiceRole.entities.Contractor.list.mockResolvedValue([
        dirtyContractor({ license_number: null, ein_number: null }),
      ]);
      const res = await handler(noBody);
      const body = await res.json();
      expect(body.report.alreadyClean).toBe(1);
      expect(body.report.needingMigration).toBe(0);
      expect(mockClient.asServiceRole.entities.Contractor.update).not.toHaveBeenCalled();
    });

    it("treats empty-string identifiers as already clean", async () => {
      mockClient.asServiceRole.entities.Contractor.list.mockResolvedValue([
        dirtyContractor({ license_number: "", ein_number: "" }),
      ]);
      expect((await (await handler(noBody)).json()).report.alreadyClean).toBe(1);
    });

    it("never overwrites a value captured by a real submission with an older one", async () => {
      mockClient.asServiceRole.entities.ContractorVerification.filter.mockResolvedValue([
        { id: "cv-existing", license_number: "NEWER-NUMBER", ein_number: "99-9999999" },
      ]);
      mockClient.asServiceRole.entities.ContractorVerification.get.mockResolvedValue({
        id: "cv-existing", license_number: "NEWER-NUMBER",
      });
      mockClient.asServiceRole.entities.Contractor.list.mockResolvedValue([dirtyContractor()]);
      await handler(noBody);
      const patch = mockClient.asServiceRole.entities.ContractorVerification.update.mock.calls[0][1];
      expect(patch.license_number).toBe("NEWER-NUMBER");
    });
  });

  describe("dry run", () => {
    beforeEach(() => mockClient.auth.me.mockResolvedValue(ADMIN));

    it("reports what would change without writing anything", async () => {
      mockClient.asServiceRole.entities.Contractor.list.mockResolvedValue([
        dirtyContractor(), dirtyContractor({ id: "con2", license_number: null, ein_number: null }),
      ]);
      const res = await handler(makeReq({ dryRun: true }));
      const body = await res.json();
      expect(body.report.needingMigration).toBe(1);
      expect(body.report.alreadyClean).toBe(1);
      expect(body.report.cleared).toBe(0);
      expect(mockClient.asServiceRole.entities.Contractor.update).not.toHaveBeenCalled();
      expect(mockClient.asServiceRole.entities.ContractorVerification.create).not.toHaveBeenCalled();
    });
  });

  it("continues past a single failing provider and reports it", async () => {
    mockClient.auth.me.mockResolvedValue(ADMIN);
    mockClient.asServiceRole.entities.Contractor.list.mockResolvedValue([
      dirtyContractor({ id: "bad" }), dirtyContractor({ id: "good", created_by: "other@x.com" }),
    ]);
    mockClient.asServiceRole.entities.ContractorVerification.create
      .mockRejectedValueOnce(new Error("write failed"))
      .mockResolvedValue({ id: "cv2" });

    const body = await (await handler(noBody)).json();
    expect(body.report.failed).toHaveLength(1);
    expect(body.report.cleared).toBe(1);
  });

  it("returns 500 without throwing on an unexpected error", async () => {
    mockClient.auth.me.mockRejectedValue(new Error("network down"));
    const res = await handler(noBody);
    expect(res.status).toBe(500);
  });
});
