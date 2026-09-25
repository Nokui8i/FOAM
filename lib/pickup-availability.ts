import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";

import { SLOT_CAPACITY } from "@/lib/booking";
import { getFirebaseDb } from "@/lib/firebase";
import {
  isWaitingForPickup,
  normalizeOrderStatus,
  type OrderStatus,
} from "@/lib/orders";
import {
  loadDayOverride,
  loadPickupSchedule,
  slotCapacityForDay,
  subscribeDayOverride,
  type DayOverride,
  type PickupSchedule,
} from "@/lib/pickup-schedule";

export type SlotCounts = Record<string, number>;

/** Normalize slot keys so "7am – 10am" and "7am - 10am" match. */
export function normalizeSlotLabel(raw: string) {
  return raw
    .trim()
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\s*-\s*/g, " - ");
}

function normalizeCounts(raw: unknown, labels?: string[]): SlotCounts {
  const next: SlotCounts = {};
  if (labels) {
    for (const label of labels) next[normalizeSlotLabel(label)] = 0;
  }
  if (!raw || typeof raw !== "object") return next;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const label = normalizeSlotLabel(key);
    if (!label) continue;
    const n = Number(value ?? 0);
    const count = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
    next[label] = Math.max(next[label] ?? 0, count);
  }
  return next;
}

function mergeCounts(
  availability: SlotCounts,
  waiting: SlotCounts,
  labels?: string[]
): SlotCounts {
  const next = normalizeCounts(null, labels);
  const keys = new Set([
    ...Object.keys(next),
    ...Object.keys(availability),
    ...Object.keys(waiting),
  ]);
  for (const key of keys) {
    next[key] = Math.max(availability[key] ?? 0, waiting[key] ?? 0);
  }
  return next;
}

function waitingCountsFromOrdersSnap(
  docs: Array<{ data: () => Record<string, unknown> }>,
  dateIso: string
): SlotCounts {
  const next: SlotCounts = {};
  for (const docSnap of docs) {
    const data = docSnap.data();
    const status = normalizeOrderStatus(data.status) as OrderStatus;
    if (!isWaitingForPickup(status)) continue;
    const pickup =
      data.pickup && typeof data.pickup === "object"
        ? (data.pickup as Record<string, unknown>)
        : null;
    const date = typeof pickup?.date === "string" ? pickup.date : "";
    if (date !== dateIso) continue;
    const slot = normalizeSlotLabel(
      typeof pickup?.slot === "string" ? pickup.slot : ""
    );
    if (!slot) continue;
    next[slot] = (next[slot] ?? 0) + 1;
  }
  return next;
}

async function loadWaitingSlotCounts(dateIso: string): Promise<SlotCounts> {
  try {
    const snap = await getDocs(
      query(
        collection(getFirebaseDb(), "orders"),
        where("pickup.date", "==", dateIso)
      )
    );
    return waitingCountsFromOrdersSnap(
      snap.docs.map((d) => ({
        data: () => d.data() as Record<string, unknown>,
      })),
      dateIso
    );
  } catch {
    /* Fallback: scan recent orders if the date query isn't indexed yet. */
    try {
      const snap = await getDocs(collection(getFirebaseDb(), "orders"));
      return waitingCountsFromOrdersSnap(
        snap.docs.map((d) => ({
          data: () => d.data() as Record<string, unknown>,
        })),
        dateIso
      );
    } catch {
      return {};
    }
  }
}

/**
 * Live slot fill for a date = max(availability counter, waiting orders).
 * Also heals the availability doc when orders outnumber the counter.
 */
