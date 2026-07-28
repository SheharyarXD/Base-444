import { describe, it, expect, vi, beforeEach } from "vitest";

// acceptJob/entry.ts is a Deno server function: it imports the SDK via an
// `npm:` specifier and registers its handler with the global `Deno.serve`.
// To test it as written (no source changes) we mock the npm: specifier and
// stub `Deno.serve` to capture the handler instead of actually serving.
vi.mock("npm:@base44/sdk@0.8.31", () => ({
  createClientFromRequest: vi.fn(() => mockClient),
}));

const mockClient = {
  auth: { me: vi.fn() },
  asServiceRole: {
    entities: {
      Booking: { get: vi.fn(), update: vi.fn() },
      Contractor: { filter: vi.fn() },
    },
  },
};

function makeReq(body) {
  return { json: async () => body };
}

async function loadHandler() {
  const handlers = [];
  globalThis.Deno = {
    serve: (fn) => handlers.push(fn),
    env: { get: () => undefined },
  };
  vi.resetModules();
  await import("./entry.ts");
  return handlers[0];
}

describe("acceptJob", () => {
  let handler;

  beforeEach(async () => {
    vi.clearAllMocks();
    handler = await loadHandler();
  });

  it("rejects when unauthenticated", async () => {
    mockClient.auth.me.mockResolvedValue(null);
    const res = await handler(makeReq({ bookingId: "b1" }));
    expect(res.status).toBe(401);
  });

  it("rejects when bookingId is missing", async () => {
    mockClient.auth.me.mockResolvedValue({ email: "c@x.com", user_type: "Contractor" });
    const res = await handler(makeReq({}));
    expect(res.status).toBe(400);
  });

  it("rejects a user who isn't a Contractor or Handyman", async () => {
    mockClient.auth.me.mockResolvedValue({ email: "h@x.com", user_type: "Homeowner" });
    const res = await handler(makeReq({ bookingId: "b1" }));
    expect(res.status).toBe(403);
  });

  it("404s when the booking doesn't exist", async () => {
    mockClient.auth.me.mockResolvedValue({ email: "c@x.com", user_type: "Contractor" });
    mockClient.asServiceRole.entities.Booking.get.mockResolvedValue(null);
    const res = await handler(makeReq({ bookingId: "missing" }));
    expect(res.status).toBe(404);
  });

  it("409s (race window) when the booking is no longer pending", async () => {
    mockClient.auth.me.mockResolvedValue({ email: "c@x.com", user_type: "Contractor" });
    mockClient.asServiceRole.entities.Booking.get.mockResolvedValue({ id: "b1", status: "on_the_way" });
    const res = await handler(makeReq({ bookingId: "b1" }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/no longer available/i);
  });

  it("403s when the acting user has no Contractor profile yet", async () => {
    mockClient.auth.me.mockResolvedValue({ email: "c@x.com", user_type: "Contractor" });
    mockClient.asServiceRole.entities.Booking.get.mockResolvedValue({ id: "b1", status: "pending", category: "Plumbing" });
    mockClient.asServiceRole.entities.Contractor.filter.mockResolvedValue([]);
    const res = await handler(makeReq({ bookingId: "b1" }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/complete your provider profile/i);
  });

  it("403s an open job when the contractor's category doesn't match", async () => {
    mockClient.auth.me.mockResolvedValue({ email: "c@x.com", user_type: "Contractor" });
    mockClient.asServiceRole.entities.Booking.get.mockResolvedValue({ id: "b1", status: "pending", category: "Plumbing" });
    mockClient.asServiceRole.entities.Contractor.filter.mockResolvedValue([{ id: "con1", category: "Electrical" }]);
    const res = await handler(makeReq({ bookingId: "b1" }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/service category/i);
  });

  it("403s a direct booking when it was booked for a different contractor", async () => {
    mockClient.auth.me.mockResolvedValue({ email: "c@x.com", user_type: "Contractor" });
    mockClient.asServiceRole.entities.Booking.get.mockResolvedValue({
      id: "b1", status: "pending", category: "Plumbing", contractor_id: "someone-else",
    });
    mockClient.asServiceRole.entities.Contractor.filter.mockResolvedValue([{ id: "con1", category: "Plumbing" }]);
    const res = await handler(makeReq({ bookingId: "b1" }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/booked directly for a different provider/i);
  });

  it("accepts an eligible open job and sets status/accepted_by fields", async () => {
    mockClient.auth.me.mockResolvedValue({ email: "c@x.com", user_type: "Contractor", full_name: "Casey Contractor" });
    mockClient.asServiceRole.entities.Booking.get.mockResolvedValue({ id: "b1", status: "pending", category: "Plumbing" });
    mockClient.asServiceRole.entities.Contractor.filter.mockResolvedValue([{ id: "con1", category: "Plumbing" }]);
    mockClient.asServiceRole.entities.Booking.update.mockResolvedValue({
      id: "b1", status: "on_the_way", accepted_by_email: "c@x.com", accepted_by_name: "Casey Contractor",
    });

    const res = await handler(makeReq({ bookingId: "b1" }));
    expect(res.status ?? 200).toBe(200);
    expect(mockClient.asServiceRole.entities.Booking.update).toHaveBeenCalledWith("b1", {
      status: "on_the_way",
      accepted_by_email: "c@x.com",
      accepted_by_name: "Casey Contractor",
    });
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it("accepts a direct booking for the correct target contractor even with a different category", async () => {
    mockClient.auth.me.mockResolvedValue({ email: "c@x.com", user_type: "Handyman", full_name: "Casey" });
    mockClient.asServiceRole.entities.Booking.get.mockResolvedValue({
      id: "b1", status: "pending", category: "Mobile Detailer", contractor_id: "con1",
    });
    mockClient.asServiceRole.entities.Contractor.filter.mockResolvedValue([{ id: "con1", category: "Mobile Mechanic" }]);
    mockClient.asServiceRole.entities.Booking.update.mockResolvedValue({ id: "b1", status: "on_the_way" });

    const res = await handler(makeReq({ bookingId: "b1" }));
    expect(res.status ?? 200).toBe(200);
  });

  it("returns 500 and does not throw when the client rejects unexpectedly", async () => {
    mockClient.auth.me.mockRejectedValue(new Error("network down"));
    const res = await handler(makeReq({ bookingId: "b1" }));
    expect(res.status).toBe(500);
  });
});
