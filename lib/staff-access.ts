import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocFromServer,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import type { User } from "firebase/auth";

import { getFirebaseDb, ensureStaffBackendBound } from "@/lib/firebase";
import { ADMIN_EMAILS, isAdminEmail } from "@/lib/site-config";

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

export type StaffBan = {
  email: string;
  bannedAt?: unknown;
  bannedBy: string;
  reason: string;
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

export function staffRoleLabel(role: StaffRole) {
  switch (role) {
    case "manager":
      return "Manager";
    case "driver":
      return "Driver";
    default:
      return "Admin";
  }
}

/** One-shot notice after intentional sign-in (approved / denied). Not for pending. */
export const STAFF_LOGIN_NOTICE_KEY = "foam-staff-login-notice";

export function setStaffLoginNotice(message: string) {
  try {
    sessionStorage.setItem(STAFF_LOGIN_NOTICE_KEY, message);
  } catch {
    /* private mode / blocked storage */
  }
}

export function takeStaffLoginNotice(): string {
  try {
    const value = sessionStorage.getItem(STAFF_LOGIN_NOTICE_KEY) ?? "";
    if (value) sessionStorage.removeItem(STAFF_LOGIN_NOTICE_KEY);
    return value;
  } catch {
    return "";
  }
}

export function clearStaffLoginNotice() {
  try {
    sessionStorage.removeItem(STAFF_LOGIN_NOTICE_KEY);
  } catch {
    /* private mode / blocked storage */
  }
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

/** Gate for OPS/Driver sessions — owners always pass. */
export function staffAccessGateKind(
  profile: StaffProfile | null | undefined,
  email?: string | null
): "ok" | "pending" | "denied" {
  if (isAdminEmail(email)) return "ok";
  if (!profile) return "ok";
  if (profile.status === "pending") return "pending";
  if (profile.status === "denied" || profile.status === "revoked") {
    return "denied";
  }
  return "ok";
}

export async function fetchStaffProfileFromServer(
  uid: string
): Promise<StaffProfile | null> {
  if (!uid || uid.startsWith("bootstrap:")) return null;
  try {
    const snap = await getDocFromServer(doc(getFirebaseDb(), "staff", uid));
    if (!snap.exists()) return null;
    return mapStaffProfile(uid, snap.data() as Record<string, unknown>);
  } catch {
    return null;
  }
}

function defaultRoleForPortal(portal: StaffPortal): StaffRole {
  // OPS applicants start as manager candidates; drivers as driver.
  // Admins promote to admin explicitly from Staff.
  return portal === "ops" ? "manager" : "driver";
}

export async function isStaffEmailBanned(email: string): Promise<boolean> {
  const id = staffBanDocId(email);
  if (!id) return false;
  try {
    const snap = await getDoc(doc(getFirebaseDb(), "staffBanned", id));
    return snap.exists();
  } catch {
    // Permission/network blip — do not block a legitimate sign-in.
    return false;
  }
}

export function subscribeStaffBans(onChange: (rows: StaffBan[]) => void) {
  let lastRows: StaffBan[] = [];
  return onSnapshot(
    collection(getFirebaseDb(), "staffBanned"),
    (snap) => {
      const rows = snap.docs.map((d) => {
        const data = d.data() as Record<string, unknown>;
        return {
          email: String(data.email ?? d.id).trim().toLowerCase(),
          bannedAt: data.bannedAt,
          bannedBy: String(data.bannedBy ?? ""),
          reason: String(data.reason ?? ""),
        } satisfies StaffBan;
      });
      rows.sort((a, b) => a.email.localeCompare(b.email));
      lastRows = rows;
      onChange(rows);
    },
    () => onChange(lastRows)
  );
}

export async function banStaffEmail(
  email: string,
  bannedBy: string,
  reason = "Spam / blocked by ops"
) {
  const id = staffBanDocId(email);
  if (!id) throw new Error("Email required");
  if (isAdminEmail(id)) {
    throw new Error("Cannot ban a company owner account.");
  }
  await setDoc(doc(getFirebaseDb(), "staffBanned", id), {
    email: id,
    bannedBy: bannedBy || "admin",
    reason,
    bannedAt: serverTimestamp(),
  });
}

export async function unbanStaffEmail(email: string) {
  const id = staffBanDocId(email);
  if (!id) return;
  await deleteDoc(doc(getFirebaseDb(), "staffBanned", id));
}

const staffEnsureInflight = new Map<string, Promise<StaffProfile | null>>();

/**
 * Load or create the signed-in user's staff/{uid} row.
 *
 * - createIfMissing: false — return null when no staff doc (read-only check).
 * - createIfMissing: true — write a Pending row so re-login after Remove works
 *   on the first try (Auth user may already exist; Firestore row was deleted).
 */
export async function ensureStaffProfile(
  user: User,
  portal: StaffPortal,
  options?: { createIfMissing?: boolean; refreshPending?: boolean }
): Promise<StaffProfile | null> {
  const createIfMissing = options?.createIfMissing === true;
  const refreshPending = options?.refreshPending === true;
  const key = `${user.uid}:${createIfMissing ? "write" : "read"}:${refreshPending ? "touch" : "plain"}`;
  const existing = staffEnsureInflight.get(key);
  if (existing) return existing;

  const run = ensureStaffProfileOnce(
    user,
    portal,
    createIfMissing,
    refreshPending
  ).finally(() => {
    staffEnsureInflight.delete(key);
  });
  staffEnsureInflight.set(key, run);
  return run;
}

async function ensureStaffProfileOnce(
  user: User,
  portal: StaffPortal,
  createIfMissing: boolean,
  refreshPending: boolean
): Promise<StaffProfile | null> {
  // Never write applicant rows through the public-site Firebase app.
  ensureStaffBackendBound();
  const db = getFirebaseDb();
  const ref = doc(db, "staff", user.uid);
  const email = (user.email ?? "").trim().toLowerCase();
  const displayName = (
    (user.displayName ?? "").trim() ||
    email.split("@")[0] ||
    "Staff"
  ).slice(0, 120);
  const bootstrapAdmin = isAdminEmail(email);

  if (!email || email.length < 4) {
    throw new Error("Signed-in account has no usable email for staff access.");
  }

  if (!bootstrapAdmin && (await isStaffEmailBanned(email))) {
    throw new StaffBannedError(email);
  }

  let snap;
  try {
    snap = await getDocFromServer(ref);
  } catch {
    snap = await getDoc(ref);
  }

  let shouldRecreate = !snap.exists();

  if (snap.exists()) {
    const existing = mapStaffProfile(
      user.uid,
      snap.data() as Record<string, unknown>
    );

    if (
      !bootstrapAdmin &&
      (existing.status === "denied" || existing.status === "revoked")
    ) {
      try {
        await deleteDoc(ref);
        shouldRecreate = true;
      } catch {
        shouldRecreate = true;
      }
    } else if (bootstrapAdmin && existing.status !== "approved") {
      await updateDoc(ref, {
        email,
        displayName,
        status: "approved",
        role: "admin",
        reviewedAt: serverTimestamp(),
        reviewedBy: "bootstrap",
        updatedAt: serverTimestamp(),
      });
      return {
        ...existing,
        email,
        displayName,
        status: "approved",
        role: "admin",
        reviewedBy: "bootstrap",
      };
    } else {
      const softUpdate: Record<string, unknown> = {};
      if (existing.email !== email) softUpdate.email = email;
      if (existing.displayName !== displayName) {
        softUpdate.displayName = displayName;
      }
      if (
        refreshPending &&
        existing.status === "pending" &&
        !bootstrapAdmin
      ) {
        softUpdate.requestedPortal = portal;
        softUpdate.updatedAt = serverTimestamp();
      } else if (Object.keys(softUpdate).length > 0) {
        softUpdate.updatedAt = serverTimestamp();
      }
      if (Object.keys(softUpdate).length > 0) {
        try {
          await updateDoc(ref, softUpdate);
        } catch {
          // Profile still usable even if the soft refresh is denied.
        }
      }
      return {
        ...existing,
        email,
        displayName,
        requestedPortal:
          refreshPending && existing.status === "pending"
            ? portal
            : existing.requestedPortal,
      };
    }
  }

  if (!shouldRecreate) {
    return null;
  }

  if (!createIfMissing && !bootstrapAdmin) {
    return null;
  }

  const status: StaffStatus = bootstrapAdmin ? "approved" : "pending";
  const role: StaffRole = bootstrapAdmin
    ? "admin"
    : defaultRoleForPortal(portal);
  const payload: Record<string, unknown> = {
    uid: user.uid,
    email,
    displayName,
    role,
    status,
    requestedPortal: portal,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  if (bootstrapAdmin) {
    payload.reviewedAt = serverTimestamp();
    payload.reviewedBy = "bootstrap";
  }

  try {
    await setDoc(ref, payload);
  } catch (error) {
    let again;
    try {
      again = await getDocFromServer(ref);
    } catch {
      again = await getDoc(ref);
    }
    if (again.exists()) {
      return mapStaffProfile(user.uid, again.data() as Record<string, unknown>);
    }
    const code =
      error && typeof error === "object" && "code" in error
        ? String((error as { code: string }).code)
        : "";
    throw new Error(
      code
        ? `Could not create staff request (${code}).`
        : "Could not create staff request."
    );
  }

  // Confirm the row reached the server — local cache alone is not enough.
  try {
    const confirmed = await getDocFromServer(ref);
    if (!confirmed.exists()) {
      throw new Error("Staff request did not save. Try again.");
    }
    return mapStaffProfile(
      user.uid,
      confirmed.data() as Record<string, unknown>
    );
  } catch (error) {
    if (error instanceof Error && error.message.includes("did not save")) {
      throw error;
    }
  }

  return {
    uid: user.uid,
    email,
    displayName,
    role,
    status,
    requestedPortal: portal,
    reviewedBy: bootstrapAdmin ? "bootstrap" : null,
  };
}

export function subscribeStaffProfile(
  uid: string,
  onChange: (profile: StaffProfile | null) => void
) {
  return onSnapshot(
    doc(getFirebaseDb(), "staff", uid),
    (snap) => {
      if (!snap.exists()) {
        onChange(null);
        return;
      }
      onChange(mapStaffProfile(uid, snap.data() as Record<string, unknown>));
    },
    () => {
      // Keep last known profile on transient listener errors; do not wipe to null.
    }
  );
}

/** Live ban status for the signed-in email (Staff → Banned). */
export function subscribeStaffBan(
  email: string,
  onChange: (banned: boolean) => void
) {
  const id = staffBanDocId(email);
  if (!id) {
    onChange(false);
    return () => {};
  }
  return onSnapshot(
    doc(getFirebaseDb(), "staffBanned", id),
    (snap) => onChange(snap.exists()),
    () => {
      /* keep last known */
    }
  );
}

export function subscribeAllStaff(onChange: (rows: StaffProfile[]) => void) {
  let lastRows: StaffProfile[] = [];
  return onSnapshot(
    collection(getFirebaseDb(), "staff"),
    (snap) => {
      const rows = snap.docs.map((d) =>
        mapStaffProfile(d.id, d.data() as Record<string, unknown>)
      );
      rows.sort((a, b) => {
        const statusRank = (s: StaffStatus) =>
          s === "pending" ? 0 : s === "approved" ? 1 : 2;
        const roleRank = (r: StaffRole) =>
          r === "admin" ? 0 : r === "manager" ? 1 : 2;
        const byStatus = statusRank(a.status) - statusRank(b.status);
        if (byStatus !== 0) return byStatus;
        const byRole = roleRank(a.role) - roleRank(b.role);
        if (byRole !== 0) return byRole;
        return a.email.localeCompare(b.email);
      });
      lastRows = rows;
      onChange(rows);
    },
    () => {
      // Permission/network blip — keep last good roster (never wipe to bootstrap-only).
      onChange(lastRows);
    }
  );
}

export function subscribePendingStaff(onChange: (rows: StaffProfile[]) => void) {
  return subscribeAllStaff((rows) =>
    onChange(rows.filter((row) => row.status === "pending"))
  );
}

export async function reviewStaffMember(
  uid: string,
  next: {
    status: "approved" | "denied" | "revoked";
    role?: StaffRole;
  },
  reviewedBy: string,
  knownEmail?: string
) {
  if (uid.startsWith("bootstrap:")) {
    throw new Error("Cannot change a company owner account.");
  }
  // Deny clears the request so they can apply again (no permanent denied lock).
  if (next.status === "denied") {
    await denyStaffRequest(uid, knownEmail);
    return;
  }
  const email = (knownEmail ?? "").trim().toLowerCase();
  if (email && isAdminEmail(email)) {
    throw new Error("Cannot change a company owner account.");
  }
  if (!email) {
    const snap = await getDoc(doc(getFirebaseDb(), "staff", uid));
    if (snap.exists()) {
      const docEmail = String(snap.data()?.email ?? "")
        .trim()
        .toLowerCase();
      if (isAdminEmail(docEmail)) {
        throw new Error("Cannot change a company owner account.");
      }
    }
  }
  const payload: Record<string, unknown> = {
    status: next.status,
    reviewedAt: serverTimestamp(),
    reviewedBy: reviewedBy || "admin",
    updatedAt: serverTimestamp(),
  };
  if (next.role) payload.role = next.role;
  await updateDoc(doc(getFirebaseDb(), "staff", uid), payload);
}

/** Deny — deletes the staff request. Same Auth account can request again. */
export async function denyStaffRequest(uid: string, knownEmail?: string) {
  if (uid.startsWith("bootstrap:")) {
    throw new Error("Cannot change a company owner account.");
  }
  const email = (knownEmail ?? "").trim().toLowerCase();
  if (email && isAdminEmail(email)) {
    throw new Error("Cannot change a company owner account.");
  }
  const ref = doc(getFirebaseDb(), "staff", uid);
  if (!email) {
    const snap = await getDoc(ref);
    if (!snap.exists()) return;
    const docEmail = String(snap.data()?.email ?? "")
      .trim()
      .toLowerCase();
    if (isAdminEmail(docEmail)) {
      throw new Error("Cannot change a company owner account.");
    }
  }
  await deleteDoc(ref);
}

/**
 * Ban — blocks the email from new OPS/Driver requests and clears any staff row.
 * Auth account may still exist; Ban is what stops spam re-applications.
 */
export async function banStaffMember(
  row: StaffProfile,
  bannedBy: string,
  reason?: string
) {
  if (row.uid.startsWith("bootstrap:") || isAdminEmail(row.email)) {
    throw new Error("Cannot ban a company owner account.");
  }
  await banStaffEmail(row.email, bannedBy, reason);
  try {
    await deleteDoc(doc(getFirebaseDb(), "staff", row.uid));
  } catch {
    // Already removed — ban row is what matters.
  }
}

/** Fire / remove — deletes staff doc so all portal access is gone. */
export async function removeStaffMember(
  uid: string,
  actorEmail?: string | null,
  knownRow?: StaffProfile
) {
  if (uid.startsWith("bootstrap:")) {
    throw new Error("Cannot remove a company owner account.");
  }
  const target =
    knownRow && knownRow.uid === uid
      ? knownRow
      : await (async () => {
          const snap = await getDoc(doc(getFirebaseDb(), "staff", uid));
          if (!snap.exists()) return null;
          return mapStaffProfile(uid, snap.data() as Record<string, unknown>);
        })();
  if (!target) return;
  if (!canRemoveStaffMember(actorEmail, target)) {
    throw new Error("Not allowed to remove this staff member.");
  }
  await deleteDoc(doc(getFirebaseDb(), "staff", uid));
}

/** Company owners — fixed allowlist; full Staff HR powers. */
export function isCompanyOwner(email?: string | null) {
  return isAdminEmail(email);
}

/** Can open Staff page: owners, approved admins, approved managers. */
export function canManageStaffPage(
  profile: StaffProfile | null,
  email?: string | null
) {
  if (isCompanyOwner(email)) return true;
  if (!profile || profile.status !== "approved") return false;
  return profile.role === "admin" || profile.role === "manager";
}

/** Only company owners may change roles (driver ↔ manager ↔ admin). */
export function canChangeStaffRoles(email?: string | null) {
  return isCompanyOwner(email);
}

/** Roles the actor may assign when approving / editing. */
export function assignableStaffRoles(email?: string | null): StaffRole[] {
  if (isCompanyOwner(email)) return ["admin", "manager", "driver"];
  // Managers may only approve people as drivers.
  return ["driver"];
}

/**
 * Who can remove (fire) a staff row:
 * - Never owners
 * - Owners can remove anyone else
 * - Managers can only remove drivers
 */
export function canRemoveStaffMember(
  actorEmail: string | null | undefined,
  target: StaffProfile
) {
  if (isCompanyOwner(target.email) || target.uid.startsWith("bootstrap:")) {
    return false;
  }
  if (isCompanyOwner(actorEmail)) return true;
  return target.role === "driver";
}

/** @deprecated Use canManageStaffPage */
export function isStaffAdmin(
  profile: StaffProfile | null,
  email?: string | null
) {
  return canManageStaffPage(profile, email);
}

export function canAccessOps(profile: StaffProfile | null, email?: string | null) {
  if (isCompanyOwner(email)) return true;
  if (!profile || profile.status !== "approved") return false;
  return profile.role === "admin" || profile.role === "manager";
}

export function canAccessDriverPortal(
  profile: StaffProfile | null,
  email?: string | null
) {
  if (isCompanyOwner(email)) return true;
  if (!profile || profile.status !== "approved") return false;
  return (
    profile.role === "driver" ||
    profile.role === "admin" ||
    profile.role === "manager"
  );
}

/** Always-on OPS admins from code allowlist (may not have signed in yet). */
export function bootstrapAdminStaffRows(): StaffProfile[] {
  return ADMIN_EMAILS.map((email) => ({
    uid: `bootstrap:${email}`,
    email,
    displayName: email.split("@")[0] || email,
    role: "admin" as const,
    status: "approved" as const,
    requestedPortal: "ops" as const,
    reviewedBy: "bootstrap",
  }));
}

export function isBootstrapStaffRow(row: StaffProfile) {
  return row.uid.startsWith("bootstrap:") || row.reviewedBy === "bootstrap";
}

/** Merge Firestore staff with allowlisted bootstrap admins (by email). */
export function mergeStaffWithBootstrap(rows: StaffProfile[]): StaffProfile[] {
  const byEmail = new Map<string, StaffProfile>();
  for (const row of rows) {
    byEmail.set(row.email.toLowerCase(), row);
  }
  for (const boot of bootstrapAdminStaffRows()) {
    const existing = byEmail.get(boot.email);
    if (!existing) {
      byEmail.set(boot.email, boot);
      continue;
    }
    // Keep Firestore row, but never demote a bootstrap allowlist admin in the UI.
    if (existing.status !== "approved" || existing.role !== "admin") {
      byEmail.set(boot.email, {
        ...existing,
        role: "admin",
        status: "approved",
        reviewedBy: existing.reviewedBy ?? "bootstrap",
      });
    }
  }
  const merged = Array.from(byEmail.values());
  merged.sort((a, b) => {
    const statusRank = (s: StaffStatus) =>
      s === "pending" ? 0 : s === "approved" ? 1 : 2;
    const roleRank = (r: StaffRole) =>
      r === "admin" ? 0 : r === "manager" ? 1 : 2;
    const byStatus = statusRank(a.status) - statusRank(b.status);
    if (byStatus !== 0) return byStatus;
    const byRole = roleRank(a.role) - roleRank(b.role);
    if (byRole !== 0) return byRole;
    return a.email.localeCompare(b.email);
  });
  return merged;
}
