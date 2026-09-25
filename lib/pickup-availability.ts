import {
  doc,
  getDoc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";

import { SLOT_CAPACITY } from "@/lib/booking";
import { getFirebaseDb } from "@/lib/firebase";
import {
  loadDayOverride,
  loadPickupSchedule,
  slotCapacityForDay,
  subscribeDayOverride,
  type DayOverride,
  type PickupSchedule,
} from "@/lib/pickup-schedule";

export type SlotCounts = Record<string, number>;

function normalizeCounts(raw: unknown, labels?: string[]): SlotCounts {
  const next: SlotCounts = {};
  if (labels) {
    for (const label of labels) next[label] = 0;
  }
  if (!raw || typeof raw !== "object") return next;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const n = Number(value ?? 0);
    next[key] = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  }
  return next;
}

export function subscribePickupSlotCounts(
  dateIso: string,
  onChange: (counts: SlotCounts) => void,
  labels?: string[]
) {
  if (!dateIso) {
    onChange(normalizeCounts(null, labels));
    return () => {};
  }
  const ref = doc(getFirebaseDb(), "pickupAvailability", dateIso);
  return onSnapshot(
    ref,
    (snap) => onChange(normalizeCounts(snap.data()?.slots, labels)),
    () => onChange(normalizeCounts(null, labels))
  );
}

async function capacityForSlot(dateIso: string, slot: string) {
  const [schedule, override] = await Promise.all([
    loadPickupSchedule(),
    loadDayOverride(dateIso),
  ]);
  return slotCapacityForDay(schedule, override, slot);
}

export async function reservePickupSlot(dateIso: string, slot: string) {
  const label = slot.trim();
  if (!dateIso || !label) {
    throw new Error("Invalid time window.");
  }
  const capacity = await capacityForSlot(dateIso, label);
  const ref = doc(getFirebaseDb(), "pickupAvailability", dateIso);
  await runTransaction(getFirebaseDb(), async (tx) => {
    const snap = await tx.get(ref);
    const counts = normalizeCounts(snap.data()?.slots);
    const current = counts[label] ?? 0;
    if (current >= capacity) {
      throw new Error("That time window is full. Pick another slot.");
    }
    counts[label] = current + 1;
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
  const label = slot.trim();
  if (!dateIso || !label) return;
  const ref = doc(getFirebaseDb(), "pickupAvailability", dateIso);
  try {
    await runTransaction(getFirebaseDb(), async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) return;
      const counts = normalizeCounts(snap.data()?.slots);
      const current = counts[label] ?? 0;
      counts[label] = Math.max(0, current - 1);
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
    return counts[slot] ?? 0;
  } catch {
    return 0;
  }
}

/** Rewrite day counters from live waiting pickups (source of truth). */
export async function setDaySlotCounts(dateIso: string, counts: SlotCounts) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) return;
  const cleaned: SlotCounts = {};
  for (const [label, value] of Object.entries(counts)) {
    const n = Number(value ?? 0);
    if (!label.trim() || !Number.isFinite(n) || n <= 0) continue;
    cleaned[label.trim()] = Math.floor(n);
  }
  await setDoc(
    doc(getFirebaseDb(), "pickupAvailability", dateIso),
    {
      slots: cleaned,
      updatedAt: serverTimestamp(),
    },
    { merge: false }
  );
}

/** Raise counters when waiting orders outnumber the availability doc. */
export async function ensureAvailabilityAtLeast(
  dateIso: string,
  counts: SlotCounts
) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) return;
  const ref = doc(getFirebaseDb(), "pickupAvailability", dateIso);
  try {
    await runTransaction(getFirebaseDb(), async (tx) => {
      const snap = await tx.get(ref);
      const next = normalizeCounts(snap.data()?.slots);
      let changed = false;
      for (const [label, value] of Object.entries(counts)) {
        const n = Math.floor(Number(value ?? 0));
        if (!label.trim() || !Number.isFinite(n) || n <= 0) continue;
        if (n > (next[label] ?? 0)) {
          next[label] = n;
          changed = true;
        }
      }
      if (!changed) return;
      tx.set(
        ref,
        {
          slots: next,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    });
  } catch {
    /* best-effort */
  }
}

export function resolveSlotCapacity(
  schedule: PickupSchedule,
  override: DayOverride | null | undefined,
  label: string
) {
  return slotCapacityForDay(schedule, override, label) || SLOT_CAPACITY;
}

export { subscribeDayOverride };
