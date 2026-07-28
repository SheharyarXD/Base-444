// Governs what job/customer detail a viewer is shown before a job has been
// accepted. A browsing provider needs enough to decide whether to accept a
// job (category, description, general area, schedule, cost, photos) but not
// the customer's phone/email or exact street address — those are only
// needed, and only shown, once someone is actually bound to the job (the
// customer who posted it, or the provider who accepted it).

/**
 * True once the viewer is entitled to full contact info + exact address:
 * the customer who created the booking, or the provider who accepted it.
 * Anyone else (a provider still deciding whether to accept) gets the
 * masked view regardless of booking.status.
 */
export function canViewFullJobDetails(booking, viewerEmail) {
  if (!booking || !viewerEmail) return false;
  if (booking.customer_email === viewerEmail) return true;
  if (booking.accepted_by_email && booking.accepted_by_email === viewerEmail) return true;
  return false;
}

/**
 * City/state/zip only — enough to judge distance/area without revealing
 * the exact street address.
 */
export function maskedCityStateZip(booking) {
  if (!booking) return "";
  const stateZip = [booking.state, booking.zip].filter(Boolean).join(" ");
  return [booking.city, stateZip].filter(Boolean).join(", ");
}
