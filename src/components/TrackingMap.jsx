import { useState, useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Loader2, MapPin, AlertTriangle, WifiOff } from "lucide-react";
import { haversineMiles, geocodeAddress } from "@/lib/geo";
import {
  classifyLocationFreshness,
  isPresentableAsLive,
  FRESHNESS,
  FRESHNESS_LABELS,
} from "@/lib/tracking";

// _getIconUrl is a real internal property Leaflet's bundler-icon-path
// workaround needs, just not part of its public (and thus typed) API surface.
// @ts-ignore
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

// The provider marker is deliberately greyed out when the underlying fix is
// no longer live, so a customer can tell at a glance that the car on the map
// is a last known position rather than a moving vehicle (Phase 3 §26).
const contractorIcon = (live) =>
  new L.DivIcon({
    html: `<div style="background:${live ? "#10b981" : "#94a3b8"};color:#fff;border-radius:50%;width:40px;height:40px;display:flex;align-items:center;justify-content:center;font-size:20px;border:3px solid #fff;box-shadow:0 2px 8px ${
      live ? "rgba(16,185,129,0.6)" : "rgba(100,116,139,0.5)"
    }">🚗</div>`,
    className: "",
    iconSize: [40, 40],
    iconAnchor: [20, 20],
  });

const customerIcon = new L.DivIcon({
  html: `<div style="background:#f59e0b;color:#fff;border-radius:50%;width:40px;height:40px;display:flex;align-items:center;justify-content:center;font-size:20px;border:3px solid #fff;box-shadow:0 2px 8px rgba(245,158,11,0.6)">📍</div>`,
  className: "",
  iconSize: [40, 40],
  iconAnchor: [20, 20],
});

function relativeAge(updatedAt, now) {
  if (!updatedAt) return null;
  const t = new Date(updatedAt).getTime();
  if (Number.isNaN(t)) return null;
  const secs = Math.max(0, Math.round((now - t) / 1000));
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  return `${hrs} hr ago`;
}

const FRESHNESS_BANNER = {
  [FRESHNESS.LIVE]: {
    wrap: "bg-emerald-50 border-emerald-200",
    chip: "bg-emerald-100",
    icon: "text-emerald-600",
    title: "text-emerald-900",
    sub: "text-emerald-700",
  },
  [FRESHNESS.RECENT]: {
    wrap: "bg-amber-50 border-amber-200",
    chip: "bg-amber-100",
    icon: "text-amber-600",
    title: "text-amber-900",
    sub: "text-amber-700",
  },
  [FRESHNESS.STALE]: {
    wrap: "bg-slate-50 border-slate-200",
    chip: "bg-slate-100",
    icon: "text-slate-500",
    title: "text-slate-800",
    sub: "text-slate-600",
  },
};

/**
 * Customer-facing provider tracking map.
 *
 * `locationUpdatedAt` is the server-stamped time of the last accepted fix.
 * When it is missing or old the component still shows the last known point,
 * but explicitly labelled as such — it never animates or implies movement it
 * cannot substantiate (Phase 3 §27).
 */
