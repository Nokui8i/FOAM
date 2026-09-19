import {
  getDownloadURL,
  ref,
  uploadBytes,
} from "firebase/storage";

import { getFirebaseStorage } from "@/lib/firebase";
import type { OrderPhotoKind } from "@/lib/orders";

/** Shrink camera shots before upload (keeps Storage/Firestore cheap + fast on mobile). */
async function compressImage(
  file: File,
  maxEdge = 1600,
  quality = 0.82
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

/**
 * Prefer Firebase Storage. If the bucket is not provisioned / CORS fails,
 * fall back to a compressed data URL stored on the order in Firestore.
 */
export async function uploadOrderPhoto(opts: {
  orderId: string;
  kind: OrderPhotoKind;
  file: File;
}) {
  const stamp = Date.now();
  const path = `order-photos/${opts.orderId}/${opts.kind}-${stamp}.jpg`;

  try {
    const blob = await compressImage(opts.file);
    const storageRef = ref(getFirebaseStorage(), path);
    await uploadBytes(storageRef, blob, {
      contentType: "image/jpeg",
      customMetadata: { kind: opts.kind },
    });
    const url = await getDownloadURL(storageRef);
    return { url, path, kind: opts.kind, storage: "firebase" as const };
  } catch {
    // Storage not set up / CORS / rules — keep ops unblocked with inline photo.
    const blob = await compressImage(opts.file, 1280, 0.72);
    if (blob.size > 700_000) {
      throw new Error(
        "Photo is still too large after compression. Try a clearer, closer shot."
      );
    }
    const url = await blobToDataUrl(blob);
    return { url, path, kind: opts.kind, storage: "inline" as const };
  }
}
