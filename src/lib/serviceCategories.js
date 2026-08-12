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
  // Client's second expanded-marketplace request, added additively — see
  // CATEGORY_DESCRIPTIONS below for the two that ship with clarifying help
  // text.
  "Fencing Services",
  "Heavy Wheel Mechanic",
  "Garage Door Specialists",
  "Tree Services",
  "Appliance Repair",
  "Small Engine Repair",
  "Towing Service",
  "Concrete Services",
];

// Optional, per-category clarifying help text — shown under a category's
// label in the picker UI (ContractorSetup.jsx, PostJob.jsx) when present.
// Deliberately a separate, sparse lookup rather than restructuring
// SERVICE_CATEGORIES into objects: every consumer of that array (entity
// enums, the picker buttons themselves) treats entries as plain strings
// where the label *is* the stored value, and changing that shape would
// touch far more than the two categories that actually need explanatory
// text. Not every category needs an entry here.
export const CATEGORY_DESCRIPTIONS = {
  "Heavy Wheel Mechanic": "18-wheelers, semi trucks, heavy-duty service trucks and other large commercial vehicles.",
  "Small Engine Repair": "Lawn mowers and other small-engine equipment.",
};
