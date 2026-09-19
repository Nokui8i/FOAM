import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  type Timestamp,
} from "firebase/firestore";
import { deleteObject, listAll, ref } from "firebase/storage";

import { getFirebaseDb, getFirebaseStorage } from "@/lib/firebase";

/** Keep closed orders, photos, and contact messages for one year only. */
export const DATA_RETENTION_DAYS = 365;

const RETENTION_MS = DATA_RETENTION_DAYS * 24 * 60 * 60 * 1000;
const SESSION_KEY = "foam-ops-retention-purged";

export type RetentionPurgeResult = {
  ordersDeleted: number;
  contactsDeleted: number;
  photosCleared: number;
};

function toMillis(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (value instanceof Date) return value.getTime();
  if (typeof value === "object" && "toMillis" in value) {
    try {
      return (value as Timestamp).toMillis();
    } catch {
      return null;
    }
  }
  if (
    typeof value === "object" &&
    value !== null &&
    "seconds" in value &&
    typeof (value as { seconds: unknown }).seconds === "number"
  ) {
    return (value as { seconds: number }).seconds * 1000;
  }
  return null;
}

function isPastRetention(value: unknown, cutoff: number) {
  const ms = toMillis(value);
  return ms != null && ms < cutoff;
}

async function deleteOrderPhotos(orderId: string) {
  try {
    const folder = ref(getFirebaseStorage(), `order-photos/${orderId}`);
    const listed = await listAll(folder);
    await Promise.all(listed.items.map((item) => deleteObject(item)));
    return listed.items.length;
  } catch {
    // Storage may be unset / CORS — order doc delete still removes inline photos.
    return 0;
  }
}

/**
 * Deletes delivered/cancelled orders older than one year (and their photos),
 * plus contact messages older than one year. Safe to call repeatedly.
 */
export async function purgeExpiredOpsData(): Promise<RetentionPurgeResult> {
  const cutoff = Date.now() - RETENTION_MS;
  const db = getFirebaseDb();
  const result: RetentionPurgeResult = {
    ordersDeleted: 0,
    contactsDeleted: 0,
    photosCleared: 0,
  };

  const ordersSnap = await getDocs(collection(db, "orders"));
  for (const orderDoc of ordersSnap.docs) {
    const data = orderDoc.data();
    const status = String(data.status ?? "");
    if (status !== "delivered" && status !== "cancelled") continue;

    const closedAt = data.statusUpdatedAt ?? data.createdAt;
    if (!isPastRetention(closedAt, cutoff)) continue;

    result.photosCleared += await deleteOrderPhotos(orderDoc.id);
    await deleteDoc(doc(db, "orders", orderDoc.id));
    result.ordersDeleted += 1;
  }

  const contactsSnap = await getDocs(collection(db, "contactMessages"));
  for (const contactDoc of contactsSnap.docs) {
    const data = contactDoc.data();
    if (!isPastRetention(data.createdAt, cutoff)) continue;
    await deleteDoc(doc(db, "contactMessages", contactDoc.id));
    result.contactsDeleted += 1;
  }

  return result;
}

/** Run at most once per browser session after admin login. */
export async function purgeExpiredOpsDataOncePerSession(): Promise<RetentionPurgeResult | null> {
  if (typeof window === "undefined") return null;
  try {
    if (sessionStorage.getItem(SESSION_KEY) === "1") return null;
  } catch {
    /* private mode — still purge */
  }

  const result = await purgeExpiredOpsData();

  try {
    sessionStorage.setItem(SESSION_KEY, "1");
  } catch {
    /* ignore */
  }

  return result;
}
