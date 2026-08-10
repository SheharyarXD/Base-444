import { useState, useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Loader2, MapPin } from "lucide-react";
import { haversineMiles, geocodeAddress } from "@/lib/geo";

// _getIconUrl is a real internal property Leaflet's bundler-icon-path
// workaround needs, just not part of its public (and thus typed) API surface.
// @ts-ignore
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

const contractorIcon = new L.DivIcon({
  html: `<div style="background:#10b981;color:#fff;border-radius:50%;width:40px;height:40px;display:flex;align-items:center;justify-content:center;font-size:20px;border:3px solid #fff;box-shadow:0 2px 8px rgba(16,185,129,0.6)">🚗</div>`,
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

export default function TrackingMap({ address, contractorLat, contractorLng, contractorName }) {
  const [customerCoords, setCustomerCoords] = useState(null);
  const [loading, setLoading] = useState(true);
  const [distance, setDistance] = useState(null);

  useEffect(() => {
    async function runGeocode() {
      const coords = await geocodeAddress(address);
      if (coords) {
        setCustomerCoords(coords);
        if (contractorLat && contractorLng) {
          const dist = haversineMiles(contractorLat, contractorLng, coords.lat, coords.lng);
          setDistance(dist);
        }
      }
      setLoading(false);
    }

    if (address) runGeocode();
  }, [address, contractorLat, contractorLng]);

  if (loading) {
    return (
      <div className="w-full h-64 rounded-2xl bg-muted flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!customerCoords || !contractorLat || !contractorLng) {
    return (
      <div className="w-full h-64 rounded-2xl bg-muted flex flex-col items-center justify-center gap-2">
        <MapPin className="w-6 h-6 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Map unavailable</p>
      </div>
    );
  }

  /** @type {[number, number]} */
  const center = [
    (customerCoords.lat + contractorLat) / 2,
    (customerCoords.lng + contractorLng) / 2,
  ];

  return (
    <div className="space-y-3">
      {distance && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center">
            <MapPin className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <p className="font-semibold text-sm text-emerald-900">{distance.toFixed(1)} miles away</p>
            <p className="text-xs text-emerald-700">{contractorName} is on the way</p>
          </div>
        </div>
      )}
      <div className="w-full h-64 rounded-2xl overflow-hidden border border-border">
        <MapContainer center={center} zoom={13} style={{ height: "100%", width: "100%" }} scrollWheelZoom={true} dragging={true} touchZoom={true} doubleClickZoom={true} boxZoom={false} keyboard={false}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <Marker position={[contractorLat, contractorLng]} icon={contractorIcon}>
            <Popup>
              <strong>{contractorName}</strong>
              <p className="text-xs">On the way</p>
            </Popup>
          </Marker>
          <Marker position={[customerCoords.lat, customerCoords.lng]} icon={customerIcon}>
            <Popup>
              <strong>Your Location</strong>
              <p className="text-xs">{address}</p>
            </Popup>
          </Marker>
          <Polyline
            positions={[[contractorLat, contractorLng], [customerCoords.lat, customerCoords.lng]]}
            pathOptions={{ color: "#3b82f6", weight: 3, opacity: 0.6, dashArray: "8" }}
          />
        </MapContainer>
      </div>
    </div>
  );
}