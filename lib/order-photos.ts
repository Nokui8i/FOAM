import type { OrderPhotoKind } from "@/lib/orders";

/**
 * Storage is not provisioned on this Firebase project yet (needs Blaze).
 * Photos are stored compressed on the order document in Firestore.
 * Set NEXT_PUBLIC_FIREBASE_STORAGE_ENABLED=true after Storage is live.
 */
const STORAGE_ENABLED =
  process.env.NEXT_PUBLIC_FIREBASE_STORAGE_ENABLED === "true";

/** Shrink camera shots before save (keeps Firestore docs small + fast on mobile). */
async function compressImage(
  file: File,
  maxEdge = 1280,
  quality = 0.72
): Promise<Blob> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Please choose an image.");
  }

  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    throw new Error("Could not process image.");
  }
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), "image/jpeg", quality)
  );
  if (!blob) throw new Error("Could not compress image.");
  return blob;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("Could not read image."));
    };
    reader.onerror = () => reject(new Error("Could not read image."));
    reader.readAsDataURL(blob);
  });
}

async function saveInlinePhoto(opts: {
  orderId: string;
  kind: OrderPhotoKind;
  file: File;
  stamp: number;
}) {
  let edge = 1280;
  let quality = 0.72;
  let blob = await compressImage(opts.file, edge, quality);

  // Keep well under Firestore's 1MB document limit (base64 expands ~33%).
  while (blob.size > 450_000 && (edge > 640 || quality > 0.45)) {
    edge = Math.max(640, Math.round(edge * 0.85));
    quality = Math.max(0.45, quality - 0.08);
    blob = await compressImage(opts.file, edge, quality);
  }

  if (blob.size > 550_000) {
    throw new Error(
      "Photo is still too large after compression. Try a clearer, closer shot."
    );
  }

  const path = `order-photos/${opts.orderId}/${opts.kind}-${opts.stamp}.jpg`;
  const url = await blobToDataUrl(blob);
  return { url, path, kind: opts.kind, storage: "inline" as const };
}

export async function uploadOrderPhoto(opts: {
  orderId: string;
  kind: OrderPhotoKind;
  file: File;
}) {
  const stamp = Date.now();

  if (!STORAGE_ENABLED) {
    return saveInlinePhoto({ ...opts, stamp });
  }

  const { getDownloadURL, ref, uploadBytes } = await import("firebase/storage");
  const { getFirebaseStorage } = await import("@/lib/firebase");
  const path = `order-photos/${opts.orderId}/${opts.kind}-${stamp}.jpg`;

  try {
    const blob = await compressImage(opts.file, 1600, 0.82);
    const storageRef = ref(getFirebaseStorage(), path);
    await uploadBytes(storageRef, blob, {
      contentType: "image/jpeg",
      customMetadata: { kind: opts.kind },
    });
    const url = await getDownloadURL(storageRef);
    return { url, path, kind: opts.kind, storage: "firebase" as const };
  } catch {
    return saveInlinePhoto({ ...opts, stamp });
  }
}
