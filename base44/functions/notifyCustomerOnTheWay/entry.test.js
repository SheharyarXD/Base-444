import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("npm:@base44/sdk@0.8.25", () => ({
  createClientFromRequest: vi.fn(() => mockClient),
}));

const mockClient = {
  auth: { me: vi.fn() },
  entities: { Booking: { get: vi.fn() } },
  integrations: { Core: { SendEmail: vi.fn() } },
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

const onTheWayBooking = {
  id: "b1", status: "on_the_way", accepted_by_email: "provider@x.com", accepted_by_name: "Provider",
  customer_email: "customer@x.com", customer_name: "Customer", job_title: "Fix sink",
  address: "1 Main St", city: "Town", state: "VA", zip: "22201",
};

describe("notifyCustomerOnTheWay", () => {
  let handler;

  beforeEach(async () => {
    vi.clearAllMocks();
    handler = await loadHandler();
  });

  // This function used to have no identity check at all — anyone could pass
  // an arbitrary booking_id and trigger a customer email. Now requires auth
  // and requires the caller to actually be the accepted provider.
  it("rejects when unauthenticated", async () => {
    mockClient.auth.me.mockResolvedValue(null);
    const res = await handler(makeReq({ booking_id: "b1" }));
    expect(res.status).toBe(401);
  });

  it("rejects when booking_id is missing", async () => {
    mockClient.auth.me.mockResolvedValue({ email: "provider@x.com" });
    const res = await handler(makeReq({}));
    expect(res.status).toBe(400);
  });

  it("404s when the booking isn't on_the_way", async () => {
    mockClient.auth.me.mockResolvedValue({ email: "provider@x.com" });
    mockClient.entities.Booking.get.mockResolvedValue({ ...onTheWayBooking, status: "accepted" });
    const res = await handler(makeReq({ booking_id: "b1" }));
    expect(res.status).toBe(404);
    expect(mockClient.integrations.Core.SendEmail).not.toHaveBeenCalled();
  });

  it("403s when the caller isn't the accepted provider", async () => {
    mockClient.auth.me.mockResolvedValue({ email: "someone-else@x.com" });
    mockClient.entities.Booking.get.mockResolvedValue(onTheWayBooking);
    const res = await handler(makeReq({ booking_id: "b1" }));
    expect(res.status).toBe(403);
    expect(mockClient.integrations.Core.SendEmail).not.toHaveBeenCalled();
  });

  it("emails the customer when the accepted provider notifies", async () => {
    mockClient.auth.me.mockResolvedValue({ email: "provider@x.com" });
    mockClient.entities.Booking.get.mockResolvedValue(onTheWayBooking);
    const res = await handler(makeReq({ booking_id: "b1" }));
    expect(res.status ?? 200).toBe(200);
    expect(mockClient.integrations.Core.SendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "customer@x.com" })
    );
  });
});
