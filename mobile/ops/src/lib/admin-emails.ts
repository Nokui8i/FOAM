import {
  DEFAULT_ADMIN_EMAILS,
  parseAdminEmails,
} from "@foam/staff-core";

/** Owner allowlist — UX only; real authorization stays in Firestore rules. */
export function getAdminEmails(): string[] {
  return parseAdminEmails(process.env.EXPO_PUBLIC_ADMIN_EMAILS) || [
    ...DEFAULT_ADMIN_EMAILS,
  ];
}
