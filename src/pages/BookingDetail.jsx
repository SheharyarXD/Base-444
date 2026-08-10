import { useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Calendar, MapPin, Clock, MessageCircle, Navigation, Car, X, Download, Camera, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { base44 } from "@/api/base44Client";
import AddressMap from "../components/AddressMap";
import TrackingMap from "../components/TrackingMap";
import BookingChat from "../components/BookingChat";
import ReviewForm from "../components/ReviewForm";
import ReminderBanner, { useActiveReminders } from "../components/ReminderBanner";
import { toast } from "sonner";
import moment from "moment";
import { motion } from "framer-motion";
import { haversineFeet } from "@/lib/geo";
import { canViewFullJobDetails, maskedCityStateZip } from "@/lib/jobPrivacy";
import { isProviderEligibleForJob } from "@/lib/matching";
import { BOOKING_STATUS_STYLES as statusStyles, BOOKING_STATUS_LABELS as statusLabels } from "@/lib/bookingStatus";

export default function BookingDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState(true);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [user, setUser] = useState(null);
  const [nearbyAlerted, setNearbyAlerted] = useState(false);
  const [acceptDialogOpen, setAcceptDialogOpen] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [startingOnTheWay, setStartingOnTheWay] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const [downloadingPDF, setDownloadingPDF] = useState(false);
  const [optimisticStatus, setOptimisticStatus] = useState(null);
  const [trackingActive, setTrackingActive] = useState(false);
  const [arrivedPrompt, setArrivedPrompt] = useState(false);
  const [jobCoords, setJobCoords] = useState(null);
  const [showReviewPrompt, setShowReviewPrompt] = useState(false);
  const [contractorArrived, setContractorArrived] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [reviewFormOpen, setReviewFormOpen] = useState(false);
  const [contractorBusinessName, setContractorBusinessName] = useState("");
  const [contractorEntityId, setContractorEntityId] = useState(null);
  const [viewerContractor, setViewerContractor] = useState(null);
  const [pendingProviderThreads, setPendingProviderThreads] = useState([]);
  const [selectedCounterpart, setSelectedCounterpart] = useState(null);
  const { reminders, dismiss: dismissReminder } = useActiveReminders({
    recipientEmail: user?.email,
    bookingId: id,
    type: "on_the_way_pending",
  });

  function checkProximity(bookingData, userCoords) {
    if (!bookingData?.contractor_lat || !bookingData?.contractor_lng || !userCoords || nearbyAlerted) return;
    const dist = haversineFeet(userCoords.lat, userCoords.lng, bookingData.contractor_lat, bookingData.contractor_lng);
    if (dist <= 1000) {
      toast.info("📍 Contractor is within 1000 feet! They'll arrive shortly.", { duration: 8000 });
      setNearbyAlerted(true);
    }
  }

  useEffect(() => {
    async function load() {
      const [b, me] = await Promise.all([base44.entities.Booking.get(id), base44.auth.me()]);
      setBooking(b);
      setUser(me);
      setLoading(false);

      // Needed to gate the Accept button / chat on a still-pending job to
      // only the providers who are actually eligible for it — pending jobs
      // are readable by any authenticated user (see Booking.jsonc RLS), so
      // an unrelated or wrong-category provider could otherwise land here
      // directly via URL and see the accept/chat UI for a job that isn't
      // theirs to act on.
      if (b?.status === "pending" && ["Contractor", "Handyman"].includes(me?.user_type)) {
        base44.entities.Contractor.filter({ created_by: me.email }).then(contractors => {
          setViewerContractor(contractors[0] || null);
        }).catch(() => {});
      }

      // A still-pending job has no single fixed counterpart yet
      // (accepted_by_email is unset) — but more than one eligible provider
      // can legitimately have already messaged the customer about it. Find
      // who's actually reached out so the customer can pick who to reply to,
      // instead of the chat silently saving replies with recipient_email:
      // undefined (previously unreadable by anyone).
      if (b?.status === "pending" && me?.email === b?.customer_email) {
        base44.entities.Message.filter({ booking_id: id, recipient_email: me.email }, "created_date", 100)
          .then((msgs) => {
            const bySender = new Map();
            for (const m of msgs) {
              if (!bySender.has(m.sender_email)) bySender.set(m.sender_email, m.sender_name || m.sender_email);
            }
            const threads = [...bySender.entries()].map(([email, name]) => ({ email, name }));
            setPendingProviderThreads(threads);
            if (threads.length === 1) setSelectedCounterpart(threads[0].email);
          })
          .catch(() => {});
      }

      // Fetch contractor's business name and entity ID if booking has an accepted contractor
      if (b?.accepted_by_email) {
        base44.entities.User.filter({ email: b.accepted_by_email }).then(users => {
          if (users[0]?.business_name) setContractorBusinessName(users[0].business_name);
        }).catch(() => {});
      }
      // Look up the Contractor entity by created_by email to get the profile ID
      const contractorEmail = b?.accepted_by_email;
      if (contractorEmail && !b?.contractor_id) {
        base44.entities.Contractor.filter({ created_by: contractorEmail }).then(contractors => {
          if (contractors[0]?.id) setContractorEntityId(contractors[0].id);
        }).catch(() => {});
      } else if (b?.contractor_id) {
        setContractorEntityId(b.contractor_id);
      }

      // Get user's current location for proximity checks
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition((pos) => {
          const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          checkProximity(b, coords);
        });
      }
    }
    load();

    const unsubscribe = base44.entities.Booking.subscribe((event) => {
      if (event.id === id && event.type === "update") {
        setBooking(event.data);
        if (event.data.status === "on_the_way") {
          toast.info("🚗 Your contractor is on the way!", { duration: 6000 });
        }
        if (event.data.status === "completed" && event.data.customer_email === event.data.customer_email) {
          // Show review prompt to customer
          base44.auth.me().then(me => {
            if (me?.email === event.data.customer_email) setShowReviewPrompt(true);
          }).catch(() => {});
        }
        if (event.data.contractor_lat && event.data.contractor_lng) {
          // Check if contractor arrived (within 200ft) for customer notification
          if (jobCoords && !contractorArrived) {
            const dist = haversineFeet(event.data.contractor_lat, event.data.contractor_lng, jobCoords.lat, jobCoords.lng);
            if (dist <= 200) {
              setContractorArrived(true);
              toast.success("🚗 Contractor has arrived!", { duration: 8000 });
            }
          }
          if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition((pos) => {
              checkProximity(event.data, { lat: pos.coords.latitude, lng: pos.coords.longitude });
            });
          }
        }
      }
    });
    return unsubscribe;
  }, [id]);

  // Geocode job address for arrival detection
  useEffect(() => {
    if (!booking?.address) return;
    fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(booking.address)}&limit=1`)
      .then(r => r.json())
      .then(data => {
        if (data[0]) setJobCoords({ lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) });
      })
      .catch(() => {});
  }, [booking?.address]);

  // GPS tracking for contractors on the way
  useEffect(() => {
    if (!user || !booking) return;
    const isContractor = user.email === booking.accepted_by_email || (!booking.accepted_by_email && ["Contractor", "Handyman"].includes(user.user_type));
    if (!isContractor || booking.status !== "on_the_way") return;
    if (!navigator.geolocation) return;

    setTrackingActive(true);
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        base44.entities.Booking.update(id, {
          contractor_lat: pos.coords.latitude,
          contractor_lng: pos.coords.longitude,
        }).catch(() => {});
        // Check if within 200ft of job address
        if (jobCoords) {
          const dist = haversineFeet(pos.coords.latitude, pos.coords.longitude, jobCoords.lat, jobCoords.lng);
          if (dist <= 200) setArrivedPrompt(true);
        }
      },
      () => setTrackingActive(false),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
      setTrackingActive(false);
    };
  }, [user?.email, booking?.status, id, jobCoords]);

  // Routed through updateBookingStatus (not a raw Booking.update) — that
  // function re-checks the current status and caller identity server-side
  // before writing, and is what actually enforces the transition table
  // (illegal/out-of-order status changes used to be possible via a raw
  // client call, since Booking's RLS is row-level only).
  async function changeStatus(status, { successMessage, errorMessage }) {
    setOptimisticStatus(status);
    try {
      const res = await base44.functions.invoke('updateBookingStatus', { bookingId: id, status });
      if (res.data?.error) {
        setOptimisticStatus(null);
        toast.error(res.data.error);
        return false;
      }
      setBooking({ ...booking, status });
      toast.success(successMessage);
      return true;
    } catch (error) {
      setOptimisticStatus(null);
      toast.error(error?.response?.data?.error || errorMessage);
      return false;
    }
  }

  function cancelBooking() {
    return changeStatus("cancelled", { successMessage: "Booking cancelled", errorMessage: "Failed to cancel booking" });
  }

  function markArrived() {
    return changeStatus("in_progress", { successMessage: "Marked as arrived!", errorMessage: "Failed to update status" });
  }

  function completeBooking() {
    return changeStatus("completed", { successMessage: "Job marked as completed!", errorMessage: "Failed to complete booking" });
  }

  async function acceptBooking() {
    setAccepting(true);
    setOptimisticStatus("accepted");
    try {
      const res = await base44.functions.invoke('acceptJob', { bookingId: id });
      if (res.data?.error) {
        setOptimisticStatus(null);
        toast.error(res.data.error);
        return;
      }
      setBooking({ ...booking, status: "accepted", accepted_by_email: user.email, accepted_by_name: user.full_name });
      setAcceptDialogOpen(false);
      toast.success("Job accepted! You can now message the customer to confirm details before heading over.");
    } catch (error) {
      setOptimisticStatus(null);
      toast.error(error?.response?.data?.error || "Failed to accept booking");
    } finally {
      setAccepting(false);
    }
  }

  async function startOnTheWay() {
    setStartingOnTheWay(true);
    const ok = await changeStatus("on_the_way", { successMessage: "Customer has been notified you're on the way!", errorMessage: "Failed to update status" });
    if (ok) {
      base44.functions.invoke('notifyCustomerOnTheWay', { booking_id: id }).catch(() => {});
      // The reminder should disappear immediately once "On The Way" is
      // pressed — dismiss it as part of the same action rather than waiting
      // for the next scheduled reminder-engine pass.
      reminders.forEach((r) => dismissReminder(r.id));
    }
    setStartingOnTheWay(false);
  }

  async function downloadPDF() {
    setDownloadingPDF(true);
    try {
      const res = await base44.functions.invoke('generateJobSummaryPDF', { bookingId: id });
      const signedUrl = await base44.integrations.Core.CreateFileSignedUrl({ file_uri: res.data.file_uri });
      window.open(signedUrl.signed_url, '_blank');
      toast.success('Summary downloaded!');
    } catch (error) {
      toast.error('Failed to download summary');
    } finally {
      setDownloadingPDF(false);
    }
  }

  async function handlePhotoUpload(e) {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    setUploadingPhoto(true);
    try {
      const urls = await Promise.all(
        files.map(async (file) => {
          const { file_url } = await base44.integrations.Core.UploadFile({ file });
          return file_url;
        })
      );
      const updatedPhotos = [...(booking.photo_urls || []), ...urls];
      await base44.entities.Booking.update(id, { photo_urls: updatedPhotos });
      setBooking({ ...booking, photo_urls: updatedPhotos });
      toast.success('Photos added successfully!');
    } catch (error) {
      console.error('Error uploading photos:', error);
      toast.error('Failed to upload photos');
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function removePhoto(indexToRemove) {
    const updatedPhotos = (booking.photo_urls || []).filter((_, i) => i !== indexToRemove);
    try {
      await base44.entities.Booking.update(id, { photo_urls: updatedPhotos });
      setBooking({ ...booking, photo_urls: updatedPhotos });
      toast.success('Photo removed');
    } catch (error) {
      console.error('Error removing photo:', error);
      toast.error('Failed to remove photo');
    }
  }

  async function deleteBooking() {
    if (!window.confirm('Are you sure you want to delete this booking? This cannot be undone.')) return;
    try {
      await base44.entities.Booking.delete(id);
      toast.success('Booking deleted');
      navigate('/bookings');
    } catch (error) {
      toast.error('Failed to delete booking');
    }
  }

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-1/2 bg-muted rounded" />
          <div className="h-64 bg-muted rounded-2xl" />
        </div>
      </div>
    );
  }

  if (!booking) {
    return (
      <div className="text-center py-20">
        <p className="text-muted-foreground">Booking not found.</p>
        <Link to="/bookings"><Button variant="ghost" className="mt-4">Back to Bookings</Button></Link>
      </div>
    );
  }

  const isCustomer = user && booking.customer_email === user.email;
  const isAcceptedContractor = !!booking.accepted_by_email && user?.email === booking.accepted_by_email;
  const isContractorOrHandyman = ["Contractor", "Handyman"].includes(user?.user_type);
  // Only meaningful while the job is still pending and this viewer hasn't
  // completed their Contractor profile yet — previously keyed off a legacy
  // `user.ein` field that isn't declared on User.jsonc and directly
  // contradicted ContractorSetup.jsx's own "verification is optional, never
  // blocks job acceptance" comment. Once a booking is accepted, the accepted
  // contractor is guaranteed to have a complete profile already (acceptJob
  // requires one), so this is always false for them.
  const profileIncomplete = isContractorOrHandyman && booking.status === "pending" && !viewerContractor;
  // Booking reads are visible to any authenticated user while a job is still
  // "pending" (needed for open-job discovery in JobsMap), so a still-pending
  // booking's exact address must stay masked here too for anyone who isn't
  // the customer or the provider who accepted it — mirrors JobDetailsModal.
  const canViewFull = canViewFullJobDetails(booking, user?.email);
  // For a still-pending job, only show the accept/chat UI to a provider who
  // is actually eligible for it (right category, or the specific direct-
  // booking target) — once a job is no longer pending, RLS already limits
  // who can even load this page to the customer/accepted provider/admin.
  const isEligiblePendingProvider =
    isContractorOrHandyman && isProviderEligibleForJob(viewerContractor, booking);
  // A still-pending booking has no fixed counterpart yet — for the customer,
  // only show chat once at least one provider has actually reached out (see
  // pendingProviderThreads above); for a provider, only once they're
  // eligible to act on it at all.
  const canShowChat =
    (isCustomer && (booking.status !== "pending" || pendingProviderThreads.length > 0)) ||
    (!isCustomer && (booking.status !== "pending" || isEligiblePendingProvider));

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 pb-24 md:pb-12">
      <Link to="/bookings" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6">
        <ArrowLeft className="w-4 h-4" />
        Back to Bookings
      </Link>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
        {/* Review Prompt for Customer */}
        {showReviewPrompt && booking.status === "completed" && isCustomer && (
          <div className="bg-amber-50 border-2 border-amber-400 rounded-2xl p-5 flex flex-col gap-3 shadow-lg">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
                <span className="text-2xl">⭐</span>
              </div>
              <div>
                <p className="font-heading font-bold text-amber-900 text-base">Job Completed!</p>
                <p className="text-xs text-amber-700">How did it go? Leave a review for your contractor.</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={() => setReviewFormOpen(true)}
                className="flex-1 h-11 rounded-xl font-heading font-bold bg-amber-500 hover:bg-amber-600 text-white"
              >
                Leave a Review
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowReviewPrompt(false)}
                className="h-11 px-4 rounded-xl font-heading font-bold"
              >
                Later
              </Button>
            </div>
          </div>
        )}

        {/* Contractor Arrived Banner for Customer */}
        {contractorArrived && booking.status === "on_the_way" && isCustomer && (
          <div className="bg-emerald-50 border-2 border-emerald-400 rounded-2xl p-4 flex items-center gap-3 animate-pulse shadow-md">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0">
              <span className="text-2xl">✅</span>
            </div>
            <div>
              <p className="font-heading font-bold text-emerald-900">Contractor has arrived!</p>
              <p className="text-xs text-emerald-700">Your contractor is at the job site.</p>
            </div>
          </div>
        )}

        {/* On The Way reminder — only ever matches for the accepted provider viewing their own booking (scoped by recipient_email via RLS) */}
        {reminders.length > 0 && (
          <ReminderBanner reminders={reminders} onDismiss={dismissReminder} />
        )}

        {/* Accepted Banner — job is committed but the provider hasn't left yet */}
        {booking.status === "accepted" && (
          <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center shrink-0">
              <CheckCircle className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="font-heading font-bold text-blue-800">
                {isCustomer ? `${booking.contractor_name || booking.accepted_by_name} accepted your job!` : "You've accepted this job"}
              </p>
              <p className="text-xs text-blue-600">Use chat to confirm final details and price before heading over.</p>
            </div>
          </div>
        )}

        {/* On The Way Banner */}
        {booking.status === "on_the_way" && !contractorArrived && (
          <div className="bg-violet-50 border border-violet-200 rounded-2xl p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-violet-100 flex items-center justify-center shrink-0">
              <Car className="w-5 h-5 text-violet-600" />
            </div>
            <div>
              <p className="font-heading font-bold text-violet-800">Contractor is on the way!</p>
              <p className="text-xs text-violet-600">Your contractor is heading to your location now.</p>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="bg-card rounded-2xl border border-border p-6">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div>
              <h1 className="font-heading font-extrabold text-xl md:text-2xl text-foreground">
                {booking.job_title}
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                Booked {moment(booking.created_date).fromNow()}
              </p>
            </div>
            <Badge variant="outline" className={`text-sm px-3 py-1.5 ${statusStyles[booking.status]}`}>
              {statusLabels[booking.status]}
            </Badge>
          </div>

          <Link
            to={`/contractor/${booking.contractor_id}`}
            className="flex items-center gap-3 bg-secondary/50 rounded-xl p-4 hover:bg-secondary transition-colors"
          >
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
              <span className="font-heading font-bold text-primary">
                {booking.contractor_name?.charAt(0)}
              </span>
            </div>
            <div>
              <p className="font-heading font-bold text-foreground">{booking.contractor_name}</p>
              <p className="text-xs text-muted-foreground">{booking.contractor_category}</p>
            </div>
          </Link>
        </div>

        {/* GPS Active Indicator for Contractor */}
        {trackingActive && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3 flex items-center gap-3">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
            <p className="text-sm text-emerald-700 font-semibold">GPS tracking active — sharing your location with the customer</p>
          </div>
        )}

        {/* Tracking Map - Show when contractor is on the way */}
        {booking.status === "on_the_way" && booking.contractor_lat && booking.contractor_lng && (
          <TrackingMap
            address={booking.address}
            contractorLat={booking.contractor_lat}
            contractorLng={booking.contractor_lng}
            contractorName={booking.contractor_name}
          />
        )}

        {/* Details */}
        <div className="bg-card rounded-2xl border border-border p-6 space-y-4">
          <h2 className="font-heading font-bold text-base">Booking Details</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div className="flex items-start gap-3">
              <Calendar className="w-4 h-4 text-primary mt-0.5" />
              <div>
                <p className="font-semibold">Date</p>
                <p className="text-muted-foreground">{moment(booking.preferred_date).format("MMMM D, YYYY")}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Clock className="w-4 h-4 text-primary mt-0.5" />
              <div>
                <p className="font-semibold">Time</p>
                <p className="text-muted-foreground">{booking.preferred_time || "Flexible"}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <MapPin className="w-4 h-4 text-primary mt-0.5" />
              <div>
                <p className="font-semibold">Address</p>
                {canViewFull ? (
                  <>
                    <p className="text-muted-foreground">{booking.address}</p>
                    <p className="text-muted-foreground">{booking.city}, {booking.state} {booking.zip}</p>
                    <a
                      href={`https://maps.google.com/?q=${encodeURIComponent(`${booking.address}, ${booking.city}, ${booking.state} ${booking.zip}`)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-1"
                    >
                      <Navigation className="w-3 h-3" />
                      Open in Maps
                    </a>
                  </>
                ) : (
                  <>
                    <p className="text-muted-foreground">{maskedCityStateZip(booking)}</p>
                    <p className="text-xs text-muted-foreground italic mt-0.5">Exact address shared once you accept</p>
                  </>
                )}
              </div>
            </div>
          </div>
          {booking.address && booking.status !== "on_the_way" && canViewFull && (
            <div className="pt-4 border-t border-border">
              <AddressMap address={booking.address} />
            </div>
          )}
          {booking.photo_urls?.length > 0 && (
            <div className="pt-4 border-t border-border">
              <h3 className="font-heading font-bold text-sm text-foreground mb-3">Job Photos</h3>
              <div className="grid grid-cols-3 gap-3">
                {booking.photo_urls.map((url, i) => (
                  <div
                    key={i}
                    className="relative overflow-hidden rounded-lg aspect-square bg-secondary group"
                  >
                    <button
                      onClick={() => setSelectedPhoto(url)}
                      className="w-full h-full hover:opacity-75 transition-opacity"
                    >
                      <img src={url} alt="Job" className="w-full h-full object-cover" />
                    </button>
                    {!isCustomer && (
                      <button
                        onClick={() => removePhoto(i)}
                        className="absolute top-1 right-1 bg-black/60 rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="w-3 h-3 text-white" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
          {!isCustomer && (booking.status === "in_progress" || booking.status === "completed") && (
            <div className="pt-4 border-t border-border">
              <h3 className="font-heading font-bold text-sm text-foreground mb-3">Add Completed Work Photos</h3>
              <div className="flex flex-wrap gap-3">
                <label className="w-20 h-20 rounded-xl border-2 border-dashed border-border flex flex-col items-center justify-center cursor-pointer hover:border-primary transition-colors bg-secondary">
                  {uploadingPhoto ? (
                    <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <Camera className="w-5 h-5 text-muted-foreground mb-1" />
                      <span className="text-xs text-muted-foreground">Add</span>
                    </>
                  )}
                  <input type="file" accept="image/*" multiple className="hidden" onChange={handlePhotoUpload} disabled={uploadingPhoto} />
                </label>
              </div>
              <p className="text-xs text-muted-foreground mt-2">Add photos showing the completed work</p>
            </div>
          )}

          {booking.notes && (
            <div className="pt-4 border-t border-border">
              <div className="flex items-start gap-3">
                <MessageCircle className="w-4 h-4 text-primary mt-0.5" />
                <div>
                  <p className="font-semibold text-sm">Notes</p>
                  <p className="text-sm text-muted-foreground mt-1">{booking.notes}</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Photo Viewer Modal */}
        {selectedPhoto && (
          <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4" onClick={() => setSelectedPhoto(null)}>
            <button
              onClick={() => setSelectedPhoto(null)}
              className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
            >
              <X className="w-6 h-6 text-white" />
            </button>
            <img src={selectedPhoto} alt="Full size" className="max-w-full max-h-[90vh] object-contain rounded-lg" />
          </div>
        )}

        {/* Review Form Modal — props previously didn't match ReviewForm's
            actual signature (bookingId/onClose vs booking/open/onOpenChange),
            so `open` was always undefined and this dialog never rendered. */}
        {isCustomer && (
          <ReviewForm
            booking={booking}
            contractorId={booking.contractor_id}
            open={reviewFormOpen}
            onOpenChange={setReviewFormOpen}
            onSuccess={() => setShowReviewPrompt(false)}
          />
        )}

        {/* Chat */}
        {/* When more than one provider has messaged about a still-pending
            job, let the customer pick who they're replying to — otherwise
            their replies would merge into one undifferentiated thread with
            no way to tell providers apart. */}
        {isCustomer && booking.status === "pending" && pendingProviderThreads.length > 1 && (
          <div className="bg-card rounded-2xl border border-border p-4">
            <p className="text-sm font-semibold text-foreground mb-2">Replying to</p>
            <div className="flex flex-wrap gap-2">
              {pendingProviderThreads.map((t) => (
                <button
                  key={t.email}
                  onClick={() => setSelectedCounterpart(t.email)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                    selectedCounterpart === t.email ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t.name}
                </button>
              ))}
            </div>
          </div>
        )}
        {user && !profileIncomplete && canShowChat && (!isCustomer || booking.status !== "pending" || selectedCounterpart) && (
          <BookingChat
            bookingId={id}
            currentUser={user}
            booking={{ ...booking, contractor_business_name: contractorBusinessName, contractor_id: contractorEntityId || booking.contractor_id }}
            isCustomer={isCustomer}
            counterpartEmail={booking.status === "pending" ? selectedCounterpart : null}
          />
        )}
        {profileIncomplete && (
          <div className="bg-amber-50 dark:bg-amber-950 border border-amber-300 dark:border-amber-700 rounded-2xl p-5">
            <p className="font-semibold text-amber-800 dark:text-amber-200 mb-1">⚠️ Profile Incomplete</p>
            <p className="text-sm text-amber-700 dark:text-amber-300">Complete your provider profile to accept jobs and send messages.</p>
            <a href="/contractor-setup" className="inline-block mt-2 text-sm font-bold text-amber-800 dark:text-amber-200 underline">Complete Your Profile →</a>
          </div>
        )}



        {/* Actions */}
        <div className="flex gap-3 flex-col">
          {booking.status === "completed" && isCustomer && (
            <>
              <div className="flex gap-3">
                <Button
                  onClick={() => setReviewFormOpen(true)}
                  className="flex-1 rounded-2xl h-12 min-h-[44px] font-heading font-bold"
                >
                  Leave a Review
                </Button>
                <Button
                  onClick={downloadPDF}
                  disabled={downloadingPDF}
                  variant="outline"
                  className="rounded-2xl h-12 min-h-[44px] font-heading font-bold gap-2"
                >
                  <Download className="w-4 h-4" />
                  {downloadingPDF ? 'Generating...' : 'Summary'}
                </Button>
              </div>
              <Button
                onClick={deleteBooking}
                variant="outline"
                className="w-full rounded-2xl h-12 min-h-[44px] font-heading font-bold text-destructive border-destructive/30 hover:bg-destructive/5"
              >
                Delete Booking
              </Button>
            </>
          )}
          {booking.status === "completed" && !isCustomer && (
            <Button
             onClick={downloadPDF}
             disabled={downloadingPDF}
             variant="outline"
             className="flex-1 rounded-2xl h-12 min-h-[44px] font-heading font-bold gap-2"
            >
              <Download className="w-4 h-4" />
              {downloadingPDF ? 'Generating...' : 'Download Summary'}
            </Button>
          )}

          <div className="flex gap-3">
            {(booking.status === "in_progress" || optimisticStatus === "completed") && (
              <Button
                onClick={completeBooking}
                className="flex-1 rounded-2xl h-12 min-h-[44px] font-heading font-bold bg-emerald-600 hover:bg-emerald-700 text-white"
                disabled={optimisticStatus === "completed"}
              >
                {optimisticStatus === "completed" ? "Completing..." : "Mark as Completed"}
              </Button>
            )}

            {booking.status === "pending" && isContractorOrHandyman && isEligiblePendingProvider && !profileIncomplete && !booking.accepted_by_email && (
              <Dialog open={acceptDialogOpen} onOpenChange={setAcceptDialogOpen}>
              <DialogTrigger asChild>
                <Button className="flex-1 rounded-2xl h-12 min-h-[44px] font-heading font-bold bg-emerald-600 hover:bg-emerald-700 text-white">
                  Accept Job
                </Button>
              </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle className="font-heading">Accept This Job?</DialogTitle>
                  </DialogHeader>
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 my-2">
                    <div className="flex items-start gap-3">
                      <Car className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-semibold text-amber-800">Accepting commits you to this job.</p>
                        <p className="text-xs text-amber-700 mt-1">The customer will be notified you've accepted. Use chat to confirm final details and price before heading over — you'll mark yourself "on the way" separately once you actually leave.</p>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-3 pt-1">
                    <Button variant="outline" className="flex-1 min-h-[44px]" onClick={() => setAcceptDialogOpen(false)}>Not Yet</Button>
                      <Button className="flex-1 min-h-[44px] bg-emerald-600 hover:bg-emerald-700 text-white" onClick={acceptBooking} disabled={accepting}>
                        {accepting ? "Accepting..." : "Accept Job"}
                      </Button>
                  </div>
                </DialogContent>
              </Dialog>
            )}

            {booking.status === "accepted" && isAcceptedContractor && (
              <Button
                onClick={startOnTheWay}
                disabled={startingOnTheWay}
                className="flex-1 rounded-2xl h-12 min-h-[44px] font-heading font-bold bg-violet-600 hover:bg-violet-700 text-white gap-2"
              >
                <Car className="w-4 h-4" />
                {startingOnTheWay ? "Updating..." : "I'm On My Way"}
              </Button>
            )}

            {/* "Arrived" was previously only reachable via RealtorDashboard's
                geofence auto-detection — a normal (non-Realtor) job had no UI
                path from on_the_way to in_progress at all, so it could never
                be marked completed. This is that missing step, available to
                the accepted provider on any booking. */}
            {booking.status === "on_the_way" && isAcceptedContractor && (
              <Button
                onClick={markArrived}
                className="flex-1 rounded-2xl h-12 min-h-[44px] font-heading font-bold bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
              >
                <CheckCircle className="w-4 h-4" />
                I've Arrived
              </Button>
            )}

            {((booking.status === "pending" && isCustomer) ||
              (["accepted", "on_the_way", "in_progress"].includes(booking.status) && (isCustomer || isAcceptedContractor)) ||
              optimisticStatus === "cancelled") && (
              <Button
                variant="outline"
                className="flex-1 rounded-2xl h-12 min-h-[44px] font-heading font-bold text-destructive border-destructive/30 hover:bg-destructive/5"
                onClick={cancelBooking}
                disabled={optimisticStatus === "cancelled"}
              >
                {optimisticStatus === "cancelled" ? "Cancelling..." : "Cancel Booking"}
              </Button>
            )}
          </div>
          {/* Delete (hard-remove the record) is restricted to the customer —
              Booking's delete RLS never granted accepted_by_email delete
              rights, so a contractor seeing this button previously got a
              silent RLS-denied failure. */}
          {isCustomer && (booking.status === "cancelled" || booking.status === "completed") && (
            <Button
              onClick={deleteBooking}
              variant="outline"
              className="w-full rounded-2xl h-12 min-h-[44px] font-heading font-bold text-destructive border-destructive/30 hover:bg-destructive/5"
            >
              Delete Booking
            </Button>
          )}
        </div>
      </motion.div>
    </div>
  );
}