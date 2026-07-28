import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { MapPin, Calendar, Clock, DollarSign, Phone, Mail, FileText, Loader2, CheckCircle, Send } from "lucide-react";
import moment from "moment";
import { base44 } from "@/api/base44Client";
import AddressMap from "./AddressMap";

export default function JobDetailsModal({ job, open, onOpenChange, onAccept, accepting }) {
  const [messages, setMessages] = useState([]);
  const [messageInput, setMessageInput] = useState("");
  const [sendingMessage, setSendingMessage] = useState(false);
  const [user, setUser] = useState(null);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !job) return;
    base44.auth.me().then(setUser).catch(() => {});
    loadMessages();
  }, [open, job?.id]);

  const isContractorOrHandyman = ["Contractor", "Handyman"].includes(user?.user_type);
  const profileIncomplete = isContractorOrHandyman && (!user?.ein || !user?.ein?.trim());

  async function loadMessages() {
    if (!job?.id) return;
    setLoadingMessages(true);
    const msgs = await base44.entities.Message.filter({ booking_id: job.id }, "created_date", 50);
    setMessages(msgs);
    setLoadingMessages(false);
  }

  async function sendMessage() {
    if (!messageInput.trim() || !user || !job) return;
    setSendingMessage(true);
    await base44.entities.Message.create({
      booking_id: job.id,
      sender_email: user.email,
      sender_name: user.full_name,
      recipient_email: job.customer_email,
      content: messageInput,
    });
    setMessageInput("");
    await loadMessages();
    setSendingMessage(false);
  }

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
        body: `Hi ${job.customer_name},\n\n${user?.full_name} has accepted your job request for "${job.job_title}" scheduled for ${job.preferred_date}.\n\nThey will be heading to your location shortly.\n\nBest regards,\nLinked`,
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
            </div>
          </div>

          {/* Job Details */}
          <div className="space-y-3 text-sm">
            <div className="flex items-start gap-3">
              <MapPin className="w-4 h-4 text-primary mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold">Address</p>
                <p className="text-muted-foreground">{job.address}</p>
                <p className="text-muted-foreground">{job.city}, {job.state} {job.zip}</p>
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

          {/* Map */}
          {job.address && (
            <div>
              <p className="font-semibold text-sm mb-2">Location</p>
              <AddressMap address={job.address} />
            </div>
          )}

          {/* Incomplete Profile Warning */}
          {profileIncomplete && (
            <div className="bg-amber-50 dark:bg-amber-950 border border-amber-300 dark:border-amber-700 rounded-xl p-4">
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-200 mb-1">⚠️ Profile Incomplete</p>
              <p className="text-xs text-amber-700 dark:text-amber-300">Please add your <strong>EIN</strong> or <strong>Contractor License Number</strong> in Account settings to accept jobs and message customers.</p>
              <a href="/account" className="inline-block mt-2 text-xs font-bold text-amber-800 dark:text-amber-200 underline">Go to Account Settings →</a>
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

          {/* Messaging — only show if there are messages or user is contractor/handyman */}
          {!profileIncomplete && (messages.length > 0 || isContractorOrHandyman) && (
            <div className="bg-secondary/30 rounded-xl p-4 space-y-3">
              <p className="font-semibold text-sm">Messages</p>
              {messages.length > 0 && (
                <div className="bg-background rounded-lg p-3 max-h-48 overflow-y-auto space-y-3">
                  {loadingMessages ? (
                    <p className="text-xs text-muted-foreground text-center py-8">Loading messages...</p>
                  ) : (
                    messages.map((msg) => {
                      const isOwn = msg.sender_email === user?.email;
                      const initials = msg.sender_name?.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase() || "?";
                      return (
                        <div key={msg.id} className={`flex items-end gap-2 ${isOwn ? "justify-end" : "justify-start"}`}>
                          {!isOwn && (
                            <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center shrink-0 mb-0.5">
                              <span className="text-xs font-bold text-primary">{initials}</span>
                            </div>
                          )}
                          <div className={`max-w-[70%] rounded-2xl px-3 py-2 text-xs ${isOwn ? "bg-primary text-primary-foreground rounded-br-sm" : "bg-secondary text-foreground rounded-bl-sm"}`}>
                            {!isOwn && <p className="font-semibold text-xs mb-0.5 opacity-70">{msg.sender_name}</p>}
                            <p>{msg.content}</p>
                          </div>
                          {isOwn && (
                            <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center shrink-0 mb-0.5">
                              <span className="text-xs font-bold text-primary">{user?.full_name?.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase() || "?"}</span>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              )}
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Type a message..."
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && sendMessage()}
                  className="flex-1 px-3 py-2 text-xs rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <Button
                  size="icon"
                  onClick={sendMessage}
                  disabled={sendingMessage || !messageInput.trim()}
                  className="h-9 w-9"
                >
                  <Send className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
          </div>
      </DialogContent>
    </Dialog>
  );
}