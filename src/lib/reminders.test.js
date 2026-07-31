import { describe, it, expect } from "vitest";
import {
  REMINDER_TYPES,
  REMINDER_STATUS,
  isReminderActive,
  makeDedupeKey,
  isBookingEligibleForReminders,
  buildOnTheWayReminder,
  isOnTheWayReminderOverdue,
  parseJobDateTime,
  isJobExpired,
  computeDueUpcomingJobReminders,
  ON_THE_WAY_ESCALATION_MINUTES,
} from "./reminders";

describe("isReminderActive", () => {
  it("is active for pending and sent", () => {
    expect(isReminderActive({ status: "pending" })).toBe(true);
    expect(isReminderActive({ status: "sent" })).toBe(true);
  });
  it("is not active for dismissed, cancelled, or missing", () => {
    expect(isReminderActive({ status: "dismissed" })).toBe(false);
    expect(isReminderActive({ status: "cancelled" })).toBe(false);
    expect(isReminderActive(null)).toBe(false);
  });
});

describe("makeDedupeKey", () => {
  it("joins type and scope id with a colon", () => {
    expect(makeDedupeKey(REMINDER_TYPES.ON_THE_WAY_PENDING, "b1")).toBe("on_the_way_pending:b1");
  });
});

describe("isBookingEligibleForReminders", () => {
  it("rejects cancelled and completed bookings", () => {
    expect(isBookingEligibleForReminders({ status: "cancelled" })).toBe(false);
    expect(isBookingEligibleForReminders({ status: "completed" })).toBe(false);
  });
  it("accepts every other status", () => {
    for (const status of ["pending", "accepted", "on_the_way", "in_progress"]) {
      expect(isBookingEligibleForReminders({ status })).toBe(true);
    }
  });
  it("rejects a missing booking", () => {
    expect(isBookingEligibleForReminders(null)).toBe(false);
  });
});

describe("buildOnTheWayReminder", () => {
  it("builds a pending reminder addressed to the accepting provider", () => {
    const now = new Date("2026-08-01T12:00:00.000Z");
    const reminder = buildOnTheWayReminder(
      { id: "b1", job_title: "Fix sink", accepted_by_email: "pro@x.com" },
      now
    );
    expect(reminder).toMatchObject({
      type: REMINDER_TYPES.ON_THE_WAY_PENDING,
      booking_id: "b1",
      recipient_email: "pro@x.com",
      status: REMINDER_STATUS.PENDING,
      dedupe_key: "on_the_way_pending:b1",
      due_at: now.toISOString(),
    });
    expect(reminder.message).toContain("Fix sink");
  });
});

describe("isOnTheWayReminderOverdue", () => {
  const booking = { status: "accepted" };

  it("is not overdue before the escalation threshold", () => {
    const dueAt = new Date("2026-08-01T12:00:00.000Z");
    const now = new Date(dueAt.getTime() + (ON_THE_WAY_ESCALATION_MINUTES - 1) * 60000);
    const reminder = { status: "pending", due_at: dueAt.toISOString() };
    expect(isOnTheWayReminderOverdue(reminder, booking, now)).toBe(false);
  });

  it("is overdue once past the escalation threshold", () => {
    const dueAt = new Date("2026-08-01T12:00:00.000Z");
    const now = new Date(dueAt.getTime() + (ON_THE_WAY_ESCALATION_MINUTES + 1) * 60000);
    const reminder = { status: "pending", due_at: dueAt.toISOString() };
    expect(isOnTheWayReminderOverdue(reminder, booking, now)).toBe(true);
  });

  it("is never overdue once already dismissed", () => {
    const dueAt = new Date("2026-08-01T12:00:00.000Z");
    const now = new Date(dueAt.getTime() + 1000 * 60 * 60);
    const reminder = { status: "dismissed", due_at: dueAt.toISOString() };
    expect(isOnTheWayReminderOverdue(reminder, booking, now)).toBe(false);
  });

  it("is never overdue if the booking already moved past 'accepted'", () => {
    const dueAt = new Date("2026-08-01T12:00:00.000Z");
    const now = new Date(dueAt.getTime() + 1000 * 60 * 60);
    const reminder = { status: "pending", due_at: dueAt.toISOString() };
    expect(isOnTheWayReminderOverdue(reminder, { status: "on_the_way" }, now)).toBe(false);
  });
});

describe("parseJobDateTime", () => {
  it("returns null for Flexible bookings", () => {
    expect(parseJobDateTime({ preferred_date: "2026-08-01", preferred_time: "Flexible" })).toBeNull();
  });
  it("returns null when date or time is missing", () => {
    expect(parseJobDateTime({ preferred_time: "Morning (8am-12pm)" })).toBeNull();
    expect(parseJobDateTime({ preferred_date: "2026-08-01" })).toBeNull();
  });
  it("derives the range's start hour for known labels", () => {
    const morning = parseJobDateTime({ preferred_date: "2026-08-01", preferred_time: "Morning (8am-12pm)" });
    expect(morning.getHours()).toBe(8);
    const afternoon = parseJobDateTime({ preferred_date: "2026-08-01", preferred_time: "Afternoon (12pm-4pm)" });
    expect(afternoon.getHours()).toBe(12);
    const evening = parseJobDateTime({ preferred_date: "2026-08-01", preferred_time: "Evening (4pm-8pm)" });
    expect(evening.getHours()).toBe(16);
  });
});

