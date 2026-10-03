import { getStorage } from "firebase-admin/storage";
import { getFirestore } from "firebase-admin/firestore";

type FirestoreDb = ReturnType<typeof getFirestore>;

export type OrderCleanupResult = {
  billingDeleted: number;
  tracksDeleted: number;
  photosCleared: number;
};

function storageBucketName(): string | null {
  const configured = process.env.FIREBASE_CONFIG;
  if (configured) {
    try {
      const parsed = JSON.parse(configured) as { storageBucket?: string };
      if (parsed.storageBucket) return parsed.storageBucket;
    } catch {
      /* ignore malformed config */
    }
  }
  const fromEnv = process.env.FIREBASE_STORAGE_BUCKET?.trim();
  return fromEnv || "foam-laundry-app.firebasestorage.app";
}

/** Delete only the tracking document that belongs to the deleted order. */
export async function deleteOrderTrackProjection(
  db: FirestoreDb,
  orderId: string,
  trackKey: string
) {
  if (!trackKey || trackKey.length > 64) return false;
  const ref = db.doc(`orderTracks/${trackKey}`);
  let deleted = false;
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists && snap.data()?.orderId === orderId) {
      tx.delete(ref);
      deleted = true;
    }
  });
  return deleted;
}

function photoPaths(data: Record<string, unknown> | undefined): string[] {
  const photos = data?.photos;
  if (!Array.isArray(photos)) return [];
  const paths: string[] = [];
  for (const photo of photos) {
    if (!photo || typeof photo !== "object") continue;
    const path = (photo as { path?: unknown }).path;
    if (typeof path === "string" && path.trim() && !path.trim().startsWith("data:")) {
      paths.push(path.trim());
    }
  }
  return paths;
}

async function deleteOrderPhotos(
  orderId: string,
  data: Record<string, unknown> | undefined
): Promise<number> {
  const bucket = getStorage().bucket(storageBucketName() || undefined);
  let removed = 0;
  const seen = new Set<string>();
  for (const path of photoPaths(data)) {
    if (seen.has(path)) continue;
    seen.add(path);
    try {
      await bucket.file(path).delete({ ignoreNotFound: true });
      removed += 1;
    } catch {
      /* missing object or storage unavailable */
    }
  }
  try {
    const prefix = `order-photos/${orderId}/`;
    const [files] = await bucket.getFiles({ prefix, autoPaginate: false, maxResults: 200 });
    await Promise.all(
      files.map(async (file) => {
        if (seen.has(file.name)) return;
        await file.delete({ ignoreNotFound: true });
        removed += 1;
      })
    );
  } catch {
    /* storage listing can fail when the bucket is not configured */
  }
  return removed;
}

/**
 * Side effects of a permanent order delete.
 * Does not delete the order document and must not run on status updates.
 */
export async function deleteOrderDependents(
  db: FirestoreDb,
  orderId: string,
  data: Record<string, unknown> | undefined
): Promise<OrderCleanupResult> {
  const result: OrderCleanupResult = {
    billingDeleted: 0,
    tracksDeleted: 0,
    photosCleared: 0,
  };
  const trackKey = typeof data?.trackKey === "string" ? data.trackKey.trim() : "";
  if (await deleteOrderTrackProjection(db, orderId, trackKey)) {
    result.tracksDeleted += 1;
  }
  const billingRef = db.doc(`orderBilling/${orderId}`);
  const billingSnap = await billingRef.get();
  await billingRef.delete();
  if (billingSnap.exists) result.billingDeleted += 1;
  try {
    result.photosCleared += await deleteOrderPhotos(orderId, data);
  } catch {
    /* photo cleanup must not block billing deletion */
  }
  return result;
}
