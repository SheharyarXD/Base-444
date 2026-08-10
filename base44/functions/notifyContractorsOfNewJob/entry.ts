import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Great-circle distance in miles — mirrors haversineMiles in src/lib/geo.js
// (not imported — see acceptJob/entry.ts's header comment on why Deno
// functions in this repo duplicate small src/lib helpers instead).
function haversineMiles(lat1, lng1, lat2, lng2) {
  const R = 3958.8;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function geocodeZip(zip) {
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&postalcode=${encodeURIComponent(zip)}&country=us&limit=1`);
    const data = await res.json();
    if (data[0]) {
      const lat = parseFloat(data[0].lat);
      const lng = parseFloat(data[0].lon);
      if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
    }
  } catch (e) {
    console.error('Zip geocode failed:', e.message);
  }
  return null;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { event } = await req.json();

    if (event.type !== 'create') {
      return Response.json({ message: 'Not a create event' });
    }

    const booking = event.data;
    const jobZip = booking.zip;

    if (!jobZip) {
      console.log('No zip code in booking');
      return Response.json({ message: 'No zip code' });
    }

    if (!booking.category) {
      console.log('No category on booking — skipping notification');
      return Response.json({ message: 'No category on booking' });
    }

    // Previously required an EXACT preferred_zip_code match, which silently
    // under-notified any contractor whose preferred zip was nearby but not
    // identical (e.g. one block over, in the next zip code) — even though
    // they set a preferred_miles_distance radius specifically to be reached
    // for cases like that. Category-scoped here; zip/radius eligibility is
    // resolved below now that we have the full candidate set.
    const candidates = await base44.asServiceRole.entities.Contractor.filter({
      category: booking.category,
    }, '-created_date', 200);

    const withZipPreference = candidates.filter((c) => c.preferred_zip_code);

    let contractors = withZipPreference.filter((c) => c.preferred_zip_code === jobZip);

    // For near-misses (not an exact zip match) with a radius set, geocode
    // and check actual distance — bounded to just this smaller set so a
    // typical run makes only a handful of geocode calls, not one per
    // candidate. Falls back to exact-match-only (today's behavior) if the
    // job has no geocoded coordinates on file.
    if (Number.isFinite(booking.job_lat) && Number.isFinite(booking.job_lng)) {
      const nearMisses = withZipPreference.filter(
        (c) => c.preferred_zip_code !== jobZip && Number.isFinite(c.preferred_miles_distance)
      );
      for (const contractor of nearMisses) {
        const coords = await geocodeZip(contractor.preferred_zip_code);
        if (!coords) continue;
        const distance = haversineMiles(coords.lat, coords.lng, booking.job_lat, booking.job_lng);
        if (distance <= contractor.preferred_miles_distance) {
          contractors.push(contractor);
        }
      }
    }

    if (contractors.length === 0) {
      console.log(`No ${booking.category} contractors found for zip ${jobZip}`);
      return Response.json({ message: 'No matching contractors for this zip/category' });
    }

    // Get user details for each contractor to send email
    const notificationPromises = contractors.map(async (contractor) => {
      try {
        const contractorUser = await base44.asServiceRole.entities.User.filter(
          { email: contractor.created_by },
          '-created_date',
          1
        );

        if (contractorUser.length === 0) return null;

        const user = contractorUser[0];

        // Send email notification
        await base44.asServiceRole.integrations.Core.SendEmail({
          to: user.email,
          subject: `New Job Posted in ${booking.city}, ${booking.state}`,
          body: `A new job has been posted in your preferred area (${jobZip})!\n\nJob: ${booking.job_title}\nCategory: ${booking.category}\nAddress: ${booking.address}, ${booking.city}, ${booking.state}\nDate: ${booking.preferred_date}\nTime: ${booking.preferred_time}\n\nLog in to Linked to view and accept this job.`
        });

        console.log(`Notification sent to ${user.email}`);
        return user.email;
      } catch (error) {
        console.error(`Error notifying contractor: ${error.message}`);
        return null;
      }
    });

    await Promise.all(notificationPromises);

    return Response.json({ 
      message: 'Notifications sent',
      contractorsNotified: contractors.length
    });
  } catch (error) {
    console.error(`Error in notifyContractorsOfNewJob: ${error.message}`);
    return Response.json({ error: error.message }, { status: 500 });
  }
});