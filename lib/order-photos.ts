import {
  getDownloadURL,
  ref,
  uploadBytes,
} from "firebase/storage";

import { getFirebaseStorage } from "@/lib/firebase";
import type { OrderPhotoKind } from "@/lib/orders";

/** Shrink camera shots before upload (keeps Storage cheap + fast on mobile). */
async function compressImage(file: File, maxEdge = 1600): Promise<Blob> {
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
    canvas.toBlob((b) => resolve(b), "image/jpeg", 0.82)
  );
  if (!blob) throw new Error("Could not compress image.");
  return blob;
}

export async function uploadOrderPhoto(opts: {
  orderId: string;
  kind: OrderPhotoKind;
  file: File;
}) {
  const blob = await compressImage(opts.file);
  const stamp = Date.now();
  const path = `order-photos/${opts.orderId}/${opts.kind}-${stamp}.jpg`;
  const storageRef = ref(getFirebaseStorage(), path);
  await uploadBytes(storageRef, blob, {
    contentType: "image/jpeg",
    customMetadata: { kind: opts.kind },
  });
  const url = await getDownloadURL(storageRef);
  return { url, path, kind: opts.kind };
}
