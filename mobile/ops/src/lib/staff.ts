import type { User } from "firebase/auth";
import {
  deleteDoc,
  doc,
  getDoc,
  getDocFromServer,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import {
  StaffBannedError,
  defaultRoleForPortal,
  isAdminEmail,
  mapStaffProfile,
  staffBanDocId,
  type StaffPortal,
  type StaffProfile,
  type StaffStatus,
} from "@foam/staff-core";

import { getFirebaseDb } from "@/lib/firebase";
import { getAdminEmails } from "@/lib/admin-emails";

const staffEnsureInflight = new Map<string, Promise<StaffProfile | null>>();

export async function isStaffEmailBanned(email: string): Promise<boolean> {
  const id = staffBanDocId(email);
  if (!id) return false;
  try {
    const snap = await getDoc(doc(getFirebaseDb(), "staffBanned", id));
    return snap.exists();
  } catch {
    return false;
  }
}

/**
 * Load or create staff/{uid} — mirrors existing web ensureStaffProfile semantics.
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
  const db = getFirebaseDb();
  const ref = doc(db, "staff", user.uid);
  const email = (user.email ?? "").trim().toLowerCase();
  const displayName = (
    (user.displayName ?? "").trim() ||
    email.split("@")[0] ||
    "Staff"
  ).slice(0, 120);
  const bootstrapAdmin = isAdminEmail(email, getAdminEmails());

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
    // Do not fall back to cache for create/gate decisions — that can fake "pending".
    throw new Error(
      "Could not reach Firestore to check staff access. Check network and try again."
    );
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
      if (refreshPending && existing.status === "pending" && !bootstrapAdmin) {
        softUpdate.requestedPortal = portal;
        softUpdate.updatedAt = serverTimestamp();
      } else if (Object.keys(softUpdate).length > 0) {
        softUpdate.updatedAt = serverTimestamp();
      }
      if (Object.keys(softUpdate).length > 0) {
        try {
          await updateDoc(ref, softUpdate);
        } catch {
          /* soft refresh optional */
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

  if (!shouldRecreate) return null;
  if (!createIfMissing && !bootstrapAdmin) return null;

  const status: StaffStatus = bootstrapAdmin ? "approved" : "pending";
  const role = bootstrapAdmin ? "admin" : defaultRoleForPortal(portal);
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
    try {
      const again = await getDocFromServer(ref);
      if (again.exists()) {
        return mapStaffProfile(
          user.uid,
          again.data() as Record<string, unknown>
        );
      }
    } catch {
      /* fall through */
    }
    throw new Error("Staff request did not save. Try again.");
  }
}

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
      /* keep last known */
    }
  );
}
