import { useState, useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import { MapPin } from "lucide-react";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { geocodeAddress } from "@/lib/geo";

// Fix default marker icon for leaflet — _getIconUrl is a real internal
// property Leaflet's bundler-icon-path workaround needs, just not part of
// its public (and thus typed) API surface.
// @ts-ignore
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

/**
 * Static map for a job's address.
 *
 * `lat`/`lng` are the coordinates stamped on the booking when it was created
 * (PostJob.jsx / BookContractor.jsx both do this). Prefer them: geocoding the
 * address string again is both a wasted third-party request and actively
 * wrong when callers pass only the street line — "482 Willow Creek Dr" with
 * no city or state matches streets nationwide, so the pin could land in the
 * wrong state entirely. Geocoding is now only the fallback for older
 * bookings saved before coordinates were recorded.
 */
export default function AddressMap({ address, lat, lng }) {
  const [coords, setCoords] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      setCoords({ lat, lng });
      setError(false);
      setLoading(false);
      return;
    }
    if (!address) return;
    let cancelled = false;
    async function geocode() {
      const result = await geocodeAddress(address);
      if (cancelled) return;
      if (result) {
        setCoords(result);
      } else {
        setError(true);
      }
      setLoading(false);
    }
    geocode();
    return () => { cancelled = true; };
  }, [address, lat, lng]);

  if (loading) {
    return (
      <div className="h-48 rounded-2xl bg-muted animate-pulse flex items-center justify-center">
        <MapPin className="w-6 h-6 text-muted-foreground/30" />
      </div>
    );
  }

  if (error || !coords) {
    return (
      <div className="h-48 rounded-2xl bg-muted flex flex-col items-center justify-center gap-2">
        <MapPin className="w-6 h-6 text-muted-foreground/30" />
        <p className="text-xs text-muted-foreground">Couldn't load map for this address</p>
      </div>
    );
  }

  return (
    <div className="h-48 rounded-2xl overflow-hidden border border-border">
      <MapContainer center={[coords.lat, coords.lng]} zoom={15} style={{ height: "100%", width: "100%" }} zoomControl={false} scrollWheelZoom={false}>
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        />
        <Marker position={[coords.lat, coords.lng]}>
          <Popup>{address}</Popup>
        </Marker>
      </MapContainer>
    </div>
  );
}