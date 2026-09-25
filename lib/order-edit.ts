import { doc, serverTimestamp, updateDoc } from "firebase/firestore";

import {
  SLOT_CAPACITY,
  TIME_SLOTS,
  isBeforePickupWindow,
  isPickupSlotStillOpen,
  type TimeSlot,
} from "@/lib/booking";
import { getFirebaseDb } from "@/lib/firebase";
import type { OrderStatus } from "@/lib/orders";
import {
  getPickupSlotCount,
  releasePickupSlot,
  reservePickupSlot,
} from "@/lib/pickup-availability";

export type OrderEditPreferences = {
  pants: string;
  dresses: string;
  detergent: string;
  softener: string;
  whitesWashTemp: string;
  colorsWashTemp: string;
  whitesDryerHeat: string;
  colorsDryerHeat: string;
};

export type OrderEditFields = {
  preferences: OrderEditPreferences;
  orderNotes: string;
  pickupNotes: string;
  pickupDate: string;
  pickupSlot: string;
};

/** Prefs / notes / access notes — while still waiting (before collected). */
export function canEditOrderRequests(status: OrderStatus) {
  return status === "new" || status === "confirmed";
}

/**
 * Date/time changes only before the order’s pickup window starts —
 * not while inside (or after) that window, and only while still “new”.
 */
export function canRescheduleOrder(
  status: OrderStatus,
  pickupDate: string,
  pickupSlot: string,
  now = new Date()
) {
  if (status !== "new") return false;
  return isBeforePickupWindow(pickupDate, pickupSlot, now);
}

export function defaultEditPreferences(
  raw?: Record<string, string> | null
): OrderEditPreferences {
  return {
    pants: raw?.pants || "Folded",
    dresses: raw?.dresses || "Folded",
    detergent: raw?.detergent || "Persil",
    softener: raw?.softener || "No softener",
    whitesWashTemp: raw?.whitesWashTemp || "Cold wash",
    colorsWashTemp: raw?.colorsWashTemp || "Cold wash",
    whitesDryerHeat: raw?.whitesDryerHeat || "Low",
    colorsDryerHeat: raw?.colorsDryerHeat || "Low",
  };
}

export async function saveCustomerOrderEdit(opts: {
  trackKey: string;
  orderId: string;
  status: OrderStatus;
  previousDate: string;
  previousSlot: string;
  next: OrderEditFields;
}) {
  const { trackKey, orderId, status, previousDate, previousSlot, next } = opts;

  if (!canEditOrderRequests(status)) {
    throw new Error("This order can no longer be edited.");
  }

  const scheduleChanged =
    next.pickupDate !== previousDate || next.pickupSlot !== previousSlot;

  if (scheduleChanged) {
    if (!canRescheduleOrder(status, previousDate, previousSlot)) {
      throw new Error(
        "Pickup date and time can only be changed before your pickup window starts."
      );
    }
    if (!(TIME_SLOTS as readonly string[]).includes(next.pickupSlot)) {
      throw new Error("Pick a valid time window.");
    }
    if (!isPickupSlotStillOpen(next.pickupDate, next.pickupSlot)) {
      throw new Error("That time window is closed. Pick another slot.");
    }
    const sameSlot =
      next.pickupDate === previousDate && next.pickupSlot === previousSlot;
    if (!sameSlot) {
      const count = await getPickupSlotCount(next.pickupDate, next.pickupSlot);
      // Releasing our own seat first when staying on same day/slot isn't needed;
      // when moving away, capacity check should allow the target if under cap.
      // If moving within same day to a full slot, block — except if we're the
      // one freeing a different slot (always separate windows).
      if (count >= SLOT_CAPACITY) {
        throw new Error("That time window is full. Pick another slot.");
      }
    }
  }

  let reserved = false;
  if (
    scheduleChanged &&
    (next.pickupDate !== previousDate || next.pickupSlot !== previousSlot)
  ) {
    await reservePickupSlot(next.pickupDate, next.pickupSlot);
    reserved = true;
  }

  const db = getFirebaseDb();
  try {
    await updateDoc(doc(db, "orders", orderId), {
      preferences: next.preferences,
      orderNotes: next.orderNotes.trim(),
      "pickup.notes": next.pickupNotes.trim(),
      "pickup.date": next.pickupDate,
      "pickup.slot": next.pickupSlot,
      editProof: trackKey,
      updatedAt: serverTimestamp(),
    });

    await updateDoc(doc(db, "orderTracks", trackKey), {
      pickupDate: next.pickupDate,
      pickupSlot: next.pickupSlot,
      preferences: next.preferences,
      orderNotes: next.orderNotes.trim(),
      pickupNotes: next.pickupNotes.trim(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    if (reserved) {
      await releasePickupSlot(next.pickupDate, next.pickupSlot);
    }
    throw err;
  }

  if (
    scheduleChanged &&
    (next.pickupDate !== previousDate || next.pickupSlot !== previousSlot)
  ) {
    await releasePickupSlot(previousDate, previousSlot);
  }
}

export function slotIsBookableForEdit(
  dateIso: string,
  slot: string,
  counts: Partial<Record<TimeSlot, number>>,
  currentDate: string,
  currentSlot: string
) {
  if (!dateIso || !slot) return false;
  if (!isPickupSlotStillOpen(dateIso, slot)) return false;
  const isCurrent = dateIso === currentDate && slot === currentSlot;
  if (isCurrent) return true;
  if ((counts[slot as TimeSlot] ?? 0) >= SLOT_CAPACITY) return false;
  return true;
}
