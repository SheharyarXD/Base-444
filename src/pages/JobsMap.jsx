import { useState, useEffect } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap, ZoomControl } from "react-leaflet";
import Map3DBackground from "../components/Map3DBackground";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { base44 } from "@/api/base44Client";
import { MapPin, Navigation, Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import JobDetailsModal from "../components/JobDetailsModal";
import ReminderBanner, { useActiveReminders } from "../components/ReminderBanner";
import { haversineMiles } from "@/lib/geo";
import { isProviderEligibleForJob } from "@/lib/matching";

// _getIconUrl is a real internal property Leaflet's bundler-icon-path
// workaround needs, just not part of its public (and thus typed) API surface.
// @ts-ignore
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

// `isPriority` reflects the paid Priority Booking add-on. Customers pay for
// their job to stand out to providers, and until now nothing anywhere read
// the flag the purchase writes — the add-on had no effect at all. A larger
// marker with a gold ring is the whole of that delivery: providers see the
// job first because it is visually dominant, not because of a hidden ranking
// that a map has no way to express.
const createJobIcon = (customerType, isPriority = false) => {
  const bg = customerType === "Realtor" ? "#dc2626" : customerType === "Business Owner" ? "#2563eb" : "#ea580c";
  const label = customerType === "Realtor" ? "R" : customerType === "Business Owner" ? "B" : "H";
  const size = isPriority ? 40 : 32;
  const ring = isPriority
    ? "border:3px solid #f59e0b;box-shadow:0 0 0 3px rgba(245,158,11,0.35),0 2px 6px rgba(0,0,0,0.3)"
    : "border:2px solid #fff;box-shadow:0 2px 4px rgba(0,0,0,0.25)";
  return new L.DivIcon({
    html: `<div style="background:${bg};color:#fff;border-radius:50%;width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;font-size:${isPriority ? 15 : 13}px;font-weight:700;${ring}">${label}</div>`,
    className: "",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
};

const centerIcon = new L.DivIcon({
  html: `<div style="background:#2563eb;color:#fff;border-radius:50%;width:32px;height:32px;display:flex;align-items:center;justify-content:center;font-size:14px;border:2px solid #fff;box-shadow:0 2px 4px rgba(0,0,0,0.25)">📍</div>`,
  className: "",
  iconSize: [32, 32],
  iconAnchor: [16, 16],
});

const DISTANCE_TABS = [
  { label: "5 mi", miles: 5 },
  { label: "10 mi", miles: 10 },
  { label: "25 mi", miles: 25 },
  { label: "All", miles: null },
];

// Eligibility and the result limit now live in the getOpenJobs function,
// which is the enforcement point for what a provider may see.

function FlyTo({ center }) {
  const map = useMap();
  useEffect(() => {
    if (!center || !map) return;
    const lat = Number(center.lat);
    const lng = Number(center.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    const fly = () => {
      try {
        if (map.getContainer() && map.getSize().x > 0) {
          map.flyTo([lat, lng], 12, { duration: 1.2 });
        }
      } catch (e) {
        // map not ready yet, ignore
      }
    };
    const t = setTimeout(fly, 300);
    return () => clearTimeout(t);
  }, [center?._ts, map]);
  return null;
}

export default function JobsMap() {
  const [searchParams] = useSearchParams();
  const [geocoded, setGeocoded] = useState([]);
  const [userLocation, setUserLocation] = useState(null);
  const [locationError, setLocationError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedDistance, setSelectedDistance] = useState(25);
  const [zipInput, setZipInput] = useState(searchParams.get("zip") || "");
  const [flyTarget, setFlyTarget] = useState(null);
  const [centerLabel, setCenterLabel] = useState("Your Location");
  const [zipLoading, setZipLoading] = useState(false);
  const [user, setUser] = useState(null);
  const [accepting, setAccepting] = useState(null);
  const [selectedJob, setSelectedJob] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [contractor, setContractor] = useState(null);
  const [profileIncompleteForJobs, setProfileIncompleteForJobs] = useState(false);
  const { reminders, dismiss: dismissReminder } = useActiveReminders({ recipientEmail: user?.email });

  async function handleZipSearch(zipCode = zipInput.trim()) {
    if (!zipCode) return;
    setZipLoading(true);
    try {
      const res = await fetch(
        `https://api.zippopotam.us/us/${encodeURIComponent(zipCode)}`
      );
      const data = await res.json();
      if (data.places && data.places.length > 0) {
        const place = data.places[0];
        const lat = parseFloat(place.latitude);
        const lng = parseFloat(place.longitude);
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
          const loc = { lat, lng };
          setUserLocation(loc);
          setFlyTarget({ ...loc, _ts: Date.now() });
          setCenterLabel(`Zip: ${zipCode}`);
        } else {
          toast.error("Invalid location data. Please try another zip code.");
        }
      } else {
        toast.error("Zip code not found. Please try another.");
      }
    } catch (err) {
      console.error('Zip search error:', err);
      toast.error("Failed to search zip code");
    }
    setZipLoading(false);
  }



  // Open jobs come from the getOpenJobs function rather than a direct query.
  // Reading Booking directly used to work because the access policy granted
  // every signed-in user read access to any job while it was pending — which
  // also handed out the customer's phone, email and exact street address.
  // That clause is gone; this function returns only what a provider needs to
  // decide, with approximate coordinates, and applies eligibility server-side.
  async function loadPendingJobs() {
    setLoading(true);
    try {
      const res = await base44.functions.invoke("getOpenJobs", {});
      if (res.data?.profileIncomplete) {
        setProfileIncompleteForJobs(true);
        setGeocoded([]);
        return;
      }
      // Jobs arrive with approximate coordinates already attached. Anything
      // without usable coordinates simply cannot be placed on a map — there is
      // no address to fall back on any more, and that is intentional.
      const results = (res.data?.jobs || [])
        .filter((job) => Number.isFinite(job.job_lat) && Number.isFinite(job.job_lng))
        .map((job) => ({ ...job, lat: job.job_lat, lng: job.job_lng }));
      setGeocoded(results);
    } catch (err) {
      console.error("Failed to load open jobs:", err);
      toast.error("Couldn't load nearby jobs. Pull to retry.");
      setGeocoded([]);
    } finally {
      setLoading(false);
    }
  }

  // Load user and bookings only once on mount
  useEffect(() => {
    const zip = searchParams.get("zip");
    if (zip) {
      setZipInput(zip);
      handleZipSearch(zip);
    }

    base44.auth.me().then(async (me) => {
      setUser(me);
      let myContractor = null;
      if (["Contractor", "Handyman"].includes(me?.user_type)) {
        const contractors = await base44.entities.Contractor.filter({ created_by: me.email });
        if (contractors.length > 0) {
          myContractor = contractors[0];
          setContractor(myContractor);
          // Auto-zoom to preferred zip code if set and no zip from URL
          const prefZip = myContractor.preferred_zip_code;
          if (prefZip && !searchParams.get("zip")) {
            setZipInput(prefZip);
            handleZipSearch(prefZip);
          }
        } else {
          // Provider account with no Contractor profile yet — shouldn't
          // normally happen once /contractor-setup gating is in place, but
          // guard anyway rather than showing every job in existence.
          setProfileIncompleteForJobs(true);
          setLoading(false);
          return;
        }
      }
      // getOpenJobs derives the provider's category and eligibility server-side
      // from the caller's own identity, so nothing needs passing in.
      await loadPendingJobs();
    }).catch(() => { loadPendingJobs(); });

    navigator.geolocation?.getCurrentPosition(
      (pos) => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setUserLocation(loc);
        setFlyTarget({ ...loc, _ts: Date.now() });
        setCenterLabel("Your Location");
      },
      () => setLocationError(true)
    );

    const unsubscribe = base44.entities.Booking.subscribe(async (event) => {
      // A job that stops being pending (someone else accepted it, or the
      // customer cancelled it) must leave the map for EVERY viewer, not just
      // the provider who accepted it. Previously only the accepting client
      // removed the marker locally, so every other provider kept seeing —
      // and could keep trying to accept — a job that was already taken.
      if (event.type === "update") {
        if (event.data?.status && event.data.status !== "pending") {
          setGeocoded((prev) => prev.filter((j) => j.id !== event.id));
        }
        return;
      }
      if (event.type === "delete") {
        setGeocoded((prev) => prev.filter((j) => j.id !== event.id));
        return;
      }
      if (event.type !== "create" || event.data?.status !== "pending") return;

      // The event payload is the raw booking record, including the customer's
      // contact details and exact address. It is never put on the map
      // directly — the new job is re-fetched through getOpenJobs, which
      // applies the same redaction and eligibility check as the initial load.
      // Anything the caller is not entitled to see simply comes back refused,
      // and nothing is added.
      base44.functions
        .invoke("getOpenJobs", { bookingId: event.id })
        .then((res) => {
          const job = res?.data?.job;
          if (!job || !Number.isFinite(job.job_lat) || !Number.isFinite(job.job_lng)) return;
          toast.info(`🆕 New job: ${job.job_title}`, { duration: 5000 });
          setGeocoded((prev) =>
            prev.some((j) => j.id === job.id)
              ? prev
              : [{ ...job, lat: job.job_lat, lng: job.job_lng }, ...prev]
          );
        })
        .catch(() => {
          // Not eligible, or the job was taken between the event and the
          // fetch. Either way there is nothing to show.
        });
    });

    return unsubscribe;
  }, []); // Run only once on mount

  // Returns true if the job was actually accepted, false otherwise — callers
  // (e.g. JobDetailsModal) rely on this to decide whether it's safe to send
  // the "job accepted" email, since the acceptance can be server-rejected.
  async function handleAccept(job) {
    if (!user) return false;

    // Friendly client-side pre-checks (UX only — real enforcement is
    // server-side in the acceptJob function called below).
    if (["Contractor", "Handyman"].includes(user.user_type) && contractor) {
      if (!isProviderEligibleForJob(contractor, job)) {
        toast.error(
          job.contractor_id
            ? "This job was booked directly for a different provider."
            : "This job isn't in your service category."
        );
        setAccepting(null);
        return false;
      }
      if (contractor.preferred_zip_code && job.zip !== contractor.preferred_zip_code) {
        toast.error(`This job is in zip ${job.zip}, but your preferred area is ${contractor.preferred_zip_code}`);
        setAccepting(null);
        return false;
      }
      if (contractor.preferred_miles_distance && userLocation && Number.isFinite(job.lat) && Number.isFinite(job.lng)) {
        const distance = haversineMiles(userLocation.lat, userLocation.lng, job.lat, job.lng);
        if (distance > contractor.preferred_miles_distance) {
          toast.error(`This job is ${distance.toFixed(1)} miles away, but you only travel up to ${contractor.preferred_miles_distance} miles`);
          setAccepting(null);
          return false;
        }
      }
    }

    setAccepting(job.id);
    try {
      const res = await base44.functions.invoke('acceptJob', { bookingId: job.id });
      if (res.data?.error) {
        toast.error(res.data.error);
        setAccepting(null);
        return false;
      }
      setGeocoded((prev) => prev.filter((j) => j.id !== job.id));
      setModalOpen(false);
      toast.success("Job accepted! Message the customer to confirm details, then mark yourself on the way from My Jobs.");
      setAccepting(null);
      return true;
    } catch (error) {
      toast.error(error?.response?.data?.error || "Failed to accept job — it may have just been taken.");
      setAccepting(null);
      return false;
    }
  }

  function handleJobClick(job) {
    setSelectedJob(job);
    setModalOpen(true);
  }

  const filtered = geocoded.filter((job) => {
    if (!job.lat || !job.lng || !Number.isFinite(job.lat) || !Number.isFinite(job.lng)) return false;
    if (!selectedDistance || !userLocation) return true;
    return haversineMiles(userLocation.lat, userLocation.lng, job.lat, job.lng) <= selectedDistance;
  });

  const isContractor = ["Contractor", "Handyman"].includes(user?.user_type);
  const mapCenter = userLocation || { lat: 39.8283, lng: -98.5795 };
  const initialZoom = userLocation ? 12 : 4;

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] pb-16 md:pb-0 relative">
      <div className="fixed inset-0 pointer-events-none -z-10" style={{ top: 0, left: 0 }}>
        <Map3DBackground />
      </div>
      {/* Header */}
      <div className="px-4 pt-4 pb-3 bg-background border-b border-border shrink-0">
        <div className="flex items-center gap-2 mb-3">
          <MapPin className="w-5 h-5 text-primary" />
          <h1 className="font-heading font-bold text-lg">
            {isContractor ? "Available Jobs Near You" : "Jobs Near You"}
          </h1>
          <span className="ml-auto text-xs text-muted-foreground bg-secondary px-2 py-1 rounded-full">
            {filtered.length} job{filtered.length !== 1 ? "s" : ""}
          </span>
        </div>

        {isContractor && contractor?.category && (
          <div className="mb-2 px-3 py-2 bg-secondary rounded-lg text-xs text-muted-foreground">
            Showing <strong>{contractor.category}</strong> jobs. Tap a job on the map to view and accept it.
          </div>
        )}

        {isContractor && reminders.length > 0 && (
          <ReminderBanner reminders={reminders} onDismiss={dismissReminder} className="mb-2" />
        )}

        {isContractor && profileIncompleteForJobs && (
          <div className="mb-2 px-3 py-2 bg-amber-50 dark:bg-amber-950 border border-amber-300 dark:border-amber-700 rounded-lg text-xs text-amber-800 dark:text-amber-200">
            Complete your provider profile to see matching jobs.{" "}
            <Link to="/contractor-setup" className="underline font-semibold">Set up now →</Link>
          </div>
        )}

        {/* Zip Code Input */}
        <div className="flex gap-2 mb-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Enter zip code..."
              value={zipInput}
              onChange={(e) => setZipInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleZipSearch()}
              className="w-full pl-8 pr-3 py-2 text-xs rounded-lg border border-border bg-secondary text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <button
            onClick={() => handleZipSearch()}
            disabled={zipLoading}
            className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-60 flex items-center gap-1"
          >
            {zipLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Search"}
          </button>
        </div>

        {/* Distance Tabs */}
        <div className="flex gap-2">
          {DISTANCE_TABS.map((tab) => (
            <button
              key={tab.label}
              onClick={() => setSelectedDistance(tab.miles)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                selectedDistance === tab.miles
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
            </button>
          ))}
          {locationError && !userLocation && (
            <span className="text-xs text-amber-600 flex items-center gap-1 ml-auto">
              <Navigation className="w-3 h-3" /> Location unavailable
            </span>
          )}
        </div>
      </div>

      {/* Map */}
      <div className="flex-1 relative z-10">
        {loading && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/80 pointer-events-auto">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        )}
        <MapContainer
          center={[mapCenter.lat, mapCenter.lng]}
          zoom={initialZoom}
          style={{ height: "100%", width: "100%" }}
          zoomControl={false}
          dragging={true}
          touchZoom={true}
          scrollWheelZoom={true}
          doubleClickZoom={true}
          boxZoom={false}
          keyboard={false}
        >
          <ZoomControl position="bottomright" />
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {!loading && flyTarget && <FlyTo center={flyTarget} />}

          {userLocation && (
            <>
              <Marker position={[userLocation.lat, userLocation.lng]} icon={centerIcon}>
                <Popup><strong>{centerLabel}</strong></Popup>
              </Marker>
              {selectedDistance && (
                <Circle
                  center={[userLocation.lat, userLocation.lng]}
                  radius={selectedDistance * 1609.34}
                  pathOptions={{ color: "hsl(25, 70%, 60%)", fillColor: "hsl(25, 70%, 60%)", fillOpacity: 0.08, weight: 1.5, dashArray: "6" }}
                />
              )}
            </>
          )}

          {/* Priority jobs render last so their marker sits above overlapping
              standard markers rather than behind them. */}
          {[...filtered]
            .sort((a, b) => Number(!!a.is_priority) - Number(!!b.is_priority))
            .map((job) => {
              if (!Number.isFinite(job.lat) || !Number.isFinite(job.lng)) return null;
              return (
                <Marker
                  key={job.id}
                  position={[job.lat, job.lng]}
                  icon={createJobIcon(job.customer_type, job.is_priority)}
                  eventHandlers={{ click: () => handleJobClick(job) }}
                />
              );
            })}
        </MapContainer>
      </div>
      <JobDetailsModal
        job={selectedJob}
        open={modalOpen}
        onOpenChange={setModalOpen}
        onAccept={handleAccept}
        accepting={accepting === selectedJob?.id}
      />
    </div>
  );
}
