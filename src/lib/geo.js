// Shared geo helpers. Extracted from what used to be three separate
// hand-rolled copies of the same haversine formula (JobsMap, BookingDetail,
// TrackingMap) and three separate Nominatim geocode calls (AddressMap,
// TrackingMap, JobsMap).

/**
 * Great-circle distance between two lat/lng points, in miles.
 */
export function haversineMiles(lat1, lng1, lat2, lng2) {
  const R = 3958.8;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Great-circle distance between two lat/lng points, in feet.
 */
export function haversineFeet(lat1, lng1, lat2, lng2) {
  return haversineMiles(lat1, lng1, lat2, lng2) * 5280;
}

/**
 * Geocode a free-text address via Nominatim (OpenStreetMap).
 * Returns { lat, lng } or null if no match / on error.
 * Keyless, rate-limited public API — callers should avoid firing this in a
 * tight loop (see JobsMap.jsx's per-item delay when it must geocode more
 * than one legacy record without cached coordinates).
 */
export async function geocodeAddress(address) {
  if (!address) return null;
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`,
      { headers: { "Accept-Language": "en" } }
    );
    const data = await res.json();
    if (data[0]) {
      const lat = parseFloat(data[0].lat);
      const lng = parseFloat(data[0].lon);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        return { lat, lng };
      }
    }
  } catch (e) {
    console.error("Geocoding failed:", e);
  }
  return null;
}