export function subscribePickupSlotCounts(
  dateIso: string,
  onChange: (counts: SlotCounts) => void,
  labels?: string[]
) {
  if (!dateIso) {
    onChange(normalizeCounts(null, labels));
    return () => {};
  }

  let availability: SlotCounts = normalizeCounts(null, labels);
  let waiting: SlotCounts = {};
  let healQueued = false;

  const emit = () => {
    const merged = mergeCounts(availability, waiting, labels);
    onChange(merged);

    if (healQueued) return;
    const under: SlotCounts = {};
    let need = false;
    for (const [label, count] of Object.entries(waiting)) {
      if (count > (availability[label] ?? 0)) {
        under[label] = count;
        need = true;
      }
    }
    if (!need) return;
    healQueued = true;
    void ensureAvailabilityAtLeast(dateIso, under).finally(() => {
      healQueued = false;
    });
  };

  const availRef = doc(getFirebaseDb(), "pickupAvailability", dateIso);
  const unsubAvail = onSnapshot(
    availRef,
    (snap) => {
      availability = normalizeCounts(snap.data()?.slots, labels);
      emit();
    },
    () => {
      availability = normalizeCounts(null, labels);
      emit();
    }
  );

  let unsubOrders = () => {};
  try {
    unsubOrders = onSnapshot(
      query(
        collection(getFirebaseDb(), "orders"),
        where("pickup.date", "==", dateIso)
      ),
      (snap) => {
        waiting = waitingCountsFromOrdersSnap(
          snap.docs.map((d) => ({
            data: () => d.data() as Record<string, unknown>,
          })),
          dateIso
        );
        emit();
      },
      () => {
        /* index / permission — fall back to full collection */
        unsubOrders = onSnapshot(
          collection(getFirebaseDb(), "orders"),
          (snap) => {
            waiting = waitingCountsFromOrdersSnap(
              snap.docs.map((d) => ({
                data: () => d.data() as Record<string, unknown>,
              })),
              dateIso
            );
            emit();
          },
          () => {
            waiting = {};
            emit();
          }
        );
      }
    );
  } catch {
    unsubOrders = onSnapshot(collection(getFirebaseDb(), "orders"), (snap) => {
      waiting = waitingCountsFromOrdersSnap(
        snap.docs.map((d) => ({
          data: () => d.data() as Record<string, unknown>,
        })),
        dateIso
      );
      emit();
    });
  }

  return () => {
    unsubAvail();
    unsubOrders();
  };
}

async function capacityForSlot(dateIso: string, slot: string) {
  const [schedule, override] = await Promise.all([
    loadPickupSchedule(),
    loadDayOverride(dateIso),
  ]);
  return slotCapacityForDay(schedule, override, slot);
}

export async function reservePickupSlot(dateIso: string, slot: string) {
  const label = normalizeSlotLabel(slot);
  if (!dateIso || !label) {
    throw new Error("Invalid time window.");
  }
  const [capacity, waiting] = await Promise.all([
    capacityForSlot(dateIso, label),
    loadWaitingSlotCounts(dateIso),
  ]);
  const waitingForSlot = waiting[label] ?? 0;
  const ref = doc(getFirebaseDb(), "pickupAvailability", dateIso);
  await runTransaction(getFirebaseDb(), async (tx) => {
    const snap = await tx.get(ref);
    const counts = normalizeCounts(snap.data()?.slots);
    const current = Math.max(counts[label] ?? 0, waitingForSlot);
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
  const label = normalizeSlotLabel(slot);
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
  const label = normalizeSlotLabel(slot);
  try {
    const [snap, waiting] = await Promise.all([
      getDoc(doc(getFirebaseDb(), "pickupAvailability", dateIso)),
      loadWaitingSlotCounts(dateIso),
    ]);
    const counts = normalizeCounts(snap.data()?.slots);
    return Math.max(counts[label] ?? 0, waiting[label] ?? 0);
  } catch {
    return 0;
  }
}

/** Rewrite day counters from live waiting pickups (source of truth). */
export async function setDaySlotCounts(dateIso: string, counts: SlotCounts) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) return;
  const cleaned: SlotCounts = {};
  for (const [label, value] of Object.entries(counts)) {
    const key = normalizeSlotLabel(label);
    const n = Number(value ?? 0);
    if (!key || !Number.isFinite(n) || n <= 0) continue;
    cleaned[key] = Math.floor(n);
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
        const key = normalizeSlotLabel(label);
        const n = Math.floor(Number(value ?? 0));
        if (!key || !Number.isFinite(n) || n <= 0) continue;
        if (n > (next[key] ?? 0)) {
          next[key] = n;
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
  return (
    slotCapacityForDay(schedule, override, normalizeSlotLabel(label)) ||
    SLOT_CAPACITY
  );
}

export { subscribeDayOverride };