describe("isJobExpired", () => {
  it("is false when there's no concrete job time", () => {
    expect(isJobExpired(null, new Date())).toBe(false);
  });
  it("is false within the grace window", () => {
    const jobTime = new Date("2026-08-01T12:00:00.000Z");
    const now = new Date(jobTime.getTime() + 30 * 60000);
    expect(isJobExpired(jobTime, now)).toBe(false);
  });
  it("is true well past the grace window", () => {
    const jobTime = new Date("2026-08-01T12:00:00.000Z");
    const now = new Date(jobTime.getTime() + 120 * 60000);
    expect(isJobExpired(jobTime, now)).toBe(true);
  });
});

describe("computeDueUpcomingJobReminders", () => {
  const baseBooking = {
    id: "b1",
    status: "accepted",
    accepted_by_email: "pro@x.com",
    job_title: "Fix sink",
    address: "123 Main St",
    preferred_date: "2026-08-01",
    preferred_time: "Afternoon (12pm-4pm)", // starts at 12:00 local
  };

  it("returns nothing for cancelled/completed bookings", () => {
    expect(computeDueUpcomingJobReminders({ ...baseBooking, status: "cancelled" })).toEqual([]);
    expect(computeDueUpcomingJobReminders({ ...baseBooking, status: "completed" })).toEqual([]);
  });

  it("returns nothing without an accepted provider", () => {
    expect(computeDueUpcomingJobReminders({ ...baseBooking, accepted_by_email: undefined })).toEqual([]);
  });

  it("returns nothing for an expired job", () => {
    const jobTime = parseJobDateTime(baseBooking);
    const now = new Date(jobTime.getTime() + 120 * 60000); // well past start + grace
    expect(computeDueUpcomingJobReminders(baseBooking, { now })).toEqual([]);
  });

  it("includes the 'final' reminder once within its window", () => {
    const jobTime = parseJobDateTime(baseBooking); // 2026-08-01T12:00 local
    const now = new Date(jobTime.getTime() - 20 * 60000); // 20 min before start
    const due = computeDueUpcomingJobReminders(baseBooking, { now });
    expect(due.map((r) => r.type)).toContain(REMINDER_TYPES.JOB_UPCOMING_FINAL);
  });

  it("does not re-include 'hours before' once its dedupe_key already exists (it fired on an earlier scan)", () => {
    // Due timestamps aren't narrow windows — once a threshold has passed, it
    // stays "due" until dispatched. By the final-reminder window (30 min
    // before start) the hours-before threshold (3h before) has also long
    // passed, so distinguishing them requires simulating that hours-before
    // already fired and its key is on record — exactly what the scheduled
    // engine's existingKeys set is for.
    const jobTime = parseJobDateTime(baseBooking);
    const now = new Date(jobTime.getTime() - 20 * 60000);
    const existingKeys = new Set([makeDedupeKey(REMINDER_TYPES.JOB_UPCOMING_HOURS_BEFORE, "b1")]);
    const due = computeDueUpcomingJobReminders(baseBooking, { now, existingKeys });
    const types = due.map((r) => r.type);
    expect(types).toContain(REMINDER_TYPES.JOB_UPCOMING_FINAL);
    expect(types).not.toContain(REMINDER_TYPES.JOB_UPCOMING_HOURS_BEFORE);
  });

  it("excludes reminder types whose dedupe_key already exists", () => {
    const jobTime = parseJobDateTime(baseBooking);
    const now = new Date(jobTime.getTime() - 20 * 60000);
    const due = computeDueUpcomingJobReminders(baseBooking, {
      now,
      existingKeys: new Set([makeDedupeKey(REMINDER_TYPES.JOB_UPCOMING_FINAL, "b1")]),
    });
    expect(due.map((r) => r.type)).not.toContain(REMINDER_TYPES.JOB_UPCOMING_FINAL);
  });

  it("each due reminder carries a correct dedupe_key and recipient", () => {
    const jobTime = parseJobDateTime(baseBooking);
    const now = new Date(jobTime.getTime() - 20 * 60000);
    const due = computeDueUpcomingJobReminders(baseBooking, { now });
    for (const reminder of due) {
      expect(reminder.dedupe_key).toBe(`${reminder.type}:b1`);
      expect(reminder.recipient_email).toBe("pro@x.com");
      expect(reminder.booking_id).toBe("b1");
    }
  });

  it("still computes the 'morning of' reminder for a Flexible-time booking", () => {
    const flexible = { ...baseBooking, preferred_time: "Flexible" };
    const morningOf = new Date("2026-08-01T07:00:00");
    const now = new Date(morningOf.getTime() + 5 * 60000);
    const due = computeDueUpcomingJobReminders(flexible, { now });
    expect(due.map((r) => r.type)).toEqual([REMINDER_TYPES.JOB_UPCOMING_MORNING]);
  });
});
