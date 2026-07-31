import { useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Star, Clock, MapPin, CheckCircle, Briefcase, Calendar, Shield, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { base44 } from "@/api/base44Client";
import StarRating from "../components/StarRating";
import ReviewForm from "../components/ReviewForm";
import { motion } from "framer-motion";
import moment from "moment";

export default function ContractorDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [contractor, setContractor] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [expandedReview, setExpandedReview] = useState(null);

  useEffect(() => {
    async function load() {
      if (!id) {
        setLoading(false);
        return;
      }
      try {
        const [c, r] = await Promise.all([
          base44.entities.Contractor.get(id),
          base44.entities.Review.filter({ contractor_id: id }, "-created_date", 20),
        ]);
        setContractor(c);
        setReviews(r);
      } catch (error) {
        console.error('Error loading contractor:', error);
      } finally {
        setLoading(false);
      }
    }
    load();

    const unsubscribe = base44.entities.Review.subscribe((event) => {
      if (event.data?.contractor_id === id) {
        if (event.type === "create") {
          setReviews(prev => [event.data, ...prev]);
        }
      }
    });
    return unsubscribe;
  }, [id]);

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="animate-pulse space-y-6">
          <div className="h-64 bg-muted rounded-2xl" />
          <div className="h-8 w-1/2 bg-muted rounded" />
          <div className="h-4 w-1/3 bg-muted rounded" />
          <div className="h-32 bg-muted rounded-2xl" />
        </div>
      </div>
    );
  }

  if (!loading && !contractor) {
    return (
      <div className="text-center py-20">
        <p className="text-muted-foreground mb-2">Contractor profile not found.</p>
        <p className="text-sm text-muted-foreground mb-4">This contractor hasn't set up a profile yet.</p>
        <Link to="/bookings"><Button variant="ghost" className="mt-4">Back to Bookings</Button></Link>
      </div>
    );
  }

  return (
    <div className="pb-24 md:pb-12">
      {/* Hero Image */}
      <div className="relative h-64 md:h-80 bg-gradient-to-br from-secondary to-muted">
        {contractor.photo ? (
          <img src={contractor.photo} alt={contractor.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="text-8xl font-heading font-bold text-muted-foreground/20">
              {contractor.name?.charAt(0)}
            </span>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
        <button
          onClick={() => navigate(-1)}
          className="absolute top-4 left-4 w-10 h-10 rounded-full bg-white/90 backdrop-blur flex items-center justify-center hover:bg-white transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 -mt-16 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-card rounded-2xl border border-border p-6 md:p-8 shadow-xl"
        >
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-6">
            <div>
              <div className="flex items-center gap-3 mb-3 flex-wrap">
                <h1 className="font-heading font-extrabold text-2xl md:text-3xl text-foreground">
                  {contractor.name}
                </h1>
                {contractor.is_verified_pro && (
                  <a
                    href={`https://www.dpor.virginia.gov/LicenseLookup/?search=${encodeURIComponent(contractor.name)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground border border-border rounded-full px-2.5 py-1 hover:bg-secondary transition-all"
                    title="Verify license on DPOR"
                  >
                    <ExternalLink className="w-3 h-3" />
                    Verify on DPOR
                  </a>
                )}
                {contractor.is_available && (
                  <Badge className="bg-accent text-accent-foreground border-0">
                    <CheckCircle className="w-3 h-3 mr-1" /> Available
                  </Badge>
                )}
              </div>
              <p className="text-muted-foreground">{contractor.category}</p>
            </div>
            <div className="text-left md:text-right">
              <div className="font-heading font-extrabold text-3xl text-foreground">
                ${contractor.hourly_rate}<span className="text-base font-normal text-muted-foreground">/hr</span>
              </div>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            {[
              { icon: Star, label: "Rating", value: contractor.rating ? `${contractor.rating.toFixed(1)} (${contractor.review_count || 0})` : "New" },
              { icon: Briefcase, label: "Jobs Done", value: contractor.completed_jobs || 0 },
              { icon: Clock, label: "Response", value: contractor.response_time || "N/A" },
              { icon: Calendar, label: "Experience", value: contractor.years_experience ? `${contractor.years_experience} yrs` : "N/A" },
            ].map((stat) => (
              <div key={stat.label} className="bg-secondary/50 rounded-xl p-4 text-center">
                <stat.icon className="w-5 h-5 text-primary mx-auto mb-2" />
                <p className="font-heading font-bold text-foreground text-sm">{stat.value}</p>
                <p className="text-xs text-muted-foreground">{stat.label}</p>
              </div>
            ))}
          </div>

          {/* Description */}
          {contractor.description && (
            <div className="mb-6">
              <h3 className="font-heading font-bold text-sm text-foreground mb-2">About</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{contractor.description}</p>
            </div>
          )}

          {/* Skills */}
          {contractor.skills?.length > 0 && (
            <div className="mb-6">
              <h3 className="font-heading font-bold text-sm text-foreground mb-2">Specialties</h3>
              <div className="flex flex-wrap gap-2">
                {contractor.skills.map((skill) => (
                  <Badge key={skill} variant="outline" className="text-xs px-3 py-1.5 rounded-full">
                    {skill}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Location */}
          {contractor.location && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-6">
              <MapPin className="w-4 h-4" />
              <span>Services: {contractor.location}</span>
            </div>
          )}

          {/* Book Button */}
          <div className="flex gap-3">
            <Link to={`/book/${contractor.id}`} className="flex-1">
              <Button className="w-full rounded-2xl h-14 font-heading font-bold text-base">
                Book {contractor.name}
              </Button>
            </Link>
            <Button
              onClick={() => setReviewOpen(true)}
              variant="outline"
              className="flex-1 rounded-2xl h-14 font-heading font-bold text-base"
            >
              Leave Review
            </Button>
          </div>
        </motion.div>

        {/* Reviews */}
        <div className="mt-8 mb-8">
          <h2 className="font-heading font-bold text-xl text-foreground mb-4">
            Reviews ({reviews.length})
          </h2>
          {reviews.length === 0 ? (
            <div className="bg-card rounded-2xl border border-border p-8 text-center">
              <Shield className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-muted-foreground text-sm">No reviews yet — be the first!</p>
            </div>
          ) : (
            <div className="space-y-3">
              {reviews.map((review) => (
                <button
                  key={review.id}
                  onClick={() => setExpandedReview(expandedReview === review.id ? null : review.id)}
                  className="w-full text-left bg-card rounded-2xl border border-border p-5 transition-all hover:border-primary/40 hover:shadow-md cursor-pointer"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                        <span className="text-xs font-bold text-primary">
                          {review.reviewer_name?.charAt(0) || "?"}
                        </span>
                      </div>
                      <div>
                        <p className="font-semibold text-sm">{review.reviewer_name || "Anonymous"}</p>
                        <p className="text-xs text-muted-foreground">{moment(review.created_date).fromNow()}</p>
                      </div>
                    </div>
                    <StarRating rating={review.rating} size="sm" />
                  </div>
                  {review.comment && (
                    <p className={`text-sm transition-all ${
                      expandedReview === review.id
                        ? "text-foreground"
                        : "text-muted-foreground line-clamp-2 hover:text-foreground"
                    } mt-2`}>
                      {review.comment}
                    </p>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        <ReviewForm
          open={reviewOpen}
          onOpenChange={setReviewOpen}
          contractorId={id}
          onSuccess={() => setReviews([...reviews])}
        />
      </div>
    </div>
  );
}