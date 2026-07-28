import { useState, useEffect } from "react";
import { CalendarCheck, Clock, CheckCircle, XCircle, RefreshCw } from "lucide-react";
import { base44 } from "@/api/base44Client";
import BookingCard from "../components/BookingCard";
import { motion } from "framer-motion";
import { toast } from "sonner";

const tabs = [
  { value: "active", label: "Active", icon: Clock },
  { value: "completed", label: "Completed", icon: CheckCircle },
  { value: "cancelled", label: "Cancelled", icon: XCircle },
];

export default function Bookings() {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("active");
  const [isContractor, setIsContractor] = useState(false);
  const [cancellingId, setCancellingId] = useState(null);
  const [pullY, setPullY] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [messagesByBooking, setMessagesByBooking] = useState({});
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    async function load() {
      const user = await base44.auth.me();
      setCurrentUser(user);
      const contractor = ["Contractor", "Handyman"].includes(user?.user_type);
      setIsContractor(contractor);
      let all;
      if (contractor) {
        all = await base44.entities.Booking.filter(
          { accepted_by_email: user.email },
          "-created_date",
          100
        );
      } else {
        all = await base44.entities.Booking.filter(
          { created_by: user.email },
          "-created_date",
          100
        );
      }
      setBookings(all);
      setLoading(false);

      // Fetch latest message per booking to show message preview
      const msgMap = {};
      await Promise.all(
        all.map(async (b) => {
          try {
            const msgs = await base44.entities.Message.filter({ booking_id: b.id }, "-created_date", 1);
            if (msgs.length > 0) {
              const latest = msgs[0];
              // Only show if message is from contractor/handyman (not the customer)
              const isFromContractor = latest.sender_email !== user.email;
              if (!contractor && isFromContractor) {
                msgMap[b.id] = latest;
              } else if (contractor) {
                msgMap[b.id] = latest;
              }
            }
          } catch {}
        })
      );
      setMessagesByBooking(msgMap);
    }
    load();
  }, []);

  const handlePullRefresh = (e) => {
    if (window.scrollY !== 0) return;
    setPullY(Math.max(0, e.touches[0].clientY - 50));
  };

  const handlePullEnd = async () => {
    if (pullY > 100) {
      setRefreshing(true);
      setTimeout(async () => {
        const user = await base44.auth.me();
        const contractor = ["Contractor", "Handyman"].includes(user?.user_type);
        let all;
        if (contractor) {
          all = await base44.entities.Booking.filter({ accepted_by_email: user.email }, "-created_date", 100);
        } else {
          all = await base44.entities.Booking.filter({ created_by: user.email }, "-created_date", 100);
        }
        setBookings(all);
        setRefreshing(false);
      }, 300);
    }
    setPullY(0);
  };

  useEffect(() => {
    window.addEventListener("touchmove", handlePullRefresh);
    window.addEventListener("touchend", handlePullEnd);
    return () => {
      window.removeEventListener("touchmove", handlePullRefresh);
      window.removeEventListener("touchend", handlePullEnd);
    };
  }, [pullY]);

  const filtered = bookings.filter((b) => {
    if (activeTab === "active") return ["pending", "accepted", "on_the_way", "in_progress"].includes(b.status);
    if (activeTab === "completed") return b.status === "completed";
    if (activeTab === "cancelled") return b.status === "cancelled";
    return true;
  });

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 pb-24 md:pb-12" style={{ transform: `translateY(${Math.min(pullY, 80)}px)` }}>
      {pullY > 0 && (
        <div className="flex justify-center mb-4">
          <motion.div animate={{ rotate: refreshing ? 360 : 0 }} transition={{ duration: 0.6, repeat: refreshing ? Infinity : 0 }}>
            <RefreshCw className={`w-5 h-5 ${refreshing ? "text-primary" : "text-muted-foreground"}`} />
          </motion.div>
        </div>
      )}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-400 to-red-500 flex items-center justify-center">
          <CalendarCheck className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="font-heading font-bold text-2xl md:text-3xl bg-gradient-to-r from-orange-500 to-red-500 bg-clip-text text-transparent">My Bookings</h1>
          <p className="text-muted-foreground text-sm">{bookings.length} total bookings</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 bg-secondary rounded-2xl p-1">
        {tabs.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setActiveTab(tab.value)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              activeTab === tab.value
                ? "bg-card shadow-sm text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-card rounded-2xl border border-border p-5 animate-pulse">
              <div className="h-5 w-2/3 bg-muted rounded mb-3" />
              <div className="h-4 w-1/3 bg-muted rounded mb-3" />
              <div className="h-3 w-full bg-muted rounded" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 bg-card rounded-2xl border border-border">
          <CalendarCheck className="w-12 h-12 text-muted-foreground/20 mx-auto mb-3" />
          <p className="text-muted-foreground text-lg mb-1">No {activeTab} bookings</p>
          <p className="text-sm text-muted-foreground">
            {activeTab === "active" ? "Book a contractor to get started!" : "Nothing here yet."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((b, i) => (
            <motion.div
              key={b.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <div className="flex flex-col gap-2">
                <BookingCard booking={b} showAddressLink={isContractor} latestMessage={messagesByBooking[b.id]} />
                {["pending", "accepted", "on_the_way", "in_progress"].includes(b.status) && (
                  <button
                    onClick={async () => {
                      setCancellingId(b.id);
                      await base44.entities.Booking.update(b.id, { status: "cancelled" });
                      setBookings(prev => prev.map(x => x.id === b.id ? { ...x, status: "cancelled" } : x));
                      toast.success("Booking cancelled");
                      setCancellingId(null);
                    }}
                    disabled={cancellingId === b.id}
                    className="w-full py-2.5 text-sm font-semibold rounded-xl bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors disabled:opacity-50"
                  >
                    {cancellingId === b.id ? "Cancelling..." : "Cancel Booking"}
                  </button>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}