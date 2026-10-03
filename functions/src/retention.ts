import { FieldPath, getFirestore, type QueryDocumentSnapshot } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

import { deleteOrderDependents } from "./order-cleanup";

/** Must stay aligned with lib/data-retention.ts. Do not change the period. */
export const DATA_RETENTION_DAYS = 365;

const DAY_MS = 24 * 60 * 60 * 1000;
const PAGE_SIZE = 100;
const ORPHAN_GRACE_MS = 60 * 60 * 1000;

export type RetentionPurgeResult = {
  ordersScanned: number;
  ordersDeleted: number;
  contactsScanned: number;
  contactsDeleted: number;
  billingDeleted: number;
  tracksDeleted: number;
  photosCleared: number;
  orphanBillingDeleted: number;
  orphanTracksDeleted: number;
  orphanPhotoFoldersCleared: number;
  errors: number;
};

export function retentionCutoff(now: number): number {
  return now - DATA_RETENTION_DAYS * DAY_MS;
}

export function toMillis(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (value instanceof Date) return value.getTime();
  if (typeof value === "object" && value !== null && "toMillis" in value) {
    try {
      return (value as { toMillis: () => number }).toMillis();
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

/** Same decision as the previous OPS-session purge. */
export function shouldPurgeOrder(
  data: Record<string, unknown>,
  cutoff: number
): boolean {
  const status = String(data.status ?? "");
  const createdAt = data.createdAt;
  const closedAt = data.statusUpdatedAt ?? data.createdAt;
  const pickup = data.pickup as { date?: unknown } | undefined;
  const pickupDate = typeof pickup?.date === "string" ? pickup.date : "";

  if (status === "cancelled") return true;

  if (status === "delivered") {
    return isPastRetention(closedAt, cutoff);
  }

  if (!isPastRetention(createdAt, cutoff)) return false;
  if (pickupDate) {
    const pickupMs = Date.parse(`${pickupDate}T12:00:00Z`);
    if (Number.isFinite(pickupMs) && pickupMs >= cutoff) return false;
  }
  return true;
}

export function shouldPurgeContact(createdAt: unknown, cutoff: number) {
  return isPastRetention(createdAt, cutoff);
}

function storageBucketName(): string | undefined {
  const configured = process.env.FIREBASE_CONFIG;
  if (configured) {
    try {
      const parsed = JSON.parse(configured) as { storageBucket?: string };
      if (parsed.storageBucket) return parsed.storageBucket;
    } catch {
      /* ignore */
    }
  }
  return process.env.FIREBASE_STORAGE_BUCKET?.trim() || "foam-laundry-app.firebasestorage.app";
}

async function eachPage(
  collectionId: string,
  visit: (docs: QueryDocumentSnapshot[]) => Promise<void>
) {
  const db = getFirestore();
  let last: QueryDocumentSnapshot | undefined;
  for (;;) {
    let query = db
      .collection(collectionId)
      .orderBy(FieldPath.documentId())
      .limit(PAGE_SIZE);
    if (last) query = query.startAfter(last);
    const snap = await query.get();
    if (snap.empty) return;
    await visit(snap.docs);
    last = snap.docs[snap.docs.length - 1];
    if (snap.size < PAGE_SIZE) return;
  }
}

/**
 * Daily retention purge. Safe to run again: documents already removed are skipped,
 * and orderBilling is deleted only together with a permanent order delete
 * (or when its order document is already gone).
 */
export async function purgeExpiredOpsData(
  now = Date.now()
): Promise<RetentionPurgeResult> {
  const cutoff = retentionCutoff(now);
  const db = getFirestore();
  const result: RetentionPurgeResult = {
    ordersScanned: 0,
    ordersDeleted: 0,
    contactsScanned: 0,
    contactsDeleted: 0,
    billingDeleted: 0,
    tracksDeleted: 0,
    photosCleared: 0,
    orphanBillingDeleted: 0,
    orphanTracksDeleted: 0,
    orphanPhotoFoldersCleared: 0,
    errors: 0,
  };

  await eachPage("orders", async (docs) => {
    for (const orderDoc of docs) {
      result.ordersScanned += 1;
      const data = orderDoc.data() as Record<string, unknown>;
      if (!shouldPurgeOrder(data, cutoff)) continue;
      try {
        const cleanup = await deleteOrderDependents(db, orderDoc.id, data);
        await orderDoc.ref.delete();
        result.ordersDeleted += 1;
        result.billingDeleted += cleanup.billingDeleted;
        result.tracksDeleted += cleanup.tracksDeleted;
        result.photosCleared += cleanup.photosCleared;
      } catch {
        result.errors += 1;
      }
    }
  });

  await eachPage("contactMessages", async (docs) => {
    for (const contactDoc of docs) {
      result.contactsScanned += 1;
      if (!shouldPurgeContact(contactDoc.data().createdAt, cutoff)) continue;
      try {
        await contactDoc.ref.delete();
        result.contactsDeleted += 1;
      } catch {
        result.errors += 1;
      }
    }
  });

  await eachPage("orderBilling", async (docs) => {
    const orderSnaps = await db.getAll(
      ...docs.map((row) => db.doc(`orders/${row.id}`))
    );
    for (let index = 0; index < docs.length; index += 1) {
      if (orderSnaps[index]?.exists) continue;
      const updatedAt = toMillis(docs[index].data().updatedAt);
      if (updatedAt != null && now - updatedAt < ORPHAN_GRACE_MS) continue;
      try {
        await docs[index].ref.delete();
        result.orphanBillingDeleted += 1;
      } catch {
        result.errors += 1;
      }
    }
  });

  await eachPage("orderTracks", async (docs) => {
    for (const trackDoc of docs) {
      const orderId =
        typeof trackDoc.data().orderId === "string"
          ? trackDoc.data().orderId.trim()
          : "";
      if (!orderId) continue;
      try {
        const orderSnap = await db.doc(`orders/${orderId}`).get();
        if (orderSnap.exists) continue;
        await trackDoc.ref.delete();
        result.orphanTracksDeleted += 1;
      } catch {
        result.errors += 1;
      }
    }
  });

  try {
    const bucket = getStorage().bucket(storageBucketName());
    let pageToken: string | undefined;
    const seenOrders = new Set<string>();
    for (;;) {
      const [files, nextQuery] = await bucket.getFiles({
        prefix: "order-photos/",
        autoPaginate: false,
        maxResults: 200,
        pageToken,
      });
      for (const file of files) {
        const orderId = file.name.split("/")[1] || "";
        if (!orderId || seenOrders.has(orderId)) continue;
        seenOrders.add(orderId);
        const orderSnap = await db.doc(`orders/${orderId}`).get();
        if (orderSnap.exists) continue;
        await bucket.deleteFiles({ prefix: `order-photos/${orderId}/`, force: true });
        result.orphanPhotoFoldersCleared += 1;
      }
      pageToken = (nextQuery as { pageToken?: string } | undefined)?.pageToken;
      if (!pageToken) break;
    }
  } catch {
    /* storage is optional for the Firestore portion of the purge */
  }

  return result;
}
