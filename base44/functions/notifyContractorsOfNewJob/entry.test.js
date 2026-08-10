import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("npm:@base44/sdk@0.8.25", () => ({
  createClientFromRequest: vi.fn(() => mockClient),
}));

const mockClient = {
  asServiceRole: {
    entities: {
      Contractor: { filter: vi.fn() },
      User: { filter: vi.fn() },
    },
    integrations: { Core: { SendEmail: vi.fn() } },
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

const openJob = {
  id: "b1",
  job_title: "Fix sink",
  category: "Plumbing",
  zip: "10001",
  city: "New York",
  state: "NY",
  address: "123 Main St",
  preferred_date: "2026-08-01",
  preferred_time: "Flexible",
};

describe("notifyContractorsOfNewJob", () => {
  let handler;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockClient.asServiceRole.entities.User.filter.mockResolvedValue([{ email: "provider@x.com" }]);
    handler = await loadHandler();
  });

  it("ignores non-create events", async () => {
    const res = await handler(makeReq({ event: { type: "update", data: openJob } }));
    const body = await res.json();
    expect(body.message).toMatch(/not a create event/i);
    expect(mockClient.asServiceRole.entities.Contractor.filter).not.toHaveBeenCalled();
  });

  it("skips bookings with no zip code", async () => {
    const res = await handler(makeReq({ event: { type: "create", data: { ...openJob, zip: undefined } } }));
    const body = await res.json();
    expect(body.message).toMatch(/no zip code/i);
    expect(mockClient.asServiceRole.entities.Contractor.filter).not.toHaveBeenCalled();
  });

  it("skips bookings with no category (defensive — should not happen given required schema field)", async () => {
    const res = await handler(makeReq({ event: { type: "create", data: { ...openJob, category: undefined } } }));
    const body = await res.json();
    expect(body.message).toMatch(/no category/i);
    expect(mockClient.asServiceRole.entities.Contractor.filter).not.toHaveBeenCalled();
  });

  it("queries contractor candidates scoped to the job's category (zip/radius resolved after fetching)", async () => {
    mockClient.asServiceRole.entities.Contractor.filter.mockResolvedValue([]);
    await handler(makeReq({ event: { type: "create", data: openJob } }));
    expect(mockClient.asServiceRole.entities.Contractor.filter).toHaveBeenCalledWith(
      { category: "Plumbing" },
      "-created_date",
      200
    );
  });

  it("notifies a contractor whose preferred_zip_code exactly matches the job zip, with no geocoding needed", async () => {
    mockClient.asServiceRole.entities.Contractor.filter.mockResolvedValue([
      { created_by: "exact@x.com", preferred_zip_code: "10001" },
    ]);
    mockClient.asServiceRole.entities.User.filter.mockImplementation(async ({ email }) => [{ email }]);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await handler(makeReq({ event: { type: "create", data: openJob } }));

    expect(mockClient.asServiceRole.integrations.Core.SendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "exact@x.com" })
    );
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  // Regression test for the confirmed Phase 0 bug: a contractor whose
  // preferred zip is close-but-not-identical to the job's zip, but who set a
  // preferred_miles_distance radius specifically to catch cases like that,
  // used to never be notified at all because the DB filter required an
  // exact string match.
  it("notifies a near-miss contractor (different zip) whose geocoded distance is within their preferred radius", async () => {
    mockClient.asServiceRole.entities.Contractor.filter.mockResolvedValue([
      { created_by: "near@x.com", preferred_zip_code: "10002", preferred_miles_distance: 10 },
    ]);
    mockClient.asServiceRole.entities.User.filter.mockImplementation(async ({ email }) => [{ email }]);
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => [{ lat: "40.7150", lon: "-74.0000" }], // ~1 mile from the job's coords below
    });
    vi.stubGlobal("fetch", fetchMock);

    const res = await handler(makeReq({
      event: { type: "create", data: { ...openJob, job_lat: 40.7128, job_lng: -74.006 } },
    }));
    const body = await res.json();

    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("postalcode=10002"));
    expect(mockClient.asServiceRole.integrations.Core.SendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "near@x.com" })
    );
    expect(body.contractorsNotified).toBe(1);
    vi.unstubAllGlobals();
  });

  it("does not notify a near-miss contractor whose geocoded distance exceeds their preferred radius", async () => {
    mockClient.asServiceRole.entities.Contractor.filter.mockResolvedValue([
      { created_by: "far@x.com", preferred_zip_code: "90210", preferred_miles_distance: 5 },
    ]);
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => [{ lat: "34.0901", lon: "-118.4065" }], // Beverly Hills — far from NYC
    });
    vi.stubGlobal("fetch", fetchMock);

    const res = await handler(makeReq({
      event: { type: "create", data: { ...openJob, job_lat: 40.7128, job_lng: -74.006 } },
    }));
    const body = await res.json();

    expect(mockClient.asServiceRole.integrations.Core.SendEmail).not.toHaveBeenCalled();
    expect(body.message).toMatch(/no matching contractors/i);
    vi.unstubAllGlobals();
  });

  it("does not attempt geocoding for a near-miss contractor with no preferred_miles_distance set", async () => {
    mockClient.asServiceRole.entities.Contractor.filter.mockResolvedValue([
      { created_by: "noradius@x.com", preferred_zip_code: "10002" },
    ]);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await handler(makeReq({
      event: { type: "create", data: { ...openJob, job_lat: 40.7128, job_lng: -74.006 } },
    }));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(mockClient.asServiceRole.integrations.Core.SendEmail).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("falls back to exact-zip-only matching when the job has no geocoded coordinates", async () => {
    mockClient.asServiceRole.entities.Contractor.filter.mockResolvedValue([
      { created_by: "near@x.com", preferred_zip_code: "10002", preferred_miles_distance: 50 },
    ]);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const res = await handler(makeReq({ event: { type: "create", data: openJob } })); // no job_lat/job_lng
    const body = await res.json();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(body.message).toMatch(/no matching contractors/i);
    vi.unstubAllGlobals();
  });

  it("reports no matches without sending email when no contractors match", async () => {
    mockClient.asServiceRole.entities.Contractor.filter.mockResolvedValue([]);
    const res = await handler(makeReq({ event: { type: "create", data: openJob } }));
    const body = await res.json();
    expect(body.message).toMatch(/no matching contractors/i);
    expect(mockClient.asServiceRole.integrations.Core.SendEmail).not.toHaveBeenCalled();
  });

  it("emails every matching contractor's user account", async () => {
    mockClient.asServiceRole.entities.Contractor.filter.mockResolvedValue([
      { created_by: "p1@x.com", preferred_zip_code: "10001" },
      { created_by: "p2@x.com", preferred_zip_code: "10001" },
    ]);
    mockClient.asServiceRole.entities.User.filter.mockImplementation(async ({ email }) => [{ email }]);

    const res = await handler(makeReq({ event: { type: "create", data: openJob } }));
    const body = await res.json();
    expect(body.contractorsNotified).toBe(2);
    expect(mockClient.asServiceRole.integrations.Core.SendEmail).toHaveBeenCalledTimes(2);
    expect(mockClient.asServiceRole.integrations.Core.SendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "p1@x.com" })
    );
    expect(mockClient.asServiceRole.integrations.Core.SendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "p2@x.com" })
    );
  });

  it("skips a matching contractor whose User account can't be found, without failing the whole batch", async () => {
    mockClient.asServiceRole.entities.Contractor.filter.mockResolvedValue([
      { created_by: "orphan@x.com", preferred_zip_code: "10001" },
      { created_by: "p2@x.com", preferred_zip_code: "10001" },
    ]);
    mockClient.asServiceRole.entities.User.filter.mockImplementation(async ({ email }) =>
      email === "orphan@x.com" ? [] : [{ email }]
    );

    const res = await handler(makeReq({ event: { type: "create", data: openJob } }));
    const body = await res.json();
    expect(mockClient.asServiceRole.integrations.Core.SendEmail).toHaveBeenCalledTimes(1);
    expect(body.contractorsNotified).toBe(2); // reports contractors matched, not emails actually sent
  });

  it("does not notify a contractor of a different category even in the same zip", async () => {
    mockClient.asServiceRole.entities.Contractor.filter.mockImplementation(async (query) => {
      // Simulates the real DB-side filter: only Plumbing contractors exist.
      if (query.category !== "Plumbing") return [];
      return [{ created_by: "plumber@x.com", preferred_zip_code: "10001" }];
    });
    await handler(makeReq({ event: { type: "create", data: { ...openJob, category: "Electrical" } } }));
    expect(mockClient.asServiceRole.integrations.Core.SendEmail).not.toHaveBeenCalled();
  });

  // The notification path only ever forwards whatever category the booking
  // carries into the DB filter — it has no hardcoded category allowlist, so
  // newly added categories need no code change here, only test coverage.
  it("routes notifications correctly for the newly added 'Pressure Washing Services' category", async () => {
    mockClient.asServiceRole.entities.Contractor.filter.mockImplementation(async (query) => {
      if (query.category !== "Pressure Washing Services") return [];
      return [{ created_by: "washer@x.com", preferred_zip_code: "10001" }];
    });
    mockClient.asServiceRole.entities.User.filter.mockImplementation(async ({ email }) => [{ email }]);
    const res = await handler(
      makeReq({ event: { type: "create", data: { ...openJob, category: "Pressure Washing Services" } } })
    );
    const body = await res.json();
    expect(mockClient.asServiceRole.entities.Contractor.filter).toHaveBeenCalledWith(
      { category: "Pressure Washing Services" },
      "-created_date",
      200
    );
    expect(mockClient.asServiceRole.integrations.Core.SendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "washer@x.com" })
    );
    expect(body.contractorsNotified).toBe(1);
  });

  it("routes notifications correctly for the newly added 'Contractors' category", async () => {
    mockClient.asServiceRole.entities.Contractor.filter.mockImplementation(async (query) => {
      if (query.category !== "Contractors") return [];
      return [{ created_by: "gc@x.com", preferred_zip_code: "10001" }];
    });
    mockClient.asServiceRole.entities.User.filter.mockImplementation(async ({ email }) => [{ email }]);
    await handler(makeReq({ event: { type: "create", data: { ...openJob, category: "Contractors" } } }));
    expect(mockClient.asServiceRole.integrations.Core.SendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "gc@x.com" })
    );
  });

  it("never notifies a contractor who set no preferred_zip_code at all", async () => {
    mockClient.asServiceRole.entities.Contractor.filter.mockResolvedValue([
      { created_by: "noprefs@x.com" },
    ]);
    const res = await handler(makeReq({ event: { type: "create", data: openJob } }));
    const body = await res.json();
    expect(mockClient.asServiceRole.integrations.Core.SendEmail).not.toHaveBeenCalled();
    expect(body.message).toMatch(/no matching contractors/i);
  });
});
