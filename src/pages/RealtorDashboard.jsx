import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Link } from "react-router-dom";
import { Calendar, MapPin, Clock, ChevronRight, Building2, TrendingUp, DollarSign, ClipboardList } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import moment from "moment";
import { motion } from "framer-motion";

const statusStyles = {
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  accepted: "bg-blue-50 text-blue-700 border-blue-200",
  on_the_way: "bg-violet-50 text-violet-700 border-violet-200",
  in_progress: "bg-primary/10 text-primary border-primary/20",
  completed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  cancelled: "bg-red-50 text-red-600 border-red-200",
};

const statusLabels = {
  pending: "Pending", accepted: "Accepted", on_the_way: "Arrived", in_progress: "In Progress",
  completed: "Completed", cancelled: "Cancelled",
};

export default function RealtorDashboard() {
  const [user, setUser] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    async function load() {
      const me = await base44.auth.me();
      setUser(me);
      if (me.user_type !== "Realtor") { setLoading(false); return; }
      const data = await base44.entities.Booking.filter({ created_by: me.email }, "-created_date", 100);
      setBookings(data);
      setLoading(false);
    }
    load();

    const unsubscribe = base44.entities.Booking.subscribe((event) => {
      if (event.type === "update") {
        setBookings(prev => prev.map(b => b.id === event.id ? event.data : b));
        checkProximity(event.data);
      }
    });
    return unsubscribe;
  }, []);

  function getDistanceFeet(lat1, lng1, lat2, lng2) {
    const R = 20902231;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat/2)**2 + Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) * Math.sin(dLng/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  }

  async function checkProximity(booking) {
    if (booking.status !== "on_the_way" || !booking.contractor_lat || !booking.contractor_lng) return;
    
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(booking.address)}&limit=1`);
      const data = await res.json();
      if (data[0]) {
        const addressLat = parseFloat(data[0].lat);
        const addressLng = parseFloat(data[0].lon);
        const distance = getDistanceFeet(booking.contractor_lat, booking.contractor_lng, addressLat, addressLng);
        if (distance <= 500) {
          await base44.entities.Booking.update(booking.id, { status: "in_progress" });
          toast.success(`🎉 ${booking.contractor_name} has arrived!`);
        }
      }
    } catch {}
  }

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-4">
        {[1,2,3].map(i => <div key={i} className="h-24 bg-muted rounded-2xl animate-pulse" />)}
      </div>
    );
  }

  if (user?.user_type !== "Realtor") {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <Building2 className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
        <h2 className="font-heading font-bold text-xl text-foreground mb-2">Realtor Dashboard</h2>
        <p className="text-muted-foreground text-sm">This dashboard is only available to users identified as Realtors.</p>
        <p className="text-muted-foreground text-xs mt-2">Update your account type in <Link to="/account" className="underline">Account settings</Link>.</p>
      </div>
    );
  }

  const filters = ["all", "pending", "accepted", "on_the_way", "completed", "cancelled"];
  // Completed tab already included above
  const filtered = filter === "all" ? bookings : bookings.filter(b => b.status === filter);

  const totalSpend = bookings.filter(b => b.status === "completed").reduce((s, b) => s + (b.estimated_cost || 0), 0);
  const activeCount = bookings.filter(b => ["pending","accepted","in_progress"].includes(b.status)).length;

  async function markArrived(e, bookingId) {
    e.preventDefault();
    e.stopPropagation();
    await base44.entities.Booking.update(bookingId, { status: "in_progress" });
    setBookings(bookings.map(b => b.id === bookingId ? { ...b, status: "in_progress" } : b));
    toast.success("Contractor has arrived!");
  }

  async function markCompleted(e, bookingId) {
    e.preventDefault();
    e.stopPropagation();
    await base44.entities.Booking.update(bookingId, { status: "completed" });
    setBookings(bookings.map(b => b.id === bookingId ? { ...b, status: "completed" } : b));
    toast.success("Job marked as completed!");
  }

  async function removeBooking(e, bookingId) {
    e.preventDefault();
    e.stopPropagation();
    await base44.entities.Booking.delete(bookingId);
    setBookings(bookings.filter(b => b.id !== bookingId));
    toast.success("Job removed.");
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 pb-24 md:pb-12">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
            <Building2 className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="font-heading font-bold text-2xl text-foreground">Realtor Dashboard</h1>
            <p className="text-sm text-muted-foreground">All property service bookings</p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-card rounded-2xl border border-border p-4 text-center">
            <ClipboardList className="w-5 h-5 text-primary mx-auto mb-1" />
            <p className="font-heading font-bold text-xl text-foreground">{bookings.length}</p>
            <p className="text-xs text-muted-foreground">Total Bookings</p>
          </div>
          <div className="bg-card rounded-2xl border border-border p-4 text-center">
            <TrendingUp className="w-5 h-5 text-primary mx-auto mb-1" />
            <p className="font-heading font-bold text-xl text-foreground">{activeCount}</p>
            <p className="text-xs text-muted-foreground">Active</p>
          </div>
          <div className="bg-card rounded-2xl border border-border p-4 text-center">
            <DollarSign className="w-5 h-5 text-primary mx-auto mb-1" />
            <p className="font-heading font-bold text-xl text-foreground">${totalSpend.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">Total Spend</p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
          {filters.map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-all capitalize ${
                filter === f ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"
              }`}
            >
              {f === "all" ? "All" : statusLabels[f]}
            </button>
          ))}
        </div>

        {/* Bookings List */}
        {filtered.length === 0 ? (
          <div className="text-center py-12">
            <ClipboardList className="w-10 h-10 text-muted-foreground/20 mx-auto mb-3" />
            <p className="text-muted-foreground text-sm">No bookings found.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((booking) => (
              <Link
                key={booking.id}
                to={`/booking/${booking.id}`}
                className={`group flex items-start justify-between gap-3 rounded-2xl hover:shadow-lg transition-all duration-300 p-5 ${
                  booking.status === "on_the_way"
                    ? "bg-violet-50 border-2 border-violet-300 hover:border-violet-400"
                    : "bg-card border border-border hover:border-primary/30"
                }`}
              >
                <div className="flex-1 min-w-0">
                  <h3 className="font-heading font-bold text-foreground truncate">{booking.job_title}</h3>
                  <p className="text-sm text-muted-foreground mb-2">{booking.contractor_name} · {booking.contractor_category}</p>
                  <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" />{moment(booking.preferred_date).format("MMM D, YYYY")}</span>
                    {booking.preferred_time && <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{booking.preferred_time}</span>}
                    <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /><span className="truncate max-w-[160px]">{booking.address}</span></span>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2 shrink-0">
                  <Badge variant="outline" className={statusStyles[booking.status] || ""}>{statusLabels[booking.status] || booking.status}</Badge>
                  {booking.estimated_cost > 0 && <span className="font-heading font-bold text-sm text-foreground">${booking.estimated_cost}</span>}
                  {["in_progress", "on_the_way"].includes(booking.status) && (
                    <button
                      onClick={(e) => markCompleted(e, booking.id)}
                      className="px-3 py-1 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white transition-colors"
                    >
                      Complete
                    </button>
                  )}
                  <button
                    onClick={(e) => removeBooking(e, booking.id)}
                    className="px-3 py-1 rounded-lg text-xs font-semibold bg-red-600/20 text-red-600 hover:bg-red-600/30 transition-colors"
                  >
                    Remove
                  </button>
                  {!["in_progress", "on_the_way"].includes(booking.status) && <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />}
                </div>
              </Link>
            ))}
          </div>
        )}
      </motion.div>
    </div>
  );
}