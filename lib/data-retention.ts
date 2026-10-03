import { deleteDoc, doc, getDoc } from "firebase/firestore";
import { deleteObject, listAll, ref } from "firebase/storage";

import { getFirebaseDb, getFirebaseStorage } from "@/lib/firebase";

/**
 * History calendar window. Production deletion runs in the scheduled
 * Cloud Function `purgeExpiredOpsData` (365 days). This module does not purge.
 */
export const DATA_RETENTION_DAYS = 365;

/**
 * Photos default to inline Firestore blobs. Only hit Storage when explicitly enabled —
 * otherwise listAll/delete spam CORS errors against an unconfigured bucket.
 */
const STORAGE_ENABLED =
  process.env.NEXT_PUBLIC_FIREBASE_STORAGE_ENABLED === "true";

async function deleteFolderContents(folderPath: string) {
  if (!STORAGE_ENABLED) return 0;
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

async function deleteKnownStoragePaths(paths: string[]) {
  if (!STORAGE_ENABLED || paths.length === 0) return 0;
  let removed = 0;
  await Promise.all(
    paths.map(async (path) => {
      const clean = path.trim();
      if (!clean || clean.startsWith("data:")) return;
      try {
        await deleteObject(ref(getFirebaseStorage(), clean));
        removed += 1;
      } catch {
        /* already gone or Storage off */
      }
    })
  );
  return removed;
}

function photoPathsFromOrder(data: Record<string, unknown>): string[] {
  const photos = data.photos;
  if (!Array.isArray(photos)) return [];
  const paths: string[] = [];
  for (const photo of photos) {
    if (!photo || typeof photo !== "object") continue;
    const row = photo as Record<string, unknown>;
    if (typeof row.path === "string" && row.path.trim()) {
      paths.push(row.path.trim());
    }
  }
  return paths;
}

async function deleteOrderPhotos(
  orderId: string,
  data?: Record<string, unknown>
) {
  if (!STORAGE_ENABLED) return 0;
  const known = data ? photoPathsFromOrder(data) : [];
  const fromPaths = await deleteKnownStoragePaths(known);
  const fromFolder = await deleteFolderContents(`order-photos/${orderId}`);
  return fromPaths + fromFolder;
}

/** Permanently delete one order + track + photos (admin History / cancel). */
export async function deleteOrderCompletely(orderId: string): Promise<void> {
  const db = getFirebaseDb();
  const orderRef = doc(db, "orders", orderId);
  const snap = await getDoc(orderRef);
  if (!snap.exists()) {
    await deleteOrderPhotos(orderId);
    return;
  }

  const data = snap.data() as Record<string, unknown>;
  const trackKey =
    typeof data.trackKey === "string" ? data.trackKey.trim() : "";

  await deleteOrderPhotos(orderId, data);

  if (trackKey) {
    try {
      await deleteDoc(doc(db, "orderTracks", trackKey));
    } catch {
      /* track may already be gone */
    }
  }

  await deleteDoc(orderRef);
}
