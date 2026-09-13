// Booking form route — the form page will live here.
export const BOOKING_PATH = "/book";

// ⚠️ EDIT ME — replace with the real FOAM contact email.
export const CONTACT_EMAIL = "hello@foamlaundry.com";

/** Comma-separated admin emails allowed into /admin */
export const ADMIN_EMAILS = (
  process.env.NEXT_PUBLIC_ADMIN_EMAILS ?? "paylocksmith@gmail.com"
)
  .split(",")
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);

export function isAdminEmail(email: string | null | undefined) {
  if (!email) return false;
  return ADMIN_EMAILS.includes(email.trim().toLowerCase());
}

// ⚠️ EDIT ME — replace with the real FOAM business WhatsApp number
// (country code + number, no "+", no spaces — e.g. "17025550000").
// Used for questions / support, not for scheduling pickups.
export const BUSINESS_WHATSAPP = "17025550000";

export function whatsappLink(message: string) {
  return `https://wa.me/${BUSINESS_WHATSAPP}?text=${encodeURIComponent(message)}`;
}
