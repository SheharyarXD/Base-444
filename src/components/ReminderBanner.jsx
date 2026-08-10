import { useEffect, useState, useCallback } from "react";
import { AlertCircle, X } from "lucide-react";
import { base44 } from "@/api/base44Client";

// Fetches this user's active (pending/sent, i.e. not yet dismissed/cancelled)
// reminders — optionally scoped to one booking or one reminder type — and
// exposes a dismiss() that updates immediately (optimistic) so a banner
// disappears the moment the user resolves it, without waiting on a refetch.
// Reused by JobsMap (dashboard), Bookings (My Jobs), and BookingDetail.
/** @param {{ recipientEmail?: string, bookingId?: string, type?: string }} [params] */
export function useActiveReminders({ recipientEmail, bookingId, type } = {}) {
  const [reminders, setReminders] = useState([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!recipientEmail) {
      setReminders([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const query = { recipient_email: recipientEmail, status: { $in: ["pending", "sent"] } };
    if (bookingId) query.booking_id = bookingId;
    if (type) query.type = type;
    try {
      const results = await base44.entities.Reminder.filter(query, "-due_at", 50);
      setReminders(results);
    } catch {
      setReminders([]);
    } finally {
      setLoading(false);
    }
  }, [recipientEmail, bookingId, type]);

  useEffect(() => {
    reload();
  }, [reload]);

  async function dismiss(reminderId) {
    setReminders((prev) => prev.filter((r) => r.id !== reminderId));
    try {
      await base44.entities.Reminder.update(reminderId, { status: "dismissed" });
    } catch {
      // Best-effort — if the write failed, resync with the server rather
      // than leave local state permanently out of sync.
      reload();
    }
  }

  return { reminders, loading, reload, dismiss };
}

export default function ReminderBanner({ reminders, onDismiss, className = "" }) {
  if (!reminders || reminders.length === 0) return null;

  return (
    <div className={`space-y-2 ${className}`}>
      {reminders.map((reminder) => (
        <div
          key={reminder.id}
          className="bg-amber-50 dark:bg-amber-950 border border-amber-300 dark:border-amber-700 rounded-2xl p-4 flex items-start gap-3"
        >
          <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-900 flex items-center justify-center shrink-0">
            <AlertCircle className="w-4 h-4 text-amber-700 dark:text-amber-300" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-heading font-bold text-sm text-amber-900 dark:text-amber-100">{reminder.title}</p>
            <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">{reminder.message}</p>
          </div>
          {onDismiss && (
            <button
              onClick={() => onDismiss(reminder.id)}
              className="shrink-0 p-1 rounded-lg hover:bg-amber-100 dark:hover:bg-amber-900 transition-colors"
              aria-label="Dismiss reminder"
            >
              <X className="w-4 h-4 text-amber-600" />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
