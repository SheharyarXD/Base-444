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

  // Reversed deliberately. The pending clause was the mechanism behind open-job
  // discovery, but because policies here apply to whole rows it also published
  // the customer's phone, email and exact street address on every open job to
  // anyone signed in. Discovery moved to the getOpenJobs function, which
  // returns a redacted projection.
  it("does NOT let every signed-in user read pending bookings any more", () => {
    const clauses = booking.rls.read.$or;
    expect(clauses).not.toContainEqual({ "data.status": "pending" });
    expect(clauses.some((c) => c["data.status"])).toBe(false);
  });

  it("limits reads to the customer, the accepted provider, or an admin", () => {
    expect(booking.rls.read.$or).toHaveLength(3);
  });

  it("grants no blanket read access at all", () => {
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

// Phase 3 tracking contract. These fields are what let the UI tell a live
// provider position from a stale one, and what updateProviderLocation is the
// sole authorized writer of — a future schema edit that drops them would
// silently turn the tracking UI back into "last known position presented as
// live", which is exactly what Phase 3 set out to prevent.
describe("Booking tracking schema", () => {
  const booking = loadEntity("Booking");

  it("declares the arriving status between on_the_way and in_progress", () => {
    const statuses = booking.properties.status.enum;
    expect(statuses).toContain("arriving");
    expect(statuses.indexOf("arriving")).toBeGreaterThan(statuses.indexOf("on_the_way"));
    expect(statuses.indexOf("arriving")).toBeLessThan(statuses.indexOf("in_progress"));
  });

  it("preserves every pre-Phase-3 status (no lifecycle was replaced)", () => {
    const statuses = booking.properties.status.enum;
    for (const s of ["pending", "accepted", "on_the_way", "in_progress", "completed", "cancelled"]) {
      expect(statuses).toContain(s);
    }
  });

  it("declares a server-stamped location timestamp", () => {
    const field = booking.properties.contractor_location_updated_at;
    expect(field).toBeTruthy();
    expect(field.type).toBe("string");
    expect(field.format).toBe("date-time");
  });

  it("declares a location accuracy field", () => {
    expect(booking.properties.contractor_location_accuracy_m?.type).toBe("number");
  });

  it("still declares the coordinate fields the timestamp describes", () => {
    expect(booking.properties.contractor_lat?.type).toBe("number");
    expect(booking.properties.contractor_lng?.type).toBe("number");
  });

  it("does not expose provider coordinates to anyone outside the job", () => {
    // Location lives on the Booking row, so Booking's read policy IS the
    // location read policy. With the pending clause removed, the only readers
    // are the customer, the assigned provider, and an admin — and the
    // redacted discovery projection never includes coordinates that are live
    // rather than approximate.
    const clauses = booking.rls.read.$or;
    expect(clauses.some((c) => Object.keys(c).length === 0)).toBe(false);
    expect(clauses.some((c) => c["data.status"])).toBe(false);
    expect(clauses).toContainEqual({ "data.accepted_by_email": "{{user.email}}" });
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

// The licence number / EIN split. Contractor.read is deliberately public so
// customers can view provider profiles, and this platform's policies apply to
// whole rows — there is no field-level hiding — so anything left on Contractor
// is readable by every signed-in user. These tests pin the split in place.
describe("ContractorVerification RLS (private provider identifiers)", () => {
  const priv = loadEntity("ContractorVerification");
  const contractor = loadEntity("Contractor");

  it("holds the licence number and EIN", () => {
    expect(priv.properties.license_number?.type).toBe("string");
    expect(priv.properties.ein_number?.type).toBe("string");
  });

  it("is NOT publicly readable", () => {
    expect(priv.rls.read).not.toEqual({});
    const clauses = priv.rls.read.$or;
    expect(clauses).toBeTruthy();
    expect(clauses.some((c) => Object.keys(c).length === 0)).toBe(false);
  });

  it("limits reads to the owning provider and admins", () => {
    const clauses = priv.rls.read.$or;
    expect(clauses).toContainEqual({ "data.contractor_email": "{{user.email}}" });
    expect(clauses).toContainEqual({ user_condition: { role: "admin" } });
    expect(clauses).toHaveLength(2);
  });

  it("scopes reads on a data field, not created_by", () => {
    // These rows are written by the verification function under the service
    // role, so created_by reflects the service identity rather than the
    // provider. Keying on created_by would lock providers out of their own
    // details. Mirrors Reminder.recipient_email.
    const clauses = priv.rls.read.$or;
    expect(clauses.some((c) => "created_by" in c)).toBe(false);
  });

  it("allows only admins to create or update, so a provider cannot self-write identifiers", () => {
    expect(priv.rls.create).toEqual({ user_condition: { role: "admin" } });
    expect(priv.rls.update).toEqual({ user_condition: { role: "admin" } });
  });

  it("no longer declares the identifiers on the public Contractor record", () => {
    expect(contractor.properties.license_number).toBeUndefined();
    expect(contractor.properties.ein_number).toBeUndefined();
  });

  it("keeps the public profile readable, since discovery depends on it", () => {
    // The fix is to remove the sensitive fields, NOT to lock the profile —
    // locking it would break every customer-facing provider page.
    expect(contractor.rls.read).toEqual({});
  });

  it("keeps non-sensitive trust signals on the public profile", () => {
    // A customer still needs to see that a licence was checked and by which
    // state, without the number itself being published.
    expect(contractor.properties.verification_status).toBeTruthy();
    expect(contractor.properties.state).toBeTruthy();
    expect(contractor.properties.business_name).toBeTruthy();
  });
});

// Post credits and customer subscriptions. Both are held away from the user
// account record deliberately: that record has no access rules of its own and
// the platform's profile-update method can write to it, so a balance or a
// subscription status kept there could be granted by the customer to
// themselves. Writes here are admin-only, meaning only backend functions move
// them.
describe("customer billing records", () => {
  const ledger = loadEntity("PostCreditLedger");
  const sub = loadEntity("CustomerSubscription");
  const booking = loadEntity("Booking");

  for (const [label, entity] of [["PostCreditLedger", ledger], ["CustomerSubscription", sub]]) {
    it(`${label} is not publicly readable`, () => {
      expect(entity.rls.read).not.toEqual({});
      expect(entity.rls.read.$or.some((c) => Object.keys(c).length === 0)).toBe(false);
    });

    it(`${label} limits reads to the owning customer and admins`, () => {
      const clauses = entity.rls.read.$or;
      expect(clauses).toContainEqual({ "data.customer_email": "{{user.email}}" });
      expect(clauses).toContainEqual({ user_condition: { role: "admin" } });
      expect(clauses).toHaveLength(2);
    });

    it(`${label} cannot be written by the customer it belongs to`, () => {
      // This is the whole reason these records exist separately.
      expect(entity.rls.create).toEqual({ user_condition: { role: "admin" } });
      expect(entity.rls.update).toEqual({ user_condition: { role: "admin" } });
    });

    it(`${label} scopes access on a data field rather than created_by`, () => {
      // Written under the service role, so created_by is the service
      // identity, not the customer. Mirrors Reminder and ContractorVerification.
      expect(entity.rls.read.$or.some((c) => "created_by" in c)).toBe(false);
    });
  }

  it("the ledger records a direction and a reason for every movement", () => {
    expect(ledger.properties.delta?.type).toBe("number");
    expect(ledger.properties.reason?.enum).toContain("purchase");
    expect(ledger.properties.reason?.enum).toContain("post");
  });

  it("the ledger carries an idempotency reference, which is what stops double-counting", () => {
    expect(ledger.properties.ref).toBeTruthy();
    expect(ledger.required).toContain("ref");
  });

  it("a subscription records when its paid period ends", () => {
    // Entitlement is granted only while this is in the future, so a lapsed
    // subscription stops granting access with no sweep job required.
    expect(sub.properties.current_period_end?.format).toBe("date-time");
    expect(sub.properties.status?.enum).toEqual(
      expect.arrayContaining(["active", "cancelled", "expired", "payment_failed"]),
    );
  });

  it("only the two approved subscription plans are accepted", () => {
    expect(sub.properties.plan_id.enum.sort()).toEqual(["customer_annual", "customer_monthly"]);
  });

  it("jobs can no longer be created straight from the browser", () => {
    // Posting costs a credit. While a client could create the record itself,
    // the entitlement check simply never ran.
    expect(booking.rls.create).toEqual({ user_condition: { role: "admin" } });
  });
});
