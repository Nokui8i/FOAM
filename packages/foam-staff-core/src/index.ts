/**
 * Pure staff domain types and access rules shared by FOAM staff clients.
 * No React, Expo, Firebase SDK, or DOM APIs.
 */

export type StaffRole = "admin" | "manager" | "driver";
export type StaffStatus = "pending" | "approved" | "denied" | "revoked";
export type StaffPortal = "ops" | "driver";

export type StaffProfile = {
  uid: string;
  email: string;
  displayName: string;
  role: StaffRole;
  status: StaffStatus;
  requestedPortal: StaffPortal;
  createdAt?: unknown;
  updatedAt?: unknown;
  reviewedAt?: unknown;
  reviewedBy?: string | null;
};

export class StaffBannedError extends Error {
  email: string;
  constructor(email: string) {
    super("This email is banned from OPS and Driver access.");
    this.name = "StaffBannedError";
    this.email = email;
  }
}

export function isStaffBannedError(error: unknown): error is StaffBannedError {
  if (!error || typeof error !== "object") return false;
  if (error instanceof StaffBannedError) return true;
  return "name" in error && (error as { name: string }).name === "StaffBannedError";
}

/** Default company-owner allowlist (matches existing FOAM site-config / rules). */
export const DEFAULT_ADMIN_EMAILS = [
  "paylocksmith@gmail.com",
  "iaaoamar12@gmail.com",
  "liran4004@gmail.com",
] as const;

export function parseAdminEmails(raw?: string | null): string[] {
  const source =
    raw?.trim() ||
    DEFAULT_ADMIN_EMAILS.join(",");
  return source
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(
  email: string | null | undefined,
  adminEmails: readonly string[] = DEFAULT_ADMIN_EMAILS
) {
  if (!email) return false;
  return adminEmails.includes(email.trim().toLowerCase());
}

export function isCompanyOwner(
  email?: string | null,
  adminEmails: readonly string[] = DEFAULT_ADMIN_EMAILS
) {
  return isAdminEmail(email, adminEmails);
}

export function staffBanDocId(email: string) {
  return email.trim().toLowerCase();
}

export function normalizeStaffRole(raw: unknown): StaffRole {
  const value = String(raw ?? "").toLowerCase();
  if (value === "manager") return "manager";
  if (value === "driver") return "driver";
  return "admin";
}

export function normalizeStaffStatus(raw: unknown): StaffStatus {
  const value = String(raw ?? "").toLowerCase();
  if (value === "approved") return "approved";
  if (value === "denied") return "denied";
  if (value === "revoked") return "revoked";
  return "pending";
}

export function normalizeStaffPortal(raw: unknown): StaffPortal {
  return String(raw ?? "").toLowerCase() === "ops" ? "ops" : "driver";
}

export function mapStaffProfile(
  uid: string,
  data: Record<string, unknown>
): StaffProfile {
  return {
    uid,
    email: String(data.email ?? "").trim().toLowerCase(),
    displayName: String(data.displayName ?? "").trim(),
    role: normalizeStaffRole(data.role),
    status: normalizeStaffStatus(data.status),
    requestedPortal: normalizeStaffPortal(data.requestedPortal),
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
    reviewedAt: data.reviewedAt,
    reviewedBy:
      typeof data.reviewedBy === "string" ? data.reviewedBy : null,
  };
}

export function defaultRoleForPortal(portal: StaffPortal): StaffRole {
  return portal === "ops" ? "manager" : "driver";
}

/** Gate for OPS/Driver sessions — owners always pass. */
export function staffAccessGateKind(
  profile: StaffProfile | null | undefined,
  email?: string | null,
  adminEmails: readonly string[] = DEFAULT_ADMIN_EMAILS
): "ok" | "pending" | "denied" {
  if (isAdminEmail(email, adminEmails)) return "ok";
  if (!profile) return "ok";
  if (profile.status === "pending") return "pending";
  if (profile.status === "denied" || profile.status === "revoked") {
    return "denied";
  }
  return "ok";
}

export function canAccessOps(
  profile: StaffProfile | null,
  email?: string | null,
  adminEmails: readonly string[] = DEFAULT_ADMIN_EMAILS
) {
  if (isCompanyOwner(email, adminEmails)) return true;
  if (!profile || profile.status !== "approved") return false;
  return profile.role === "admin" || profile.role === "manager";
}

export function canAccessDriverPortal(
  profile: StaffProfile | null,
  email?: string | null,
  adminEmails: readonly string[] = DEFAULT_ADMIN_EMAILS
) {
  if (isCompanyOwner(email, adminEmails)) return true;
  if (!profile || profile.status !== "approved") return false;
  return (
    profile.role === "driver" ||
    profile.role === "admin" ||
    profile.role === "manager"
  );
}

export function staffPendingLoginMessage(portal: StaffPortal) {
  return portal === "ops"
    ? "Request sent. Wait on this login page until an admin approves you on Staff, then sign in again."
    : "Request sent. Wait on this login page until an admin approves you, then sign in again.";
}

export function staffApprovedLoginMessage(portal: StaffPortal) {
  return portal === "ops"
    ? "You're approved. Sign in to open OPS."
    : "You're approved. Sign in to open Driver.";
}

export function staffDeniedLoginMessage(portal: StaffPortal) {
  return portal === "ops"
    ? "This account was not approved for OPS. Contact a FOAM admin if you think this is a mistake."
    : "This account was not approved for driver access. Contact FOAM ops if you think this is a mistake.";
}

export function staffBannedLoginMessage() {
  return "This email is banned from Driver and OPS access.";
}

/** Staff/{uid} deleted while signed in (Employees remove / fire / deny). */
export function staffRemovedLoginMessage(portal: StaffPortal) {
  return portal === "ops"
    ? "Your OPS access was removed. Contact a FOAM admin if you think this is a mistake."
    : "Your Driver access was removed. Contact FOAM ops if you think this is a mistake.";
}

/** Approved driver opened OPS — match web “Driver access only” copy. */
export function staffOpsDriverOnlyMessage() {
  return "This account is approved as a driver. Use the FOAM Driver app instead of OPS.";
}
