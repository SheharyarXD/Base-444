import { useState } from "react";
import { Star, Send, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";

export default function ReviewForm({ booking = null, open, onOpenChange, onSuccess = undefined, onReviewSubmit = undefined, contractorId = undefined }) {
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (rating === 0) {
      toast.error("Please select a rating");
      return;
    }
    if (!booking?.id) {
      toast.error("A completed booking is required to leave a review.");
      return;
    }

    setSubmitting(true);
    try {
      // Routed through submitReview (not a raw Review.create) — that
      // function is what actually enforces one-review-per-booking,
      // completed-booking eligibility, and recomputes the contractor's
      // rating/review_count from the live set of reviews. None of that was
      // enforced anywhere before, client or server.
      const res = await base44.functions.invoke('submitReview', {
        bookingId: booking.id,
        rating,
        comment: comment.trim(),
      });
      if (res.data?.error) {
        toast.error(res.data.error);
        return;
      }
      toast.success("Thank you for your review!");
      setRating(0);
      setComment("");
      onOpenChange(false);
      onSuccess?.();
      setTimeout(() => onReviewSubmit?.(contractorId || booking?.contractor_id), 500);
    } catch (error) {
      toast.error(error?.response?.data?.error || "Failed to submit review");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading">Rate Your Experience</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 pt-4">
          {/* Star Rating */}
          <div className="space-y-2">
            <label className="text-sm font-semibold text-foreground">How was the work?</label>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                   key={star}
                   type="button"
                   onClick={() => setRating(star)}
                   onMouseEnter={() => setHoverRating(star)}
                   onMouseLeave={() => setHoverRating(0)}
                   className="transition-transform hover:scale-110 touch-target"
                   aria-label={`Rate ${star} stars`}
                 >
                  <Star
                    className={`w-8 h-8 ${
                      star <= (hoverRating || rating)
                        ? "fill-amber-400 text-amber-400"
                        : "text-muted-foreground"
                    }`}
                  />
                </button>
              ))}
            </div>
            {rating > 0 && (
              <p className="text-xs text-muted-foreground">
                {rating === 5 && "Excellent work!"}
                {rating === 4 && "Great job!"}
                {rating === 3 && "Satisfactory"}
                {rating === 2 && "Needs improvement"}
                {rating === 1 && "Poor experience"}
              </p>
            )}
          </div>

          {/* Comment */}
          <div className="space-y-2">
            <label className="text-sm font-semibold text-foreground">Your feedback (optional)</label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Share details about the work quality, professionalism, and timeliness..."
              rows={4}
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
            />
            <p className="text-xs text-muted-foreground">{comment.length}/500 characters</p>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Skip
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={submitting || rating === 0}
              className="flex-1 gap-2"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Submitting...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  Submit Review
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}