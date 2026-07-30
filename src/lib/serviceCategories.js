// Single source of truth for service categories across the app.
// Keep in sync with the `category` enum declared in:
//   base44/entities/Contractor.jsonc
//   base44/entities/Booking.jsonc
// (Base44's .jsonc schema files are static and can't import this module,
// so those two enums are the one unavoidable duplication of this list.)
export const SERVICE_CATEGORIES = [
  "Plumbing",
  "Electrical",
  "Cleaning",
  "Painting",
  "Landscaping",
  "HVAC",
  "Carpentry",
  "Roofing",
  "General Handyman",
  "Moving",
  "Mobile Mechanic",
  "Mobile Detailer",
  "Lawn Care",
  "Other",
  "Contractors",
  "Pressure Washing Services",
];
