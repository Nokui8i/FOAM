import {
  collection,
  deleteDoc,
  doc,
  getDoc,
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
  tracksDeleted: number;
  contactsDeleted: number;
  photosCleared: number;
  photoFoldersCleared: number;
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

async function deleteFolderContents(folderPath: string) {
  try {
    const folder = ref(getFirebaseStorage(), folderPath);
    const listed = await listAll(folder);
    await Promise.all(listed.items.map((item) => deleteObject(item)));
    for (const prefix of listed.prefixes) {
      await deleteFolderContents(prefix.fullPath);
    }
    return listed.items.length;
  } catch {
    return 0;
  }
}

async function deleteOrderPhotos(orderId: string) {
  return deleteFolderContents(`order-photos/${orderId}`);
}

function shouldPurgeOrder(
  data: Record<string, unknown>,
  cutoff: number
): boolean {
  const status = String(data.status ?? "");
  const createdAt = data.createdAt;
  const closedAt = data.statusUpdatedAt ?? data.createdAt;
  const pickupDate =
    typeof (data.pickup as { date?: unknown } | undefined)?.date === "string"
      ? (data.pickup as { date: string }).date
      : "";

  // Closed work: keep one year from close (or create).
  if (status === "delivered" || status === "cancelled") {
    return isPastRetention(closedAt, cutoff);
  }

  // Abandoned open pickups older than one year (and not still upcoming).
  if (!isPastRetention(createdAt, cutoff)) return false;
  if (pickupDate) {
    const pickupMs = Date.parse(`${pickupDate}T12:00:00Z`);
    if (Number.isFinite(pickupMs) && pickupMs >= cutoff) return false;
  }
  return true;
}

/**
 * Deletes ops data older than one year:
 * - delivered / cancelled orders (+ photos + tracks)
 * - abandoned open orders past retention
 * - contact / Support messages
 * - orphan orderTracks
 */
export async function purgeExpiredOpsData(): Promise<RetentionPurgeResult> {
  const cutoff = Date.now() - RETENTION_MS;
  const db = getFirebaseDb();
  const result: RetentionPurgeResult = {
    ordersDeleted: 0,
    tracksDeleted: 0,
    contactsDeleted: 0,
    photosCleared: 0,
    photoFoldersCleared: 0,
  };

  const keptTrackKeys = new Set<string>();
  const ordersSnap = await getDocs(collection(db, "orders"));

  for (const orderDoc of ordersSnap.docs) {
    const data = orderDoc.data() as Record<string, unknown>;
    const trackKey =
      typeof data.trackKey === "string" ? data.trackKey.trim() : "";

    if (!shouldPurgeOrder(data, cutoff)) {
      if (trackKey) keptTrackKeys.add(trackKey);
      continue;
    }

    result.photosCleared += await deleteOrderPhotos(orderDoc.id);

    if (trackKey) {
      try {
        await deleteDoc(doc(db, "orderTracks", trackKey));
        result.tracksDeleted += 1;
      } catch {
        /* track may already be gone */
      }
    }

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

  // Orphan tracks left behind after order deletes.
  try {
    const tracksSnap = await getDocs(collection(db, "orderTracks"));
    for (const trackDoc of tracksSnap.docs) {
      if (keptTrackKeys.has(trackDoc.id)) continue;

      const data = trackDoc.data() as Record<string, unknown>;
      const orderId =
        typeof data.orderId === "string" ? data.orderId.trim() : "";

      let orderStillExists = false;
      if (orderId) {
        try {
          const orderSnap = await getDoc(doc(db, "orders", orderId));
          orderStillExists = orderSnap.exists();
        } catch {
          orderStillExists = false;
        }
      }

      if (orderStillExists) continue;

      try {
        await deleteDoc(doc(db, "orderTracks", trackDoc.id));
        result.tracksDeleted += 1;
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* list may fail without perms */
  }

  try {
    const root = ref(getFirebaseStorage(), "order-photos");
    const listed = await listAll(root);
    for (const prefix of listed.prefixes) {
      const orderId = prefix.name;
      const snap = await getDoc(doc(db, "orders", orderId));

      if (snap.exists()) {
        const data = snap.data() as Record<string, unknown>;
        if (!shouldPurgeOrder(data, cutoff)) continue;
      }

      const removed = await deleteFolderContents(prefix.fullPath);
      result.photosCleared += removed;
      result.photoFoldersCleared += 1;
    }
  } catch {
    /* storage list may fail when Storage is off */
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
