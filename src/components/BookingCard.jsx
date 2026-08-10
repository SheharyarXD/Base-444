import { Link } from "react-router-dom";
import { Calendar, MapPin, Clock, ChevronRight, Navigation, MessageCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import moment from "moment";
import { BOOKING_STATUS_STYLES as statusStyles, BOOKING_STATUS_LABELS as statusLabels } from "@/lib/bookingStatus";

export default function BookingCard({ booking, showAddressLink = false, latestMessage = null }) {
  return (
    <Link
      to={`/booking/${booking.id}`}
      className="group block bg-card rounded-2xl border border-border hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5 transition-all duration-300 p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-heading font-bold text-foreground truncate">
              {booking.job_title}
            </h3>
          </div>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden shrink-0 border border-border">
              {booking.contractor_photo ? (
                <img src={booking.contractor_photo} alt={booking.contractor_name} className="w-full h-full object-cover" />
              ) : (
                <span className="font-heading font-bold text-primary text-xs">
                  {booking.contractor_name?.charAt(0) || "?"}
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              {booking.contractor_name} · {booking.contractor_category}
            </p>
          </div>

          {latestMessage && (
            <div className="flex items-center gap-2 mb-2 px-3 py-2 bg-primary/5 border border-primary/15 rounded-xl">
              <MessageCircle className="w-3.5 h-3.5 text-primary shrink-0" />
              <p className="text-xs text-foreground truncate">
                <span className="font-semibold text-primary">{latestMessage.sender_name?.split(" ")[0]}:</span>{" "}
                {latestMessage.content}
              </p>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" />
              {moment(booking.preferred_date).format("MMM D, YYYY")}
            </span>
            {booking.preferred_time && (
              <span className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                {booking.preferred_time}
              </span>
            )}
            {showAddressLink ? (
              <a
                href={`https://maps.google.com/?q=${encodeURIComponent(`${booking.address}, ${booking.city}, ${booking.state} ${booking.zip}`)}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="flex items-center gap-1 text-primary hover:underline"
              >
                <Navigation className="w-3.5 h-3.5" />
                <span className="truncate max-w-[150px]">{booking.address}</span>
              </a>
            ) : (
              <span className="flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5" />
                <span className="truncate max-w-[150px]">{booking.address}</span>
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-col items-end gap-2 shrink-0">
          <Badge variant="outline" className={statusStyles[booking.status] || ""}>
            {statusLabels[booking.status] || booking.status}
          </Badge>
          {booking.estimated_cost > 0 && (
            <span className="font-heading font-bold text-foreground">
              ${booking.estimated_cost}
            </span>
          )}
          <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
        </div>
      </div>
    </Link>
  );
}