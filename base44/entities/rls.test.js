import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// Guards the shape of the declarative RLS policies directly. These policies
// are evaluated by the Base44 platform, not by any code in this repo, so
// this can't verify runtime enforcement — but it does pin down the policy
// *shape* so a future edit can't silently regress either of the two RLS bugs
// found in the Phase 1 audit: Booking blocking open-job discovery, and
// Message making 2-way chat impossible.
const here = dirname(fileURLToPath(import.meta.url));
function loadEntity(name) {
  return JSON.parse(readFileSync(join(here, `${name}.jsonc`), "utf8"));
}

describe("Booking RLS", () => {
  const booking = loadEntity("Booking");

  it("still restricts read to the creator, the accepted provider, or an admin", () => {
    const clauses = booking.rls.read.$or;
    expect(clauses).toContainEqual({ created_by: "{{user.email}}" });
    expect(clauses).toContainEqual({ "data.accepted_by_email": "{{user.email}}" });
    expect(clauses).toContainEqual({ user_condition: { role: "admin" } });
  });

  it("also allows any authenticated user to read pending bookings (required for open-job discovery)", () => {
    const clauses = booking.rls.read.$or;
    expect(clauses).toContainEqual({ "data.status": "pending" });
  });

  it("does not grant blanket read access to non-pending bookings beyond creator/accepted/admin", () => {
    // i.e. the pending clause is scoped to status, not `{}` (open to everyone always)
    const clauses = booking.rls.read.$or;
    expect(clauses.some((c) => Object.keys(c).length === 0)).toBe(false);
  });

  it("still restricts update/delete to participants or an admin (unaffected by the discovery fix)", () => {
    const updateClauses = booking.rls.update.$or;
    expect(updateClauses).toContainEqual({ created_by: "{{user.email}}" });
    expect(updateClauses).toContainEqual({ "data.accepted_by_email": "{{user.email}}" });
    expect(updateClauses.some((c) => c["data.status"] === "pending")).toBe(false);

    const deleteClauses = booking.rls.delete.$or;
    expect(deleteClauses).toContainEqual({ created_by: "{{user.email}}" });
    expect(deleteClauses.some((c) => c["data.status"] === "pending")).toBe(false);
  });
});

describe("Message RLS", () => {
  const message = loadEntity("Message");

  it("declares a recipient_email field", () => {
    expect(message.properties.recipient_email).toBeTruthy();
    expect(message.properties.recipient_email.type).toBe("string");
  });

  it("allows read by either the sender or the recipient (fixes the one-sided chat bug)", () => {
    const clauses = message.rls.read.$or;
    expect(clauses).toContainEqual({ "data.sender_email": "{{user.email}}" });
    expect(clauses).toContainEqual({ "data.recipient_email": "{{user.email}}" });
  });

  it("still requires create to be self-attributed (no impersonating another sender)", () => {
    expect(message.rls.create).toEqual({ "data.sender_email": "{{user.email}}" });
  });

  it("does not allow write (update/delete) by the recipient — only the sender or an admin", () => {
    const updateClauses = message.rls.update.$or;
    expect(updateClauses.some((c) => c["data.recipient_email"])).toBe(false);
    const deleteClauses = message.rls.delete.$or;
    expect(deleteClauses.some((c) => c["data.recipient_email"])).toBe(false);
  });
});
