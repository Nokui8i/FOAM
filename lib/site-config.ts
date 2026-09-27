// Single booking form for the whole site — header, footer, CTAs, etc.
export const BOOKING_PATH = "/book";

/** Private ops console path (not linked from public marketing pages). */
export const OPS_PATH =
  process.env.NEXT_PUBLIC_OPS_PATH?.trim() || "/ops";

/** Driver console — pickups & deliveries only. */
export const DRIVER_PATH =
  process.env.NEXT_PUBLIC_DRIVER_PATH?.trim() || "/driver";

// ⚠️ EDIT ME — replace with the real FOAM contact email.
export const CONTACT_EMAIL = "hello@foamlaundry.com";

/** Company owner emails — permanent OPS access; cannot be demoted/fired from Staff. */
export const ADMIN_EMAILS = (
  process.env.NEXT_PUBLIC_ADMIN_EMAILS ??
  "paylocksmith@gmail.com,iaaoamar12@gmail.com,liran4004@gmail.com"
)
  .split(",")
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);

/** Comma-separated driver emails allowed into /driver (Orders only). */
export const DRIVER_EMAILS = (
  process.env.NEXT_PUBLIC_DRIVER_EMAILS ?? ""
)
  .split(",")
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);

export function isAdminEmail(email: string | null | undefined) {
  if (!email) return false;
  return ADMIN_EMAILS.includes(email.trim().toLowerCase());
}

export function isDriverEmail(email: string | null | undefined) {
  if (!email) return false;
  return DRIVER_EMAILS.includes(email.trim().toLowerCase());
}

/** Admin or driver — can access operational order data. */
export function isStaffEmail(email: string | null | undefined) {
  return isAdminEmail(email) || isDriverEmail(email);
}

// ⚠️ EDIT ME — replace with the real FOAM business WhatsApp number
// (country code + number, no "+", no spaces — e.g. "17025550000").
// Used for questions / support, not for scheduling pickups.
export const BUSINESS_WHATSAPP = "17025550000";

export function whatsappLink(message: string) {
  const text = encodeURIComponent(message);
  return `https://wa.me/${BUSINESS_WHATSAPP}?text=${text}`;
}
