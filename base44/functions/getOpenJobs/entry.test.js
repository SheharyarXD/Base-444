import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("npm:@base44/sdk@0.8.31", () => ({
  createClientFromRequest: vi.fn(() => mockClient),
}));

const mockClient = {
  auth: { me: vi.fn() },
  asServiceRole: {
    entities: {
      Booking: { filter: vi.fn(), get: vi.fn() },
      Contractor: { filter: vi.fn() },
    },
  },
};

const noBody = { json: async () => { throw new Error("no body"); } };
const withBody = (b) => ({ json: async () => b });

async function loadHandler() {
  const handlers = [];
  globalThis.Deno = { serve: (fn) => handlers.push(fn), env: { get: () => undefined } };
  vi.resetModules();
  await import("./entry.ts");
  return handlers[0];
}

// Everything a real booking carries, including the fields that must never
// leave this function.
function booking(over = {}) {
  return {
    id: "b1",
    job_title: "Fix leaking sink",
    job_description: "Under the sink.",
    category: "Plumbing",
    customer_name: "Jordan Blake",
    customer_email: "jordan@example.com",
    customer_phone: "(512) 555-0142",
    customer_type: "Homeowner",
    created_by: "jordan@example.com",
    address: "482 Willow Creek Dr",
    city: "Austin", state: "TX", zip: "78745",
    job_lat: 30.267153, job_lng: -97.743061,
    preferred_date: "2026-09-20", preferred_time: "Morning (8am-12pm)",
    estimated_hours: 2, estimated_cost: 170,
    photo_urls: [], is_priority: false, status: "pending",
    contractor_id: null, accepted_by_email: null,
    created_date: "2026-09-14T10:00:00Z",
    ...over,
  };
}

const PLUMBER = { email: "pro@x.com", user_type: "Contractor" };
const HOMEOWNER = { email: "jordan@example.com", user_type: "Homeowner" };
const plumberProfile = { id: "con1", category: "Plumbing", created_by: "pro@x.com" };

