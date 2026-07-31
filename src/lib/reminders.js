// Generic reminder engine — shared logic for every reminder type in the app.
//
// Design goal: adding a *new* reminder type (payment reminders, license
// renewal, profile completion, subscription renewal, ...) should mean adding
// an entry to REMINDER_TYPES / a rule to a rules array, never touching the
// Reminder entity schema or the dispatch code in acceptJob/checkUpcomingJobs.
//
// NOTE on duplication: this module is the source of truth for the *pure*
// logic (used directly here and by unit tests). The Deno functions that
// actually read/write the Reminder entity (acceptJob, checkUpcomingJobs)
// re-implement the same logic rather than importing this file — same
// constraint documented in src/lib/matching.js: nothing in
// base44/functions/ imports a relative file from src/, only `npm:` packages,
// so there's no proven way to share a module across that boundary in this
// codebase. Keep any change here mirrored there.

export const REMINDER_TYPES = {
  ON_THE_WAY_PENDING: "on_the_way_pending",
  JOB_UPCOMING_MORNING: "job_upcoming_morning",
  JOB_UPCOMING_HOURS_BEFORE: "job_upcoming_hours_before",
  JOB_UPCOMING_FINAL: "job_upcoming_final",
};

export const REMINDER_STATUS = {
  PENDING: "pending",
  SENT: "sent",
  DISMISSED: "dismissed",
  CANCELLED: "cancelled",
};

// A reminder is still "active" (should be shown / could still escalate to
// email) until it's explicitly resolved one way or the other.
const ACTIVE_STATUSES = [REMINDER_STATUS.PENDING, REMINDER_STATUS.SENT];

export function isReminderActive(reminder) {
  return !!reminder && ACTIVE_STATUSES.includes(reminder.status);
}

export function makeDedupeKey(type, scopeId) {
  return `${type}:${scopeId}`;
}

// Bookings in these statuses should never get a new reminder created for
// them, and any not-yet-fired reminder tied to them is stale.
export const EXCLUDED_BOOKING_STATUSES = ["cancelled", "completed"];

export function isBookingEligibleForReminders(booking) {
  return !!booking && !EXCLUDED_BOOKING_STATUSES.includes(booking.status);
}

// --- On The Way reminder (Feature 1) ---------------------------------------

// Created once, the moment a job is accepted (see acceptJob). Due
// immediately — there's no future scheduling involved, it's just "the
// contractor now owes an action."
export function buildOnTheWayReminder(booking, now = new Date()) {
  return {
    type: REMINDER_TYPES.ON_THE_WAY_PENDING,
    booking_id: booking.id,
    recipient_email: booking.accepted_by_email,
    title: "Mark yourself on the way",
    message: `You accepted "${booking.job_title}" — don't forget to press "I'm On My Way" once you head out so the customer is notified.`,
    status: REMINDER_STATUS.PENDING,
    due_at: now.toISOString(),
    dedupe_key: makeDedupeKey(REMINDER_TYPES.ON_THE_WAY_PENDING, booking.id),
    delivered_via: "in_app",
  };
}

// A contractor is "overdue" on this reminder once they've sat in accepted
// status past this many minutes without going on_the_way — used by the
// scheduled engine to decide whether to escalate an in-app reminder to an
// actual email nudge (still governed by the same dedupe_key/status so it
// only ever sends once).
export const ON_THE_WAY_ESCALATION_MINUTES = 20;

export function isOnTheWayReminderOverdue(reminder, booking, now = new Date()) {
  if (!isReminderActive(reminder) || reminder.status !== REMINDER_STATUS.PENDING) return false;
  if (!isBookingEligibleForReminders(booking) || booking.status !== "accepted") return false;
  const dueAt = new Date(reminder.due_at);
  if (Number.isNaN(dueAt.getTime())) return false;
  const minutesWaiting = (now.getTime() - dueAt.getTime()) / 60000;
  return minutesWaiting >= ON_THE_WAY_ESCALATION_MINUTES;
}

// --- Upcoming job reminders (Feature 3) ------------------------------------

// preferred_time is a free-text-ish label, not a real timestamp (see
// Booking.jsonc). This maps each known label to its range's start hour so we
// can derive a concrete Date. "Flexible" has no derivable start time.
const TIME_RANGE_START_HOUR = {
  "Morning (8am-12pm)": 8,
  "Afternoon (12pm-4pm)": 12,
  "Evening (4pm-8pm)": 16,
};

