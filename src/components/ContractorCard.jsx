import { Link } from "react-router-dom";
import { Star, Clock, MapPin, CheckCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function ContractorCard({ contractor }) {
  return (
    <Link
      to={`/contractor/${contractor.id}`}
      className="group block bg-card rounded-2xl border border-border hover:border-primary/30 hover:shadow-xl hover:shadow-primary/5 transition-all duration-300 overflow-hidden"
    >
      <div className="relative h-48 bg-gradient-to-br from-secondary to-muted overflow-hidden">
        {contractor.photo ? (
          <img
            src={contractor.photo}
            alt={contractor.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="text-5xl font-heading font-bold text-muted-foreground/30">
              {contractor.name?.charAt(0)}
            </span>
          </div>
        )}
        {contractor.is_available && (
          <div className="absolute top-3 right-3">
            <Badge className="bg-accent text-accent-foreground border-0 shadow-lg text-xs">
              <CheckCircle className="w-3 h-3 mr-1" />
              Available
            </Badge>
          </div>
        )}
      </div>

      <div className="p-5">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div>
            <h3 className="font-heading font-bold text-foreground group-hover:text-primary transition-colors">
              {contractor.name}
            </h3>
            <p className="text-sm text-muted-foreground">{contractor.category}</p>
          </div>
          <div className="text-right shrink-0">
            <span className="font-heading font-bold text-lg text-foreground">${contractor.hourly_rate}</span>
            <span className="text-xs text-muted-foreground block">/hour</span>
          </div>
        </div>

        <div className="flex items-center gap-4 text-xs text-muted-foreground mt-3">
          {contractor.rating > 0 && (
            <span className="flex items-center gap-1">
              <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
              <span className="font-semibold text-foreground">{contractor.rating?.toFixed(1)}</span>
              <span>({contractor.review_count})</span>
            </span>
          )}
          {contractor.response_time && (
            <span className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              {contractor.response_time}
            </span>
          )}
          {contractor.location && (
            <span className="flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5" />
              {contractor.location}
            </span>
          )}
        </div>

        {contractor.completed_jobs > 0 && (
          <p className="text-xs text-muted-foreground mt-2">
            {contractor.completed_jobs} jobs completed
          </p>
        )}
      </div>
    </Link>
  );
}