export default function TrackingMap({
  address,
  jobLat,
  jobLng,
  contractorLat,
  contractorLng,
  contractorName,
  locationUpdatedAt,
  statusLabel = "is on the way",
}) {
  const [customerCoords, setCustomerCoords] = useState(null);
  const [loading, setLoading] = useState(true);
  // Drives the "x min ago" / freshness badge downgrade while the page sits
  // open with no new fix arriving — without it a position frozen at 21:04
  // would keep claiming "Live" indefinitely.
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    let cancelled = false;

    // Prefer the coordinates stamped on the booking when it was created (see
    // PostJob.jsx / BookContractor.jsx). This component used to ignore them
    // and always re-geocode, which was wrong twice over:
    //
    //   1. It geocoded `booking.address` — the STREET LINE ONLY, with no
    //      city, state or zip. "482 Willow Creek Dr" matches streets all over
    //      the country, so Nominatim happily returned one in the wrong state
    //      and the customer was told their provider was 171 miles away
    //      instead of 1.1. Caught by rendering the real screen, not by
    //      reading the code.
    //   2. It spent a third-party geocoding request on an address that was
    //      already resolved at creation time.
    if (Number.isFinite(jobLat) && Number.isFinite(jobLng)) {
      setCustomerCoords({ lat: jobLat, lng: jobLng });
      setLoading(false);
      return undefined;
    }

    // Legacy bookings with no cached coordinates: geocode, but with the full
    // address so the match is actually unambiguous.
    if (!address) {
      setLoading(false);
      return undefined;
    }
    setLoading(true);
    geocodeAddress(address).then((coords) => {
      if (cancelled) return;
      setCustomerCoords(coords);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [address, jobLat, jobLng]);

  const freshness = classifyLocationFreshness(locationUpdatedAt, now);
  const hasPoint = Number.isFinite(contractorLat) && Number.isFinite(contractorLng);
  const live = isPresentableAsLive(freshness);

  if (loading) {
    return (
      <div className="w-full h-64 rounded-2xl bg-muted flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // No position at all yet, or we can't place the job address — say so
  // plainly rather than rendering an empty or guessed map (§16).
  if (!hasPoint || !customerCoords) {
    return (
      <div className="w-full h-64 rounded-2xl bg-muted flex flex-col items-center justify-center gap-2 px-6 text-center">
        <WifiOff className="w-6 h-6 text-muted-foreground" />
        <p className="text-sm font-semibold text-foreground">
          {hasPoint ? "Map unavailable" : "Location not shared yet"}
        </p>
        <p className="text-xs text-muted-foreground">
          {hasPoint
            ? "We couldn't place this job's address on the map."
            : `${contractorName || "Your provider"} hasn't started sharing their location yet.`}
        </p>
      </div>
    );
  }

  const distance = haversineMiles(
    contractorLat,
    contractorLng,
    customerCoords.lat,
    customerCoords.lng,
  );
  const age = relativeAge(locationUpdatedAt, now);
  const tone = FRESHNESS_BANNER[freshness] ?? FRESHNESS_BANNER[FRESHNESS.STALE];

  /** @type {[number, number]} */
  const center = [
    (customerCoords.lat + contractorLat) / 2,
    (customerCoords.lng + contractorLng) / 2,
  ];

  return (
    <div className="space-y-3">
      <div className={`border rounded-xl p-3 flex items-center gap-3 ${tone.wrap}`}>
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${tone.chip}`}>
          {live ? (
            <MapPin className={`w-5 h-5 ${tone.icon}`} />
          ) : (
            <AlertTriangle className={`w-5 h-5 ${tone.icon}`} />
          )}
        </div>
        <div className="min-w-0">
          <p className={`font-semibold text-sm ${tone.title}`}>
            {distance.toFixed(1)} miles away
            {!live && " (last known)"}
          </p>
          <p className={`text-xs ${tone.sub}`}>
            {live
              ? `${contractorName || "Your provider"} ${statusLabel}`
              : `${FRESHNESS_LABELS[freshness]}${age ? ` · updated ${age}` : ""}`}
          </p>
        </div>
        {live && (
          <span className="ml-auto shrink-0 flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            Live
          </span>
        )}
      </div>
      <div className="w-full h-64 rounded-2xl overflow-hidden border border-border">
        <MapContainer
          center={center}
          zoom={13}
          style={{ height: "100%", width: "100%" }}
          scrollWheelZoom={true}
          dragging={true}
          touchZoom={true}
          doubleClickZoom={true}
          boxZoom={false}
          keyboard={false}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <Marker position={[contractorLat, contractorLng]} icon={contractorIcon(live)}>
            <Popup>
              <strong>{contractorName}</strong>
              <p className="text-xs">
                {live ? "Live position" : `Last known position${age ? ` · ${age}` : ""}`}
              </p>
            </Popup>
          </Marker>
          <Marker position={[customerCoords.lat, customerCoords.lng]} icon={customerIcon}>
            <Popup>
              <strong>Your Location</strong>
              <p className="text-xs">{address}</p>
            </Popup>
          </Marker>
          {/* Straight line between the two points — explicitly not a driving
              route. Dashed and semi-transparent so it doesn't read as one. */}
          <Polyline
            positions={[
              [contractorLat, contractorLng],
              [customerCoords.lat, customerCoords.lng],
            ]}
            pathOptions={{
              color: live ? "#3b82f6" : "#94a3b8",
              weight: 3,
              opacity: 0.6,
              dashArray: "8",
            }}
          />
        </MapContainer>
      </div>
    </div>
  );
}
