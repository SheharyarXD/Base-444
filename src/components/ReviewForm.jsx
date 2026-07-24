import { useState } from "react";
import { Star, Send, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";

export default function ReviewForm({ booking, open, onOpenChange, onSuccess, onReviewSubmit, contractorId }) {
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [optimisticReview, setOptimisticReview] = useState(null);

  async function handleSubmit() {
    if (rating === 0) {
      toast.error("Please select a rating");
      return;
    }
    
    setSubmitting(true);
    const user = await base44.auth.me();
    const optimistic = {
      id: `temp-${Date.now()}`,
      contractor_id: contractorId || booking?.contractor_id,
      booking_id: booking?.id || null,
      reviewer_name: user.full_name,
      rating,
      comment: comment.trim(),
      created_date: new Date().toISOString(),
    };
    setOptimisticReview(optimistic);
    
    try {
      await base44.entities.Review.create(optimistic);
      toast.success("Thank you for your review!");
      setRating(0);
      setComment("");
      onOpenChange(false);
      onSuccess?.();
      setTimeout(() => onReviewSubmit?.(contractorId || booking?.contractor_id), 500);
    } catch (error) {
      setOptimisticReview(null);
      toast.error("Failed to submit review");
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