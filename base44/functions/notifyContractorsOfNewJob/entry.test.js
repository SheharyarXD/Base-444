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

  it("queries contractors scoped to both the job's category AND zip", async () => {
    mockClient.asServiceRole.entities.Contractor.filter.mockResolvedValue([]);
    await handler(makeReq({ event: { type: "create", data: openJob } }));
    expect(mockClient.asServiceRole.entities.Contractor.filter).toHaveBeenCalledWith(
      { preferred_zip_code: "10001", category: "Plumbing" },
      "-created_date",
      100
    );
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
      { created_by: "p1@x.com" },
      { created_by: "p2@x.com" },
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
      { created_by: "orphan@x.com" },
      { created_by: "p2@x.com" },
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
      // Simulates the real DB-side filter: only Plumbing contractors in this zip exist.
      if (query.category !== "Plumbing") return [];
      return [{ created_by: "plumber@x.com" }];
    });
    await handler(makeReq({ event: { type: "create", data: { ...openJob, category: "Electrical" } } }));
    expect(mockClient.asServiceRole.integrations.Core.SendEmail).not.toHaveBeenCalled();
  });
});
