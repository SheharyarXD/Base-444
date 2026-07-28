import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { MessageCircle, ChevronRight } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Badge } from "@/components/ui/badge";
import moment from "moment";
import { motion } from "framer-motion";

export default function Inbox() {
  const [threads, setThreads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);

  useEffect(() => {
    async function load() {
      const me = await base44.auth.me();
      setUser(me);
      const isContractor = ["Contractor", "Handyman"].includes(me?.user_type);

      // Fetch all bookings this user is part of
      let bookings = [];
      if (isContractor) {
        bookings = await base44.entities.Booking.filter({ accepted_by_email: me.email }, "-updated_date", 100);
        // Also pick up bookings they've messaged on but haven't accepted yet
        // (e.g. messaged a customer on a still-pending job). Scoped to this
        // user's own sent messages rather than scanning every booking.
        const myMessages = await base44.entities.Message.filter({ sender_email: me.email }, "-created_date", 200);
        const extraBookingIds = [...new Set(myMessages.map(m => m.booking_id))].filter(
          id => !bookings.find(b => b.id === id)
        );
        const extraBookings = await Promise.all(
          extraBookingIds.map(id => base44.entities.Booking.get(id).catch(() => null))
        );
        bookings = [...bookings, ...extraBookings.filter(Boolean)];
      } else {
        bookings = await base44.entities.Booking.filter({ created_by: me.email }, "-updated_date", 100);
      }

      // For each booking, get the latest message
      const threadData = await Promise.all(
        bookings.map(async (b) => {
          try {
            const msgs = await base44.entities.Message.filter({ booking_id: b.id }, "-created_date", 1);
            if (!msgs.length) return null;
            return { booking: b, latestMessage: msgs[0] };
          } catch {
            return null;
          }
        })
      );

      // Filter to only bookings that have messages, sort by latest message
      const valid = threadData
        .filter(Boolean)
        .sort((a, b) => new Date(b.latestMessage.created_date) - new Date(a.latestMessage.created_date));

      setThreads(valid);
      setLoading(false);
    }
    load();
  }, []);

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 pb-24 md:pb-12">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center">
          <MessageCircle className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="font-heading font-bold text-2xl md:text-3xl bg-gradient-to-r from-blue-500 to-violet-600 bg-clip-text text-transparent">Inbox</h1>
          <p className="text-muted-foreground text-sm">{threads.length} conversation{threads.length !== 1 ? "s" : ""}</p>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-card rounded-2xl border border-border p-5 animate-pulse">
              <div className="h-5 w-2/3 bg-muted rounded mb-2" />
              <div className="h-4 w-full bg-muted rounded" />
            </div>
          ))}
        </div>
      ) : threads.length === 0 ? (
        <div className="text-center py-20 bg-card rounded-2xl border border-border">
          <MessageCircle className="w-12 h-12 text-muted-foreground/20 mx-auto mb-3" />
          <p className="text-muted-foreground text-lg mb-1">No messages yet</p>
          <p className="text-sm text-muted-foreground">Messages from your bookings will appear here.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {threads.map(({ booking, latestMessage }, i) => {
            const isFromMe = latestMessage.sender_email === user?.email;
            return (
              <motion.div
                key={booking.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
              >
                <Link
                  to={`/booking/${booking.id}`}
                  className="group flex items-center gap-4 bg-card rounded-2xl border border-border hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5 transition-all duration-300 p-4"
                >
                  <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                    <span className="font-heading font-bold text-primary text-sm">
                      {isFromMe
                        ? (booking.contractor_name?.charAt(0) || "?")
                        : (latestMessage.sender_name?.charAt(0) || "?")}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-0.5">
                      <p className="font-heading font-bold text-foreground truncate text-sm">
                        {booking.job_title}
                      </p>
                      <span className="text-xs text-muted-foreground shrink-0">
                        {moment(latestMessage.created_date).fromNow()}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {isFromMe ? "You: " : `${latestMessage.sender_name?.split(" ")[0]}: `}
                      {latestMessage.content}
                    </p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
                </Link>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}