describe("getOpenJobs", () => {
  let handler;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockClient.asServiceRole.entities.Contractor.filter.mockResolvedValue([plumberProfile]);
    mockClient.asServiceRole.entities.Booking.filter.mockResolvedValue([booking()]);
    handler = await loadHandler();
  });

  it("rejects an unauthenticated caller", async () => {
    mockClient.auth.me.mockResolvedValue(null);
    const res = await handler(noBody);
    expect(res.status).toBe(401);
    expect(mockClient.asServiceRole.entities.Booking.filter).not.toHaveBeenCalled();
  });

  describe("redaction — the whole point of this function", () => {
    beforeEach(() => mockClient.auth.me.mockResolvedValue(PLUMBER));

    it("never returns the customer's phone number or email", async () => {
      const { jobs } = await (await handler(noBody)).json();
      expect(jobs).toHaveLength(1);
      expect(jobs[0].customer_phone).toBeUndefined();
      expect(jobs[0].customer_email).toBeUndefined();
      expect(JSON.stringify(jobs)).not.toContain("555-0142");
      expect(JSON.stringify(jobs)).not.toContain("jordan@example.com");
    });

    it("never returns the exact street address", async () => {
      const { jobs } = await (await handler(noBody)).json();
      expect(jobs[0].address).toBeUndefined();
      expect(JSON.stringify(jobs)).not.toContain("Willow Creek");
    });

    it("still returns the general area, which discovery needs", async () => {
      const { jobs } = await (await handler(noBody)).json();
      expect(jobs[0].city).toBe("Austin");
      expect(jobs[0].state).toBe("TX");
      expect(jobs[0].zip).toBe("78745");
    });

    it("blurs coordinates so they cannot pinpoint the property", async () => {
      const { jobs } = await (await handler(noBody)).json();
      // Exact geocode was 30.267153 / -97.743061.
      expect(jobs[0].job_lat).toBe(30.267);
      expect(jobs[0].job_lng).toBe(-97.743);
      expect(jobs[0].approximate_location).toBe(true);
    });

    it("keeps coordinates accurate enough to place a marker", async () => {
      const { jobs } = await (await handler(noBody)).json();
      expect(Math.abs(jobs[0].job_lat - 30.267153)).toBeLessThan(0.001);
    });

    it("handles a job with no recorded coordinates", async () => {
      mockClient.asServiceRole.entities.Booking.filter.mockResolvedValue([
        booking({ job_lat: undefined, job_lng: null }),
      ]);
      const { jobs } = await (await handler(noBody)).json();
      expect(jobs[0].job_lat).toBeNull();
      expect(jobs[0].job_lng).toBeNull();
    });

    it("does not leak who accepted a job", async () => {
      const { jobs } = await (await handler(noBody)).json();
      expect(jobs[0].accepted_by_email).toBeUndefined();
    });

    it("withholds any field not explicitly allowed, including ones added later", async () => {
      mockClient.asServiceRole.entities.Booking.filter.mockResolvedValue([
        booking({ some_future_sensitive_field: "secret" }),
      ]);
      const { jobs } = await (await handler(noBody)).json();
      expect(jobs[0].some_future_sensitive_field).toBeUndefined();
    });

    it("returns the details a provider genuinely needs to decide", async () => {
      const { jobs } = await (await handler(noBody)).json();
      expect(jobs[0].job_title).toBe("Fix leaking sink");
      expect(jobs[0].category).toBe("Plumbing");
      expect(jobs[0].estimated_cost).toBe(170);
      expect(jobs[0].preferred_date).toBe("2026-09-20");
    });
  });

  describe("eligibility", () => {
    beforeEach(() => mockClient.auth.me.mockResolvedValue(PLUMBER));

    it("filters the query to the provider's own category", async () => {
      await handler(noBody);
      expect(mockClient.asServiceRole.entities.Booking.filter).toHaveBeenCalledWith(
        { status: "pending", category: "Plumbing" }, "-created_date", 50,
      );
    });

    it("hides another provider's direct booking that shares the category", async () => {
      mockClient.asServiceRole.entities.Booking.filter.mockResolvedValue([
        booking({ id: "direct", contractor_id: "someone-else" }),
      ]);
      const { jobs } = await (await handler(noBody)).json();
      expect(jobs).toHaveLength(0);
    });

    it("shows a direct booking addressed to this provider", async () => {
      mockClient.asServiceRole.entities.Booking.filter.mockResolvedValue([
        booking({ id: "direct", contractor_id: "con1" }),
      ]);
      const { jobs } = await (await handler(noBody)).json();
      expect(jobs).toHaveLength(1);
    });

    it("returns nothing for a provider with no profile yet", async () => {
      mockClient.asServiceRole.entities.Contractor.filter.mockResolvedValue([]);
      const body = await (await handler(noBody)).json();
      expect(body.jobs).toEqual([]);
      expect(body.profileIncomplete).toBe(true);
    });

    it("does not category-filter for a non-provider, but still redacts", async () => {
      mockClient.auth.me.mockResolvedValue(HOMEOWNER);
      const { jobs } = await (await handler(noBody)).json();
      expect(mockClient.asServiceRole.entities.Booking.filter).toHaveBeenCalledWith(
        { status: "pending" }, "-created_date", 50,
      );
      expect(jobs[0].customer_phone).toBeUndefined();
    });
  });

  describe("single job lookup", () => {
    beforeEach(() => mockClient.auth.me.mockResolvedValue(PLUMBER));

    it("returns one redacted job by id", async () => {
      mockClient.asServiceRole.entities.Booking.get.mockResolvedValue(booking());
      const { job } = await (await handler(withBody({ bookingId: "b1" }))).json();
      expect(job.id).toBe("b1");
      expect(job.customer_phone).toBeUndefined();
      expect(job.address).toBeUndefined();
    });

    it("404s for a job that does not exist", async () => {
      mockClient.asServiceRole.entities.Booking.get.mockResolvedValue(null);
      const res = await handler(withBody({ bookingId: "nope" }));
      expect(res.status).toBe(404);
    });

    it("409s for a job that is no longer open", async () => {
      mockClient.asServiceRole.entities.Booking.get.mockResolvedValue(booking({ status: "accepted" }));
      const res = await handler(withBody({ bookingId: "b1" }));
      expect(res.status).toBe(409);
    });

    it("refuses a job outside the provider's category", async () => {
      mockClient.asServiceRole.entities.Booking.get.mockResolvedValue(booking({ category: "Roofing" }));
      const res = await handler(withBody({ bookingId: "b1" }));
      expect(res.status).toBe(403);
    });

    it("refuses another provider's direct booking looked up by id", async () => {
      mockClient.asServiceRole.entities.Booking.get.mockResolvedValue(
        booking({ contractor_id: "someone-else" }),
      );
      const res = await handler(withBody({ bookingId: "b1" }));
      expect(res.status).toBe(403);
    });
  });

  it("returns 500 without throwing on an unexpected error", async () => {
    mockClient.auth.me.mockRejectedValue(new Error("network down"));
    const res = await handler(noBody);
    expect(res.status).toBe(500);
  });
});
