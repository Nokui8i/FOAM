import {
  addDoc,
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  doc,
  where,
} from "firebase/firestore";

import { pricingForOrder, REPEAT_DISCOUNT_PERCENT } from "@/lib/booking";
import { getFirebaseDb } from "@/lib/firebase";
import {
  buildOrderTrackDoc,
  makeTrackKey,
} from "@/lib/order-tracking";
import type { FoamOrder } from "@/lib/orders";
import { getUserProfile } from "@/lib/user-profile";

/** Add calendar days to a YYYY-MM-DD string (UTC noon to avoid DST edge cases). */
export function addDaysToYmd(ymd: string, days: number): string {
  const base = new Date(`${ymd}T12:00:00Z`);
  if (Number.isNaN(base.getTime())) return ymd;
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

function todayYmdLasVegas() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function isOpenWeeklyOrder(data: Record<string, unknown>, date: string) {
  if (data.status === "cancelled") return false;
  const pickup = data.pickup as { date?: string; repeat?: boolean } | undefined;
  if (!pickup?.repeat) return false;
  return pickup.date === date;
}

/**
 * After a weekly order is placed or finished, ensure the next same-slot
 * pickup (+7 days) exists while the customer still has weekly enabled.
 */
export async function ensureNextWeeklyOrder(
  source: FoamOrder
): Promise<{ created: boolean; nextDate?: string; reason?: string }> {
  if (!source.uid) {
    return { created: false, reason: "no-uid" };
  }
  if (!source.pickup.repeat && !source.pickup.repeatRequested) {
    return { created: false, reason: "not-weekly" };
  }

  const profile = await getUserProfile(source.uid);
  // Respect explicit cancel. Missing profile still allows chain if this order is weekly.
  if (profile && !profile.weeklyRepeatEnabled) {
    return { created: false, reason: "weekly-disabled" };
  }

  const nextDate = addDaysToYmd(source.pickup.date, 7);
  if (!nextDate || nextDate === source.pickup.date) {
    return { created: false, reason: "bad-date" };
  }

  const db = getFirebaseDb();
  const existing = await getDocs(
    query(
      collection(db, "orders"),
      where("uid", "==", source.uid),
      orderBy("createdAt", "desc"),
      limit(25)
    )
  );

  const alreadyQueued = existing.docs.some((snap) =>
    isOpenWeeklyOrder(snap.data() as Record<string, unknown>, nextDate)
  );
  if (alreadyQueued) {
    return { created: false, nextDate, reason: "already-queued" };
  }

  const pricing = pricingForOrder({ weeklyAutomation: true });
  const trackKey = makeTrackKey();
  const tip = source.tip ?? source.pricing?.tip ?? 0;

  const payload = {
    status: "new" as const,
    guest: false,
    uid: source.uid,
    trackKey,
    services: {
      laundry: Boolean(source.services.laundry),
      dryCleaning: Boolean(source.services.dryCleaning),
      bagCount: source.services.laundry
        ? Math.max(1, Number(source.services.bagCount) || 1)
        : 0,
    },
    contact: {
      name: source.contact.name,
      email: source.contact.email,
      phone: source.contact.phone,
    },
    pickup: {
      address: source.pickup.address,
      unit: source.pickup.unit ?? "",
      city: source.pickup.city,
      zip: source.pickup.zip,
      notes: source.pickup.notes ?? "",
      date: nextDate,
      slot: source.pickup.slot,
      repeat: true,
      repeatRequested: true,
    },
    preferences: source.preferences ?? {},
    orderNotes: "",
    pricing: {
      ...pricing,
      tip,
      promoCode: "",
      finalTotalPending: true,
      // Next automated pickup after a prior weekly order → 10% off laundry.
      repeatDiscountEligible: true,
      repeatDiscountPercent: REPEAT_DISCOUNT_PERCENT,
    },
    tip,
    promoCode: "",
    sourceOrderId: source.id,
    automatedWeekly: true,
    createdAt: serverTimestamp(),
  };

  const ref = await addDoc(collection(db, "orders"), payload);
  await setDoc(doc(db, "orderTracks", trackKey), {
    ...buildOrderTrackDoc({
      orderId: ref.id,
      status: "new",
      name: source.contact.name,
      pickupDate: nextDate,
      pickupSlot: source.pickup.slot,
      laundry: Boolean(source.services.laundry),
      dryCleaning: Boolean(source.services.dryCleaning),
      bagCount: source.services.laundry
        ? Math.max(1, Number(source.services.bagCount) || 1)
        : 0,
    }),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return { created: true, nextDate };
}

/** Cancel future not-yet-collected weekly pickups when the customer turns weekly off. */
export async function cancelFutureWeeklyOrders(
  uid: string
): Promise<{ cancelled: number }> {
  const db = getFirebaseDb();
  const today = todayYmdLasVegas();
  const snap = await getDocs(
    query(
      collection(db, "orders"),
      where("uid", "==", uid),
      orderBy("createdAt", "desc"),
      limit(40)
    )
  );

  let cancelled = 0;
  for (const row of snap.docs) {
    const data = row.data() as Record<string, unknown>;
    const status = String(data.status ?? "");
    if (status !== "new" && status !== "confirmed") continue;
    const pickup = (data.pickup ?? {}) as {
      date?: string;
      repeat?: boolean;
    };
    if (!pickup.repeat) continue;
    const date = String(pickup.date ?? "");
    if (!date || date < today) continue;

    await updateDoc(doc(db, "orders", row.id), {
      status: "cancelled",
      cancelReason: "Customer turned off weekly repeat",
      statusUpdatedAt: serverTimestamp(),
    });
    const trackKey =
      typeof data.trackKey === "string" ? data.trackKey : null;
    if (trackKey) {
      try {
        await updateDoc(doc(db, "orderTracks", trackKey), {
          status: "cancelled",
          updatedAt: serverTimestamp(),
        });
      } catch {
        /* track update is best-effort */
      }
    }
    cancelled += 1;
  }
  return { cancelled };
}
