import {
  doc,
  getDoc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";

import {
  SLOT_CAPACITY,
  TIME_SLOTS,
  type TimeSlot,
} from "@/lib/booking";
import { getFirebaseDb } from "@/lib/firebase";

export type SlotCounts = Record<TimeSlot, number>;

function emptyCounts(): SlotCounts {
  return {
    "7am - 10am": 0,
    "10am - 1pm": 0,
    "1pm - 4pm": 0,
    "4pm - 7pm": 0,
  };
}

function normalizeCounts(raw: unknown): SlotCounts {
  const next = emptyCounts();
  if (!raw || typeof raw !== "object") return next;
  for (const slot of TIME_SLOTS) {
    const n = Number((raw as Record<string, unknown>)[slot] ?? 0);
    next[slot] = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  }
  return next;
}

export function subscribePickupSlotCounts(
  dateIso: string,
  onChange: (counts: SlotCounts) => void
) {
  if (!dateIso) {
    onChange(emptyCounts());
    return () => {};
  }
  const ref = doc(getFirebaseDb(), "pickupAvailability", dateIso);
  return onSnapshot(
    ref,
    (snap) => onChange(normalizeCounts(snap.data()?.slots)),
    () => onChange(emptyCounts())
  );
}

export async function reservePickupSlot(dateIso: string, slot: string) {
  if (!(TIME_SLOTS as readonly string[]).includes(slot)) {
    throw new Error("Invalid time window.");
  }
  const ref = doc(getFirebaseDb(), "pickupAvailability", dateIso);
  await runTransaction(getFirebaseDb(), async (tx) => {
    const snap = await tx.get(ref);
    const counts = normalizeCounts(snap.data()?.slots);
    const current = counts[slot as TimeSlot] ?? 0;
    if (current >= SLOT_CAPACITY) {
      throw new Error("That time window is full. Pick another slot.");
    }
    counts[slot as TimeSlot] = current + 1;
    tx.set(
      ref,
      {
        slots: counts,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  });
}

export async function releasePickupSlot(dateIso: string, slot: string) {
  if (!dateIso || !(TIME_SLOTS as readonly string[]).includes(slot)) return;
  const ref = doc(getFirebaseDb(), "pickupAvailability", dateIso);
  try {
    await runTransaction(getFirebaseDb(), async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) return;
      const counts = normalizeCounts(snap.data()?.slots);
      const current = counts[slot as TimeSlot] ?? 0;
      counts[slot as TimeSlot] = Math.max(0, current - 1);
      tx.set(
        ref,
        {
          slots: counts,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    });
  } catch {
    /* best-effort — do not block cancel */
  }
}

export async function getPickupSlotCount(dateIso: string, slot: string) {
  try {
    const snap = await getDoc(doc(getFirebaseDb(), "pickupAvailability", dateIso));
    const counts = normalizeCounts(snap.data()?.slots);
    return counts[slot as TimeSlot] ?? 0;
  } catch {
    return 0;
  }
}