// Returns a concrete start-time Date for the booking, or null if one can't
// be derived (missing date, or a "Flexible" / unrecognized time label).
export function parseJobDateTime(booking) {
  if (!booking?.preferred_date || !booking?.preferred_time) return null;
  const startHour = TIME_RANGE_START_HOUR[booking.preferred_time];
  if (startHour === undefined) return null;
  const d = new Date(booking.preferred_date);
  if (Number.isNaN(d.getTime())) return null;
  d.setHours(startHour, 0, 0, 0);
  return d;
}

// A job is "expired" for reminder purposes once its start time is far enough
// in the past that a reminder would be pointless/spammy.
export const EXPIRED_GRACE_MINUTES = 60;

export function isJobExpired(jobDateTime, now = new Date()) {
  if (!jobDateTime) return false;
  return (now.getTime() - jobDateTime.getTime()) / 60000 > EXPIRED_GRACE_MINUTES;
}

export const MORNING_REMINDER_HOUR = 7; // "morning of the job"
export const HOURS_BEFORE_REMINDER = 3; // "several hours before"
export const FINAL_REMINDER_MINUTES_BEFORE = 30; // "immediately before" (configurable)

// Each rule computes when its reminder becomes due for a given booking, or
// returns null if it doesn't apply (e.g. hours-before/final need a concrete
// time; "morning of" only needs a date). To add a new upcoming-job reminder
// type, add a rule here — nothing else needs to change.
export const UPCOMING_JOB_REMINDER_RULES = [
  {
    type: REMINDER_TYPES.JOB_UPCOMING_MORNING,
    title: "Job today",
    computeDueAt(booking) {
      if (!booking?.preferred_date) return null;
      const d = new Date(booking.preferred_date);
      if (Number.isNaN(d.getTime())) return null;
      d.setHours(MORNING_REMINDER_HOUR, 0, 0, 0);
      return d;
    },
    buildMessage(booking) {
      return `Reminder: you have "${booking.job_title}" scheduled today (${booking.preferred_time}).`;
    },
  },
  {
    type: REMINDER_TYPES.JOB_UPCOMING_HOURS_BEFORE,
    title: "Job coming up",
    computeDueAt(booking) {
      const jobTime = parseJobDateTime(booking);
      if (!jobTime) return null;
      return new Date(jobTime.getTime() - HOURS_BEFORE_REMINDER * 60 * 60 * 1000);
    },
    buildMessage(booking) {
      return `Reminder: "${booking.job_title}" is coming up in about ${HOURS_BEFORE_REMINDER} hours.`;
    },
  },
  {
    type: REMINDER_TYPES.JOB_UPCOMING_FINAL,
    title: "Job starting soon",
    computeDueAt(booking) {
      const jobTime = parseJobDateTime(booking);
      if (!jobTime) return null;
      return new Date(jobTime.getTime() - FINAL_REMINDER_MINUTES_BEFORE * 60 * 1000);
    },
    buildMessage(booking) {
      return `Reminder: "${booking.job_title}" starts in about ${FINAL_REMINDER_MINUTES_BEFORE} minutes at ${booking.address}.`;
    },
  },
];

// Given a booking, returns the upcoming-job reminders that are currently due
// (computed due_at <= now) and haven't already been created (existingKeys is
// the set of dedupe_keys already present for this booking). Bookings in an
// excluded/expired state yield nothing, satisfying "avoid sending reminders
// for cancelled/completed/expired jobs."
export function computeDueUpcomingJobReminders(booking, { now = new Date(), existingKeys = new Set() } = {}) {
  if (!isBookingEligibleForReminders(booking)) return [];
  if (!booking.accepted_by_email) return [];

  const jobTime = parseJobDateTime(booking);
  if (isJobExpired(jobTime, now)) return [];

  const due = [];
  for (const rule of UPCOMING_JOB_REMINDER_RULES) {
    const dueAt = rule.computeDueAt(booking);
    if (!dueAt || dueAt.getTime() > now.getTime()) continue;
    const dedupeKey = makeDedupeKey(rule.type, booking.id);
    if (existingKeys.has(dedupeKey)) continue;
    due.push({
      type: rule.type,
      booking_id: booking.id,
      recipient_email: booking.accepted_by_email,
      title: rule.title,
      message: rule.buildMessage(booking),
      status: REMINDER_STATUS.SENT, // creation IS the send, for this reminder family
      due_at: dueAt.toISOString(),
      dedupe_key: dedupeKey,
      delivered_via: "email",
    });
  }
  return due;
}
