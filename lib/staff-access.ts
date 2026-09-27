import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import type { User } from "firebase/auth";

import { getFirebaseDb } from "@/lib/firebase";
import { isAdminEmail } from "@/lib/site-config";

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
  return portal === "ops" ? "admin" : "driver";
}

/**
 * After Auth sign-in on /ops or /driver:
 * - bootstrap allowlist admins become approved admins
 * - everyone else gets a pending staff row (once)
 */
export async function ensureStaffProfile(
  user: User,
  portal: StaffPortal
): Promise<StaffProfile> {
  const db = getFirebaseDb();
  const ref = doc(db, "staff", user.uid);
  const snap = await getDoc(ref);
  const email = (user.email ?? "").trim().toLowerCase();
  const displayName =
    (user.displayName ?? "").trim() || email.split("@")[0] || "Staff";
  const bootstrapAdmin = isAdminEmail(email);

  if (!snap.exists()) {
    const status: StaffStatus = bootstrapAdmin ? "approved" : "pending";
    const role: StaffRole = bootstrapAdmin
      ? "admin"
      : defaultRoleForPortal(portal);
    await setDoc(ref, {
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
    });
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

  const patch: Record<string, unknown> = {
    email,
    displayName,
    updatedAt: serverTimestamp(),
  };

  // Keep bootstrap admins approved even if an older pending row exists.
  if (bootstrapAdmin && existing.status !== "approved") {
    patch.status = "approved";
    patch.role = "admin";
    patch.reviewedAt = serverTimestamp();
    patch.reviewedBy = "bootstrap";
  }

  await updateDoc(ref, patch);

  return {
    ...existing,
    email,
    displayName,
    status: bootstrapAdmin ? "approved" : existing.status,
    role: bootstrapAdmin ? "admin" : existing.role,
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
    () => onChange(null)
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
  const payload: Record<string, unknown> = {
    status: next.status,
    reviewedAt: serverTimestamp(),
    reviewedBy: reviewedBy || "admin",
    updatedAt: serverTimestamp(),
  };
  if (next.role) payload.role = next.role;
  await updateDoc(doc(getFirebaseDb(), "staff", uid), payload);
}

export function canAccessOps(profile: StaffProfile | null, email?: string | null) {
  if (isAdminEmail(email)) return true;
  if (!profile || profile.status !== "approved") return false;
  return profile.role === "admin" || profile.role === "manager";
}

export function canAccessDriverPortal(
  profile: StaffProfile | null,
  email?: string | null
) {
  if (isAdminEmail(email)) return true;
  if (!profile || profile.status !== "approved") return false;
  return (
    profile.role === "driver" ||
    profile.role === "admin" ||
    profile.role === "manager"
  );
}
