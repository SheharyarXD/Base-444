import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// --- Reminder engine (Features 1 & 3) ---------------------------------
// Mirrors src/lib/reminders.js (not imported — see that file's header
// comment on the src/↔Deno boundary in this codebase). Runs from this
// existing scheduled function rather than a new one, per "integrate with
// existing scheduling instead of creating a duplicate."
//
// Phase 0 re-audit found and removed a second, independent legacy reminder
// path that used to live in this same handler: an inline loop keyed off
// Booking.notified_30min/notified_10min that sent its own "job starting
// soon" email ~30 minutes before start, running alongside (and firing
// alongside — not deduped against) this engine's own job_upcoming_final
// rule, which also fires 30 minutes before start. Contractors were getting
// two separate emails for the same moment. The engine's four rules
// (on_the_way_pending, job_upcoming_morning, job_upcoming_hours_before,
// job_upcoming_final) already cover every reminder type asked for; the
// legacy 10-minute-before email had no equivalent here and was dropped
// rather than reintroduced, since it wasn't part of that required set.
const EXCLUDED_BOOKING_STATUSES = ['cancelled', 'completed'];
const ON_THE_WAY_ESCALATION_MINUTES = 20;
const EXPIRED_GRACE_MINUTES = 60;
const MORNING_REMINDER_HOUR = 7;
const HOURS_BEFORE_REMINDER = 3;
const FINAL_REMINDER_MINUTES_BEFORE = 30;

const TIME_RANGE_START_HOUR = {
  'Morning (8am-12pm)': 8,
  'Afternoon (12pm-4pm)': 12,
  'Evening (4pm-8pm)': 16,
};

function parseJobDateTime(booking) {
  if (!booking?.preferred_date || !booking?.preferred_time) return null;
  const startHour = TIME_RANGE_START_HOUR[booking.preferred_time];
  if (startHour === undefined) return null;
  const d = new Date(booking.preferred_date);
  if (Number.isNaN(d.getTime())) return null;
  d.setHours(startHour, 0, 0, 0);
  return d;
}

function isJobExpired(jobDateTime, now) {
  if (!jobDateTime) return false;
  return (now.getTime() - jobDateTime.getTime()) / 60000 > EXPIRED_GRACE_MINUTES;
}

// To add a new upcoming-job reminder type, add a rule here — nothing else
// in this function needs to change.
const UPCOMING_JOB_REMINDER_RULES = [
  {
    type: 'job_upcoming_morning',
    title: 'Job today',
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
    type: 'job_upcoming_hours_before',
    title: 'Job coming up',
    computeDueAt(booking) {
      const jobTime = parseJobDateTime(booking);
      return jobTime ? new Date(jobTime.getTime() - HOURS_BEFORE_REMINDER * 60 * 60 * 1000) : null;
    },
    buildMessage(booking) {
      return `Reminder: "${booking.job_title}" is coming up in about ${HOURS_BEFORE_REMINDER} hours.`;
    },
  },
  {
    type: 'job_upcoming_final',
    title: 'Job starting soon',
    computeDueAt(booking) {
      const jobTime = parseJobDateTime(booking);
      return jobTime ? new Date(jobTime.getTime() - FINAL_REMINDER_MINUTES_BEFORE * 60 * 1000) : null;
    },
    buildMessage(booking) {
      return `Reminder: "${booking.job_title}" starts in about ${FINAL_REMINDER_MINUTES_BEFORE} minutes at ${booking.address}.`;
    },
  },
];

async function runReminderEngine(base44, activeBookings, now) {
  // Bounded to active reminders — this is a scheduled job, not a
  // user-facing query, but there's still no reason to ever re-scan
  // dismissed/cancelled rows.
  const activeReminders = await base44.asServiceRole.entities.Reminder.filter({ status: { $in: ['pending', 'sent'] } });

  const remindersByBookingId = new Map();
  const existingKeys = new Set();
  for (const reminder of activeReminders) {
    existingKeys.add(reminder.dedupe_key);
    if (reminder.booking_id) {
      if (!remindersByBookingId.has(reminder.booking_id)) remindersByBookingId.set(reminder.booking_id, []);
      remindersByBookingId.get(reminder.booking_id).push(reminder);
    }
  }

  let escalated = 0;
  let created = 0;

  for (const booking of activeBookings) {
    if (EXCLUDED_BOOKING_STATUSES.includes(booking.status) || !booking.accepted_by_email) continue;

    // Feature 1 escalation: nudge by email if "accepted" has sat too long
    // without the provider pressing "I'm On My Way".
    if (booking.status === 'accepted') {
      const onTheWayReminder = (remindersByBookingId.get(booking.id) || []).find(
        (r) => r.type === 'on_the_way_pending' && r.status === 'pending'
      );
      if (onTheWayReminder) {
        const dueAt = new Date(onTheWayReminder.due_at);
        const minutesWaiting = (now.getTime() - dueAt.getTime()) / 60000;
        if (!Number.isNaN(dueAt.getTime()) && minutesWaiting >= ON_THE_WAY_ESCALATION_MINUTES) {
          await base44.asServiceRole.integrations.Core.SendEmail({
            to: booking.accepted_by_email,
            subject: '⏰ Reminder: mark yourself on the way',
            body: `Hi ${booking.accepted_by_name || 'Contractor'},\n\nYou accepted "${booking.job_title}" a while ago — don't forget to press "I'm On My Way" once you head out so the customer is notified.`,
          });
          await base44.asServiceRole.entities.Reminder.update(onTheWayReminder.id, { status: 'sent' });
          escalated++;
        }
      }
    }

    // Feature 3: upcoming-job reminders. Never for expired jobs.
    const jobTime = parseJobDateTime(booking);
    if (isJobExpired(jobTime, now)) continue;

    for (const rule of UPCOMING_JOB_REMINDER_RULES) {
      const dueAt = rule.computeDueAt(booking);
      if (!dueAt || dueAt.getTime() > now.getTime()) continue;
      const dedupeKey = `${rule.type}:${booking.id}`;
      if (existingKeys.has(dedupeKey)) continue;

      await base44.asServiceRole.integrations.Core.SendEmail({
        to: booking.accepted_by_email,
        subject: `⏰ ${rule.title}`,
        body: `Hi ${booking.accepted_by_name || 'Contractor'},\n\n${rule.buildMessage(booking)}`,
      });
      await base44.asServiceRole.entities.Reminder.create({
        type: rule.type,
        booking_id: booking.id,
        recipient_email: booking.accepted_by_email,
        title: rule.title,
        message: rule.buildMessage(booking),
        status: 'sent',
        due_at: dueAt.toISOString(),
        dedupe_key: dedupeKey,
        delivered_via: 'email',
      });
      existingKeys.add(dedupeKey);
      created++;
    }
  }

  return { escalated, created };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Get all bookings for a job that is committed but not yet finished
    const bookings = await base44.asServiceRole.entities.Booking.filter({
      // 'arriving' included so a Phase 3 job that has moved past on_the_way
      // is still covered by the same reminder sweep rather than dropping out
      // of it mid-journey.
      status: { $in: ['accepted', 'on_the_way', 'arriving'] }
    });

    const now = new Date();

    const reminderResults = await runReminderEngine(base44, bookings, now);

    return Response.json({
      success: true,
      checked: bookings.length,
      remindersEscalated: reminderResults.escalated,
      remindersCreated: reminderResults.created,
    });
  } catch (error) {
    console.error('Upcoming jobs check error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});