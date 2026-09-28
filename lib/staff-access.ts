import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import type { User } from "firebase/auth";

import { getFirebaseDb } from "@/lib/firebase";
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

function defaultRoleForPortal(portal: StaffPortal): StaffRole {
  // OPS applicants start as manager candidates; drivers as driver.
  // Admins promote to admin explicitly from Staff.
  return portal === "ops" ? "manager" : "driver";
}

/**
 * After Auth sign-in on /ops or /driver:
 * - bootstrap allowlist admins become approved admins
 * - everyone else gets a pending staff row (once)
 *
 * One staff/{uid} doc covers both portals. requestedPortal is only the
 * first place they asked from; the approved role decides real access:
 * manager/admin → OPS + Driver, driver → Driver only.
 */
export async function ensureStaffProfile(
  user: User,
  portal: StaffPortal
): Promise<StaffProfile> {
  const db = getFirebaseDb();
  const ref = doc(db, "staff", user.uid);
  const email = (user.email ?? "").trim().toLowerCase();
  const displayName =
    (user.displayName ?? "").trim() || email.split("@")[0] || "Staff";
  const bootstrapAdmin = isAdminEmail(email);

  const snap = await getDoc(ref);

  if (!snap.exists()) {
    const status: StaffStatus = bootstrapAdmin ? "approved" : "pending";
    const role: StaffRole = bootstrapAdmin
      ? "admin"
      : defaultRoleForPortal(portal);
    const payload = {
      uid: user.uid,
      email,
      displayName,
      role,
      status,
      requestedPortal: portal,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      reviewedAt: bootstrapAdmin ? serverTimestamp() : null,
      reviewedBy: bootstrapAdmin ? "bootstrap" : null,
    };
    await setDoc(ref, payload);
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

  const existing = mapStaffProfile(
    user.uid,
    snap.data() as Record<string, unknown>
  );

  if (bootstrapAdmin && existing.status !== "approved") {
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
  }

  // Soft refresh only — never touch role/status/portal from the client.
  if (existing.email !== email || existing.displayName !== displayName) {
    try {
      await updateDoc(ref, {
        email,
        displayName,
        updatedAt: serverTimestamp(),
      });
    } catch {
      // Profile still usable even if the soft refresh is denied.
    }
  }

  return {
    ...existing,
    email,
    displayName,
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

export function subscribeAllStaff(onChange: (rows: StaffProfile[]) => void) {
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
      onChange(rows);
    },
    () => onChange([])
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
  reviewedBy: string
) {
  if (uid.startsWith("bootstrap:")) {
    throw new Error("Cannot change a company owner account.");
  }
  const ref = doc(getFirebaseDb(), "staff", uid);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    const email = String(snap.data()?.email ?? "")
      .trim()
      .toLowerCase();
    if (isAdminEmail(email)) {
      throw new Error("Cannot change a company owner account.");
    }
  }
  const payload: Record<string, unknown> = {
    status: next.status,
    reviewedAt: serverTimestamp(),
    reviewedBy: reviewedBy || "admin",
    updatedAt: serverTimestamp(),
  };
  if (next.role) payload.role = next.role;
  await updateDoc(ref, payload);
}

/** Fire / remove — deletes staff doc so all portal access is gone. */
export async function removeStaffMember(
  uid: string,
  actorEmail?: string | null
) {
  if (uid.startsWith("bootstrap:")) {
    throw new Error("Cannot remove a company owner account.");
  }
  const ref = doc(getFirebaseDb(), "staff", uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const target = mapStaffProfile(uid, snap.data() as Record<string, unknown>);
  if (!canRemoveStaffMember(actorEmail, target)) {
    throw new Error("Not allowed to remove this staff member.");
  }
  await deleteDoc(ref);
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
