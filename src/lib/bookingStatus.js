// Single source of truth for Booking status display — previously declared
// as three separate identical (or near-identical) copies in BookingCard.jsx,
// BookingDetail.jsx, and RealtorDashboard.jsx.
export const BOOKING_STATUS_STYLES = {
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  accepted: "bg-blue-50 text-blue-700 border-blue-200",
  on_the_way: "bg-violet-50 text-violet-700 border-violet-200",
  arriving: "bg-indigo-50 text-indigo-700 border-indigo-200",
  in_progress: "bg-primary/10 text-primary border-primary/20",
  completed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  cancelled: "bg-red-50 text-red-600 border-red-200",
};

export const BOOKING_STATUS_LABELS = {
  pending: "Pending",
  accepted: "Accepted",
  on_the_way: "On The Way",
  arriving: "Arriving",
  in_progress: "In Progress",
  completed: "Completed",
  cancelled: "Cancelled",
};
