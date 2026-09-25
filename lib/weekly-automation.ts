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

import {
  pricingForOrder,
  REPEAT_DISCOUNT_PERCENT,
} from "@/lib/booking";
import { getFirebaseDb } from "@/lib/firebase";
import {
  buildOrderTrackDoc,
  makeTrackKey,
} from "@/lib/order-tracking";
import type { FoamOrder } from "@/lib/orders";
import {
  releasePickupSlot,
  reservePickupSlot,
} from "@/lib/pickup-availability";
import { getUserProfile } from "@/lib/user-profile";

/** Add calendar days to a YYYY-MM-DD string (UTC noon to avoid DST edge cases). */
export function addDaysToYmd(ymd: string, days: number): string {
  const base = new Date(`${ymd}T12:00:00Z`);
  if (Number.isNaN(base.getTime())) return ymd;
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

export function todayYmdLasVegas() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** Whole days from today (Las Vegas) until pickup YMD. Negative if past. */
export function daysUntilPickupYmd(pickupYmd: string, today = todayYmdLasVegas()) {
  const a = new Date(`${today}T12:00:00Z`).getTime();
  const b = new Date(`${pickupYmd}T12:00:00Z`).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / 86_400_000);
}

function isOpenWeeklyOrder(data: Record<string, unknown>, date: string) {
  if (data.status === "cancelled") return false;
  const pickup = data.pickup as { date?: string; repeat?: boolean } | undefined;
  if (!pickup?.repeat) return false;
  return pickup.date === date;
}

function isActivePickupStatus(status: string) {
  return status !== "cancelled" && status !== "delivered";
}

/**
 * After a weekly order is placed or finished, ensure the next same-slot
 * pickup (+7 days) exists while the customer still has weekly enabled.
 * Money-safe: next automated order always uses weekly $/lb + 10% laundry discount.
 */
export async function ensureNextWeeklyOrder(
  source: FoamOrder,
  opts?: { linkFromAdmin?: boolean }
): Promise<{ created: boolean; nextDate?: string; reason?: string; orderId?: string }> {
  if (!source.uid) {
    return { created: false, reason: "no-uid" };
  }
  if (!source.pickup.repeat && !source.pickup.repeatRequested) {
    return { created: false, reason: "not-weekly" };
  }

  const profile = await getUserProfile(source.uid);
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
      limit(40)
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
  const tip = Number(source.tip ?? source.pricing?.tip ?? 0) || 0;

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
      // Next automated pickup after a prior weekly order → 10% off laundry only.
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
  try {
    await reservePickupSlot(nextDate, source.pickup.slot);
  } catch {
    /* capacity soft — still keep the weekly order */
  }
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
      preferences: source.preferences ?? {},
      orderNotes: source.orderNotes ?? "",
      pickupNotes: source.pickup.notes ?? "",
    }),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  if (opts?.linkFromAdmin) {
    try {
      await updateDoc(doc(db, "orders", source.id), {
        weeklyNextOrderId: ref.id,
        weeklyNextDate: nextDate,
        weeklyNextQueuedAt: serverTimestamp(),
      });
    } catch {
      /* link is audit-only */
    }
  }

  return { created: true, nextDate, orderId: ref.id };
}

/** Cancel future not-yet-collected weekly pickups when weekly is turned off. */
export async function cancelFutureWeeklyOrders(
  uid: string,
  opts?: { cancelReason?: string }
): Promise<{ cancelled: number }> {
  const db = getFirebaseDb();
  const today = todayYmdLasVegas();
  const cancelReason =
    opts?.cancelReason ?? "Customer turned off weekly repeat";
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
      cancelReason,
      statusUpdatedAt: serverTimestamp(),
    });
    const pickupSlot = String(
      (data.pickup as { slot?: string } | undefined)?.slot ?? ""
    );
    await releasePickupSlot(date, pickupSlot);
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

/**
 * Admin reconciliation: for every open weekly order, ensure +7 exists.
 * Safe to run repeatedly (idempotent).
 */
export async function reconcileWeeklyQueues(): Promise<{
  checked: number;
  created: number;
  errors: string[];
}> {
  const db = getFirebaseDb();
  const snap = await getDocs(collection(db, "orders"));
  let checked = 0;
  let created = 0;
  const errors: string[] = [];

  const openWeekly: FoamOrder[] = [];
  for (const row of snap.docs) {
    const data = row.data() as Record<string, unknown>;
    const status = String(data.status ?? "");
    if (!isActivePickupStatus(status)) continue;
    const pickup = (data.pickup ?? {}) as Record<string, unknown>;
    if (!pickup.repeat) continue;
    const uid = typeof data.uid === "string" ? data.uid : null;
    if (!uid) continue;

    openWeekly.push({
      id: row.id,
      status: status as FoamOrder["status"],
      guest: Boolean(data.guest),
      uid,
      services: {
        laundry: Boolean((data.services as { laundry?: boolean })?.laundry),
        dryCleaning: Boolean(
          (data.services as { dryCleaning?: boolean })?.dryCleaning
        ),
        bagCount: Number(
          (data.services as { bagCount?: number })?.bagCount ?? 0
        ),
      },
      contact: {
        name: String((data.contact as { name?: string })?.name ?? ""),
        email: String((data.contact as { email?: string })?.email ?? ""),
        phone: String((data.contact as { phone?: string })?.phone ?? ""),
      },
      pickup: {
        address: String(pickup.address ?? ""),
        unit: String(pickup.unit ?? ""),
        city: String(pickup.city ?? ""),
        zip: String(pickup.zip ?? ""),
        notes: String(pickup.notes ?? ""),
        date: String(pickup.date ?? ""),
        slot: String(pickup.slot ?? ""),
        repeat: true,
        repeatRequested: Boolean(pickup.repeatRequested),
      },
      preferences: (data.preferences as FoamOrder["preferences"]) ?? {},
      pricing: data.pricing as FoamOrder["pricing"],
      tip: typeof data.tip === "number" ? data.tip : undefined,
    });
  }

  // Prefer newest pickup date per uid so we chain from the latest open weekly.
  const byUid = new Map<string, FoamOrder>();
  for (const order of openWeekly) {
    const uid = order.uid!;
    const prev = byUid.get(uid);
    if (!prev || order.pickup.date >= prev.pickup.date) {
      byUid.set(uid, order);
    }
  }

  for (const order of byUid.values()) {
    checked += 1;
    try {
      const result = await ensureNextWeeklyOrder(order, { linkFromAdmin: true });
      if (result.created) created += 1;
    } catch (err) {
      errors.push(
        `${order.id}: ${err instanceof Error ? err.message : "queue failed"}`
      );
    }
  }

  return { checked, created, errors };
}
