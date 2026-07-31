import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("npm:@base44/sdk@0.8.31", () => ({
  createClientFromRequest: vi.fn(() => mockClient),
}));

const mockClient = {
  auth: { me: vi.fn() },
  asServiceRole: { entities: { User: { update: vi.fn() } } },
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

describe("updateUserType", () => {
  let handler;

  beforeEach(async () => {
    vi.clearAllMocks();
    handler = await loadHandler();
  });

  it("rejects when unauthenticated", async () => {
    mockClient.auth.me.mockResolvedValue(null);
    const res = await handler(makeReq({ user_type: "Homeowner" }));
    expect(res.status).toBe(401);
  });

  // Regression test for the account-type lock requested by the client:
  // once a user has a user_type from signup, it must be fixed — no
  // self-service switching between Homeowner/Contractor/etc. afterward.
  it("403s when the user already has a user_type set (account type is fixed after signup)", async () => {
    mockClient.auth.me.mockResolvedValue({ id: "u1", email: "a@x.com", user_type: "Homeowner" });
    const res = await handler(makeReq({ user_type: "Contractor" }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/cannot be changed/i);
    expect(mockClient.asServiceRole.entities.User.update).not.toHaveBeenCalled();
  });

  it("rejects an invalid user_type", async () => {
    mockClient.auth.me.mockResolvedValue({ id: "u1", email: "a@x.com", user_type: null });
    const res = await handler(makeReq({ user_type: "Astronaut" }));
    expect(res.status).toBe(400);
    expect(mockClient.asServiceRole.entities.User.update).not.toHaveBeenCalled();
  });

  it("sets the user_type once, for a user who has none yet", async () => {
    mockClient.auth.me.mockResolvedValue({ id: "u1", email: "a@x.com", user_type: null });
    mockClient.asServiceRole.entities.User.update.mockResolvedValue({});
    const res = await handler(makeReq({ user_type: "Homeowner" }));
    expect(res.status ?? 200).toBe(200);
    expect(mockClient.asServiceRole.entities.User.update).toHaveBeenCalledWith("u1", { user_type: "Homeowner" });
  });
});
