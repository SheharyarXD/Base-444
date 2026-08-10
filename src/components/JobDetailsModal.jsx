import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { MapPin, Calendar, Clock, DollarSign, Phone, Mail, FileText, Loader2, CheckCircle } from "lucide-react";
import moment from "moment";
import { base44 } from "@/api/base44Client";
import AddressMap from "./AddressMap";
import BookingChat from "./BookingChat";
import { canViewFullJobDetails, maskedCityStateZip } from "@/lib/jobPrivacy";

export default function JobDetailsModal({ job, open, onOpenChange, onAccept, accepting }) {
  const [user, setUser] = useState(null);
  const [viewerContractor, setViewerContractor] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !job) return;
    base44.auth.me().then((me) => {
      setUser(me);
      if (["Contractor", "Handyman"].includes(me?.user_type)) {
        base44.entities.Contractor.filter({ created_by: me.email }).then((contractors) => {
          setViewerContractor(contractors[0] || null);
        }).catch(() => {});
      }
    }).catch(() => {});
  }, [open, job?.id]);

  const isContractorOrHandyman = ["Contractor", "Handyman"].includes(user?.user_type);
  // Matches BookingDetail.jsx's definition — previously keyed off a legacy
  // `user.ein` field unrelated to actually having a Contractor profile.
  const profileIncomplete = isContractorOrHandyman && !viewerContractor;
  // Job posts are visible to every eligible provider before acceptance (see
  // JobsMap.jsx), but the customer's contact info and exact address should
  // only be shown to the customer themself or the provider who accepted —
  // not to every provider still deciding whether to accept.
  const canViewFull = canViewFullJobDetails(job, user?.email);

  async function handleAcceptWithEmail() {
    setLoading(true);
    try {
      // Attempt the actual (server-enforced) acceptance first — only email
      // the customer if it really succeeded, since acceptJob can now reject
      // (job already taken, wrong category, direct booking for someone else).
      // onAccept() already surfaces the rejection reason via toast on failure.
      const accepted = await onAccept(job);
      if (!accepted) return;
      await base44.integrations.Core.SendEmail({
        to: job.customer_email,
        subject: `Your job has been accepted by ${user?.full_name}`,
        body: `Hi ${job.customer_name},\n\n${user?.full_name} has accepted your job request for "${job.job_title}" scheduled for ${job.preferred_date}.\n\nYou can message them in the app to confirm details and price. They'll notify you separately once they're actually on the way.\n\nBest regards,\nLinked`,
      });
    } catch (err) {
      console.error('Error accepting job:', err);
    }
    setLoading(false);
  }

  if (!job) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-heading">{job.job_title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 pt-2">
          {/* Customer Info */}
          <div className="bg-secondary/50 rounded-xl p-4 space-y-2">
            <p className="font-semibold text-sm">Customer</p>
            <div className="space-y-1.5 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Name:</span>
                <span className="font-medium">{job.customer_name}</span>
              </div>
              {canViewFull ? (
                <>
                  {job.customer_phone && (
                    <a
                      href={`tel:${job.customer_phone}`}
                      className="flex items-center gap-2 text-primary hover:underline"
                    >
                      <Phone className="w-4 h-4" />
                      {job.customer_phone}
                    </a>
                  )}
                  {job.customer_email && (
                    <a
                      href={`mailto:${job.customer_email}`}
                      className="flex items-center gap-2 text-primary hover:underline"
                    >
                      <Mail className="w-4 h-4" />
                      {job.customer_email}
                    </a>
                  )}
                </>
              ) : (
                <p className="text-xs text-muted-foreground italic">
                  Contact info is shared once you accept this job.
                </p>
              )}
            </div>
          </div>

          {/* Job Details */}
          <div className="space-y-3 text-sm">
            <div className="flex items-start gap-3">
              <MapPin className="w-4 h-4 text-primary mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold">Address</p>
                {canViewFull ? (
                  <>
                    <p className="text-muted-foreground">{job.address}</p>
                    <p className="text-muted-foreground">{job.city}, {job.state} {job.zip}</p>
                  </>
                ) : (
                  <>
                    <p className="text-muted-foreground">{maskedCityStateZip(job)}</p>
                    <p className="text-xs text-muted-foreground italic mt-0.5">Exact address shared once you accept</p>
                  </>
                )}
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Calendar className="w-4 h-4 text-primary mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold">Date</p>
                <p className="text-muted-foreground">{moment(job.preferred_date).format("MMMM D, YYYY")}</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Clock className="w-4 h-4 text-primary mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold">Time</p>
                <p className="text-muted-foreground">{job.preferred_time}</p>
              </div>
            </div>

            {job.estimated_cost && (
              <div className="flex items-start gap-3">
                <DollarSign className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                <div>
                  <p className="font-semibold">Estimated Cost</p>
                  <p className="text-muted-foreground">${job.estimated_cost} ({job.estimated_hours}h)</p>
                </div>
              </div>
            )}
          </div>

          {/* Description */}
          {job.job_description && (
            <div>
              <p className="font-semibold text-sm mb-2 flex items-center gap-2">
                <FileText className="w-4 h-4" /> Description
              </p>
              <p className="text-sm text-muted-foreground bg-secondary/50 rounded-lg p-3">{job.job_description}</p>
            </div>
          )}

          {/* Notes */}
          {job.notes && (
            <div>
              <p className="font-semibold text-sm mb-2">Notes</p>
              <p className="text-sm text-muted-foreground bg-secondary/50 rounded-lg p-3">{job.notes}</p>
            </div>
          )}

          {/* Photos */}
          {job.photo_urls?.length > 0 && (
            <div>
              <p className="font-semibold text-sm mb-2">Photos</p>
              <div className="grid grid-cols-3 gap-2">
                {job.photo_urls.map((url, i) => (
                  <img key={i} src={url} alt="Job" className="w-full aspect-square object-cover rounded-lg" />
                ))}
              </div>
            </div>
          )}

          {/* Map — only pinpoints the exact address once the viewer is entitled to it */}
          {job.address && canViewFull && (
            <div>
              <p className="font-semibold text-sm mb-2">Location</p>
              <AddressMap address={job.address} />
            </div>
          )}

          {/* Incomplete Profile Warning */}
          {profileIncomplete && (
            <div className="bg-amber-50 dark:bg-amber-950 border border-amber-300 dark:border-amber-700 rounded-xl p-4">
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-200 mb-1">⚠️ Profile Incomplete</p>
              <p className="text-xs text-amber-700 dark:text-amber-300">Complete your provider profile to accept jobs and message customers.</p>
              <a href="/contractor-setup" className="inline-block mt-2 text-xs font-bold text-amber-800 dark:text-amber-200 underline">Complete Your Profile →</a>
            </div>
          )}

          {/* Accept Button — only show for pending, un-accepted jobs */}
          {job.status === "pending" && !job.accepted_by_email && (
            <Button
             onClick={handleAcceptWithEmail}
             disabled={accepting || loading || profileIncomplete}
             className="w-full h-12 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold disabled:opacity-50"
            >
             {accepting || loading ? (
               <>
                 <Loader2 className="w-4 h-4 animate-spin mr-2" />
                 Accepting...
               </>
             ) : (
               <>
                 <CheckCircle className="w-4 h-4 mr-2" />
                 Accept Job
               </>
             )}
            </Button>
          )}
          {job.accepted_by_email && job.accepted_by_email !== user?.email && (
            <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-xl p-3 text-center">
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">This job has already been accepted</p>
            </div>
          )}

          {/* Messaging — reuses BookingChat (the same component
              BookingDetail.jsx uses) instead of a second, hand-rolled,
              non-realtime chat implementation that used to live here and
              could drift from it. The provider's counterpart is always
              unambiguous (job.customer_email) since only this one provider
              is composing from this modal. */}
          {!profileIncomplete && user && (
            <BookingChat
              bookingId={job.id}
              currentUser={user}
              booking={job}
              isCustomer={false}
            />
          )}
          </div>
      </DialogContent>
    </Dialog>
  );
}