import { createHash, randomBytes, randomUUID } from "node:crypto";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { onCall, onRequest, HttpsError } from "firebase-functions/v2/https";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { setGlobalOptions } from "firebase-functions/v2";
import Stripe from "stripe";

import { deleteOrderDependents } from "./order-cleanup";
import {
  receiptParamsForAttempt,
  resolveReceiptEmail,
} from "./receipt-email";
import { purgeExpiredOpsData as runRetentionPurge } from "./retention";
import { requestClientIp } from "./client-ip";
import {
  GUEST_ORDER_EMAIL_LIMIT,
  GUEST_ORDER_IP_LIMIT,
  GUEST_ORDER_IP_WINDOW_MS,
  guestOrderDocument,
  guestPricingSnapshot,
  parseGuestOrderInput,
  type GuestPromoSnapshot,
  type GuestRateSnapshot,
} from "./guest-order";

export { deleteOrderTrackProjection } from "./order-cleanup";
export { requestClientIp } from "./client-ip";

initializeApp();
setGlobalOptions({ region: "us-central1", timeoutSeconds: 60 });

/** Daily retention. 03:15 America/Los_Angeles, once. OPS does not have to be open. */
export const purgeExpiredOpsData = onSchedule(
  {
    schedule: "15 3 * * *",
    timeZone: "America/Los_Angeles",
    timeoutSeconds: 540,
    memory: "512MiB",
    maxInstances: 1,
  },
  async () => {
    const result = await runRetentionPurge();
    logger.info("FOAM retention purge finished", result);
  }
);

const OWNER_EMAILS = new Set([
  "paylocksmith@gmail.com",
  "iaaoamar12@gmail.com",
  "liran4004@gmail.com",
]);

let stripeSingleton: Stripe | null = null;

function stripeClient() {
  if (stripeSingleton) return stripeSingleton;
  const key = (process.env.STRIPE_SECRET_KEY || "").trim();
  if (!key) {
    throw new HttpsError(
      "failed-precondition",
      "Stripe is not configured. Set STRIPE_SECRET_KEY."
    );
  }
  stripeSingleton = new Stripe(key);
  return stripeSingleton;
}

function normalizedSlotLabel(raw: string) {
  return raw.trim().replace(/[\u2013\u2014]/g, "-").replace(/\s*-\s*/g, " - ");
}

function validIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

type RateLimitRequest = {
  rawRequest?: {
    ip?: string;
    headers?: Record<string, string | string[] | undefined>;
  };
};

/**
 * Fixed-window counter in rateLimits/{bucket}. Clients cannot read it.
 * A missing address does not share one global bucket.
 */
export async function consumeRateLimit(
  db: ReturnType<typeof getFirestore>,
  bucket: string,
  limit: number,
  windowMs: number
): Promise<void> {
  const safe = bucket.replace(/[^a-zA-Z0-9:_-]/g, "_").slice(0, 200);
  if (!safe) return;
  const ref = db.doc(`rateLimits/${safe}`);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const now = Date.now();
    const start = Number(snap.data()?.windowStartMs || 0);
    const fresh = !snap.exists || !Number.isFinite(start) || now - start >= windowMs;
    const count = fresh ? 0 : Number(snap.data()?.count || 0);
    if (count >= limit) {
      throw new HttpsError("resource-exhausted", "Too many requests. Try again shortly.");
    }
    tx.set(ref, {
      count: count + 1,
      windowStartMs: fresh ? now : start,
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
}

const MISSING_PLATFORM_IP_BUCKET = "platform-ip-missing";

export async function limitGuestCaller(
  request: RateLimitRequest,
  action: string,
  limit: number,
  windowMs: number
) {
  const ip = requestClientIp(request) || MISSING_PLATFORM_IP_BUCKET;
  await consumeRateLimit(getFirestore(), `${action}:${ip}`, limit, windowMs);
}

async function waitingSlotCounts(date: string) {
  const snap = await getFirestore().collection("orders")
    .where("pickup.date", "==", date).get();
  const counts: Record<string, number> = {};
  for (const row of snap.docs) {
    const data = row.data();
    if (!["new", "confirmed"].includes(String(data.status || ""))) continue;
    const pickup = data.pickup as Record<string, unknown> | undefined;
    const slot = normalizedSlotLabel(typeof pickup?.slot === "string" ? pickup.slot : "");
    if (slot) counts[slot] = (counts[slot] || 0) + 1;
  }
  return counts;
}

function orderPublicReference(orderId: string) {
  let hash = 2166136261;
  for (let i = 0; i < orderId.length; i++) {
    hash ^= orderId.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return String(10_000_000 + ((hash >>> 0) % 90_000_000));
}

/** Rebuilds the public tracking projection from the authoritative order. */
export const syncOrderTrack = onDocumentWritten("orders/{orderId}", async (event) => {
  const after = event.data?.after;
  if (!after?.exists) {
    const before = event.data?.before;
    const oldOrder = before?.exists ? before.data() || {} : {};
    await deleteOrderDependents(getFirestore(), event.params.orderId, oldOrder);
    return;
  }
  const order = after.data() || {};
  const trackKey = typeof order.trackKey === "string" ? order.trackKey : "";
  if (trackKey.length < 16 || trackKey.length > 64) return;
  const pickup = (order.pickup || {}) as Record<string, unknown>;
  const services = (order.services || {}) as Record<string, unknown>;
  const contact = (order.contact || {}) as Record<string, unknown>;
  const photos = Array.isArray(order.photos)
    ? order.photos.filter((photo: Record<string, unknown>) =>
        photo && (photo.kind === "weight" || photo.kind === "return")
      ).map((photo: Record<string, unknown>) => ({
        url: photo.url,
        kind: photo.kind,
        createdAt: photo.createdAt || null,
      }))
    : undefined;
  const ref = getFirestore().doc(`orderTracks/${trackKey}`);
  await getFirestore().runTransaction(async (tx) => {
    const current = await tx.get(ref);
    const name = typeof contact.name === "string" ? contact.name.trim() : "";
    tx.set(ref, {
      orderId: event.params.orderId,
      ref: orderPublicReference(event.params.orderId),
      status: String(order.status || "new"),
      firstName: name.split(/\s+/)[0]?.slice(0, 40) || "Customer",
      pickupDate: typeof pickup.date === "string" ? pickup.date : "",
      pickupSlot: typeof pickup.slot === "string" ? pickup.slot : "",
      laundry: services.laundry === true,
      dryCleaning: services.dryCleaning === true,
      bagCount: Number(services.bagCount || 0),
      preferences: order.preferences && typeof order.preferences === "object" ? order.preferences : {},
      orderNotes: typeof order.orderNotes === "string" ? order.orderNotes : "",
      pickupNotes: typeof pickup.notes === "string" ? pickup.notes : "",
      ...(photos ? { photos } : {}),
      ...(typeof order.weightLbs === "number" ? { weightLbs: order.weightLbs } : {}),
      ...(typeof order.finalTotal === "number" ? { finalTotal: order.finalTotal } : {}),
      ...(!current.exists ? { createdAt: FieldValue.serverTimestamp() } : {}),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  });
});

async function pickupCapacity(date: string, slot: string) {
  const db = getFirestore();
  const [scheduleSnap, overrideSnap] = await Promise.all([
    db.doc("config/pickupSchedule").get(),
    db.doc(`pickupDayOverrides/${date}`).get(),
  ]);
  const scheduleSlots = scheduleSnap.data()?.slots;
  const defaultLabels = ["7am - 10am", "10am - 1pm", "1pm - 4pm", "4pm - 7pm"];
  const configured = Array.isArray(scheduleSlots) && scheduleSlots.length > 0
    ? scheduleSlots.find((row: Record<string, unknown>) =>
        normalizedSlotLabel(String(row?.label || "")) === slot
      )
    : defaultLabels.includes(slot)
      ? { capacity: 5, enabled: true }
      : undefined;
  if (!configured || configured.enabled === false) return 0;
  const override = overrideSnap.data() || {};
  const slotOverride = (override.slots || {})[slot] as Record<string, unknown> | undefined;
  if (override.closed === true || slotOverride?.closed === true) return 0;
  const rawCapacity = Number(slotOverride?.capacity ?? configured.capacity);
  return Number.isFinite(rawCapacity) && rawCapacity > 0
    ? Math.min(200, Math.floor(rawCapacity))
    : 0;
}

async function holdPickupSlot(date: string, slot: string) {
  const [capacity, waiting] = await Promise.all([
    pickupCapacity(date, slot),
    waitingSlotCounts(date),
  ]);
  if (!capacity) throw new HttpsError("failed-precondition", "That time window is closed.");
  const ref = getFirestore().doc(`pickupAvailability/${date}`);
  await getFirestore().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const slots = { ...(snap.data()?.slots || {}) } as Record<string, unknown>;
    const rawCount = Number(slots[slot] || 0);
    const count = Math.max(Number.isFinite(rawCount) ? Math.floor(rawCount) : 0, waiting[slot] || 0);
    if (count >= capacity) throw new HttpsError("resource-exhausted", "That time window is full. Pick another slot.");
    slots[slot] = count + 1;
    tx.set(ref, { slots, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  });
}

/** Server-controlled pickup holds keep public clients from editing counters. */
export const reservePickupSlot = onCall(async (request) => {
  await limitGuestCaller(request, "reserve", 12, 10 * 60 * 1000);
  const date = request.data?.date;
  const slot = normalizedSlotLabel(String(request.data?.slot || ""));
  if (!validIsoDate(date) || !slot || slot.length > 80) {
    throw new HttpsError("invalid-argument", "Invalid pickup date or time window.");
  }
  await holdPickupSlot(date, slot);
  return { ok: true };
});

/** Best-effort release only ever decrements a single hold and never below live orders. */
export const releasePickupSlot = onCall(async (request) => {
  await limitGuestCaller(request, "release", 30, 10 * 60 * 1000);
  const date = request.data?.date;
  const slot = normalizedSlotLabel(String(request.data?.slot || ""));
  if (!validIsoDate(date) || !slot || slot.length > 80) return { ok: true };
  const [ref, waiting] = [
    getFirestore().doc(`pickupAvailability/${date}`),
    await waitingSlotCounts(date),
  ] as const;
  await getFirestore().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return;
    const slots = { ...(snap.data()?.slots || {}) } as Record<string, unknown>;
    const currentRaw = Number(slots[slot] || 0);
    const current = Math.max(Number.isFinite(currentRaw) ? Math.floor(currentRaw) : 0, waiting[slot] || 0);
    slots[slot] = Math.max(waiting[slot] || 0, current - 1);
    tx.set(ref, { slots, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  });
  return { ok: true };
});

async function promoSnapshotForGuest(
  db: ReturnType<typeof getFirestore>,
  code: string
): Promise<GuestPromoSnapshot | null> {
  if (!code) return null;
  const snap = await db.doc(`promoCodes/${code}`).get();
  if (!snap.exists) throw new HttpsError("invalid-argument", "Promo code is not available.");
  const data = snap.data() || {};
  const value = Number(data.discountValue);
  const active = data.active !== false
    && (data.limitMode !== "uses"
      || (Number.isFinite(Number(data.maxUses)) && Number(data.usedCount || 0) < Number(data.maxUses)));
  if (!active || (data.discountType !== "percent" && data.discountType !== "fixed")
    || !Number.isFinite(value) || value <= 0 || String(data.code || "") !== code) {
    throw new HttpsError("invalid-argument", "Promo code is not available.");
  }
  const discountType: "percent" | "fixed" = data.discountType === "percent" ? "percent" : "fixed";
  return {
    code,
    discountType,
    discountValue: value,
    includesFee: data.includesFee === true,
  };
}

/**
 * Guest checkout. The browser cannot create this order itself.
 * Price, status, and payment fields come from the server.
 */
export async function createGuestOrderRecord(data: unknown) {
  const draft = parseGuestOrderInput(data);
  const db = getFirestore();
  const ratesSnap = await db.doc("config/laundryRates").get();
  const rates = ratesSnap.data() || {};
  const snapshot: GuestRateSnapshot = {
    weeklyPerLb: Number(rates.weeklyPerLb),
    standardPerLb: Number(rates.standardPerLb),
    deliveryFee: Number(rates.deliveryFee),
    minimumOrder: Number(rates.minimumOrder),
  };
  if (![snapshot.weeklyPerLb, snapshot.standardPerLb, snapshot.deliveryFee, snapshot.minimumOrder]
    .every((value) => Number.isFinite(value) && value > 0)) {
    throw new HttpsError("failed-precondition", "Pickup pricing is unavailable.");
  }
  const promo = await promoSnapshotForGuest(db, draft.promoCode);
  const pricing = guestPricingSnapshot(snapshot, draft.tip, promo);
  await holdPickupSlot(draft.pickup.date, draft.pickup.slot);
  const ref = db.collection("orders").doc();
  const trackKey = randomBytes(16).toString("hex");
  const order = guestOrderDocument(draft, pricing, trackKey);
  const contactName = order.contact.name;
  await ref.set({
    ...order,
    createdAt: FieldValue.serverTimestamp(),
  });
  await db.doc(`orderTracks/${trackKey}`).set({
    orderId: ref.id,
    ref: orderPublicReference(ref.id),
    status: "new",
    firstName: contactName.split(/\s+/)[0]?.slice(0, 40) || "Customer",
    pickupDate: order.pickup.date,
    pickupSlot: order.pickup.slot,
    laundry: order.services.laundry,
    dryCleaning: order.services.dryCleaning,
    bagCount: order.services.bagCount,
    preferences: order.preferences,
    orderNotes: order.orderNotes,
    pickupNotes: order.pickup.notes,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  return { orderId: ref.id, trackKey };
}

export const createGuestOrder = onCall(async (request) => {
  await limitGuestCaller(request, "guest-order", GUEST_ORDER_IP_LIMIT, GUEST_ORDER_IP_WINDOW_MS);
  const draft = parseGuestOrderInput(request.data);
  const emailHash = createHash("sha256").update(draft.contact.email).digest("hex").slice(0, 32);
  await consumeRateLimit(
    getFirestore(),
    `guest-order-email:${emailHash}`,
    GUEST_ORDER_EMAIL_LIMIT,
    GUEST_ORDER_IP_WINDOW_MS
  );
  return createGuestOrderRecord(draft);
});

/** Reconcile counters from authoritative waiting orders; caller counts are ignored. */
export const ensurePickupAvailability = onCall(async (request) => {
  const date = request.data?.date;
  if (!validIsoDate(date)) throw new HttpsError("invalid-argument", "Invalid pickup date.");
  const waiting = await waitingSlotCounts(date);
  const ref = getFirestore().doc(`pickupAvailability/${date}`);
  await getFirestore().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const slots = { ...(snap.data()?.slots || {}) } as Record<string, unknown>;
    let changed = false;
    for (const [slot, count] of Object.entries(waiting)) {
      if (Number(slots[slot] || 0) < count) {
        slots[slot] = count;
        changed = true;
      }
    }
    if (changed) tx.set(ref, { slots, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  });
  return { ok: true };
});

async function assertStaff(uid: string) {
  const db = getFirestore();
  const user = await getAuth().getUser(uid);
  const email = (user.email || "").toLowerCase();
  if (OWNER_EMAILS.has(email)) return { role: "admin" as const, email };

  const snap = await db.doc(`staff/${uid}`).get();
  if (!snap.exists) {
    throw new HttpsError("permission-denied", "Staff access required.");
  }
  const data = snap.data() || {};
  if (data.status !== "approved") {
    throw new HttpsError("permission-denied", "Staff not approved.");
  }
  const role = String(data.role || "");
  if (!["admin", "manager", "driver"].includes(role)) {
    throw new HttpsError("permission-denied", "Staff role required.");
  }
  return { role, email };
}

/**
 * Drivers may charge only the order Firestore assigned to them.
 * Owners, admins, and managers are unchanged. The assignment is the stored
 * order field, never a value from the request.
 */
export function assertCallerMayChargeOrder(
  role: string,
  callerUid: string,
  order: Record<string, unknown>
) {
  if (role === "admin" || role === "manager") return;
  if (role !== "driver") {
    throw new HttpsError("permission-denied", "Staff access required.");
  }
  const assigned = order.assignedDriverUid;
  if (typeof assigned !== "string" || assigned !== callerUid) {
    throw new HttpsError("permission-denied", "This order is not assigned to you.");
  }
}

async function ensureStripeCustomer(params: {
  uid: string;
  email: string;
  name?: string;
}) {
  const db = getFirestore();
  const userRef = db.doc(`users/${params.uid}`);
  const userSnap = await userRef.get();
  const existing = userSnap.exists
    ? String(userSnap.data()?.stripeCustomerId || "")
    : "";
  const stripe = stripeClient();

  if (existing) {
    return existing;
  }

  const customer = await stripe.customers.create({
    email: params.email || undefined,
    name: params.name || undefined,
    metadata: { firebaseUid: params.uid },
  });

  await userRef.set(
    {
      stripeCustomerId: customer.id,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return customer.id;
}

/** Customer: create SetupIntent to save a card on file. */
export const createSetupIntent = onCall(async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Sign in required.");
  }

  const uid = request.auth.uid;
  const email = request.auth.token.email || "";
  const name =
    typeof request.data?.name === "string" ? request.data.name.trim() : "";

  const customerId = await ensureStripeCustomer({ uid, email, name });
  const stripe = stripeClient();
  const intent = await stripe.setupIntents.create({
    customer: customerId,
    payment_method_types: ["card"],
    usage: "off_session",
    metadata: { firebaseUid: uid },
  });

  return {
    clientSecret: intent.client_secret,
    customerId,
  };
});

/** Customer: after SetupIntent succeeds, store default payment method. */
export const confirmCardSaved = onCall(async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Sign in required.");
  }

  const setupIntentId =
    typeof request.data?.setupIntentId === "string"
      ? request.data.setupIntentId
      : "";
  if (!setupIntentId) {
    throw new HttpsError("invalid-argument", "setupIntentId required.");
  }

  const uid = request.auth.uid;
  const db = getFirestore();
  const stripe = stripeClient();
  const intent = await stripe.setupIntents.retrieve(setupIntentId, {
    expand: ["payment_method"],
  });

  if (intent.metadata?.firebaseUid && intent.metadata.firebaseUid !== uid) {
    throw new HttpsError("permission-denied", "SetupIntent mismatch.");
  }
  if (intent.status !== "succeeded" || !intent.payment_method) {
    throw new HttpsError("failed-precondition", "Card setup not complete.");
  }

  const pmId =
    typeof intent.payment_method === "string"
      ? intent.payment_method
      : intent.payment_method.id;
  const pm =
    typeof intent.payment_method === "string"
      ? await stripe.paymentMethods.retrieve(pmId)
      : intent.payment_method;

  const card = pm.card;
  const customerId =
    typeof intent.customer === "string"
      ? intent.customer
      : intent.customer?.id || "";

  if (customerId) {
    await stripe.customers.update(customerId, {
      invoice_settings: { default_payment_method: pmId },
    });
  }

  await db.doc(`users/${uid}`).set(
    {
      stripeCustomerId: customerId || FieldValue.delete(),
      stripePaymentMethodId: pmId,
      cardBrand: card?.brand || "",
      cardLast4: card?.last4 || "",
      cardExpMonth: card?.exp_month || null,
      cardExpYear: card?.exp_year || null,
      paymentUpdatedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return {
    brand: card?.brand || "",
    last4: card?.last4 || "",
    expMonth: card?.exp_month || null,
    expYear: card?.exp_year || null,
  };
});

/** Customer: remove saved card reference. */
export const removeSavedCard = onCall(async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Sign in required.");
  }

  const uid = request.auth.uid;
  const db = getFirestore();
  const userSnap = await db.doc(`users/${uid}`).get();
  const data = userSnap.data() || {};
  const pmId = String(data.stripePaymentMethodId || "");
  const stripe = stripeClient();

  if (pmId) {
    try {
      await stripe.paymentMethods.detach(pmId);
    } catch {
      /* already detached */
    }
  }

  await db.doc(`users/${uid}`).set(
    {
      stripePaymentMethodId: FieldValue.delete(),
      cardBrand: FieldValue.delete(),
      cardLast4: FieldValue.delete(),
      cardExpMonth: FieldValue.delete(),
      cardExpYear: FieldValue.delete(),
      paymentUpdatedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return { ok: true };
});

type DryItem = { name?: string; qty?: number; price?: number };

type AuthoritativeCharge = {
  finalTotal: number;
  weightLbs: number;
  dryCleanItems: DryItem[];
  promoCodeUsed?: string;
  promoDiscountAmount: number;
  promoLabel?: string;
};

function money(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function todayLasVegas() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: string) => parts.find((row) => row.type === type)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function promoIsValidAtCharge(promo: Record<string, unknown>, today: string) {
  if (promo.active === false) return false;
  if (promo.limitMode === "expires") {
    return typeof promo.expiresAt === "string" && promo.expiresAt >= today;
  }
  const maxUses = Number(promo.maxUses);
  const usedCount = Number(promo.usedCount || 0);
  return Number.isFinite(maxUses) && maxUses > 0 && usedCount < maxUses;
}

function promoDiscountForAmount(
  subtotal: number,
  fee: number,
  promo: { discountType: string; discountValue: number; includesFee: boolean }
) {
  const base = promo.includesFee ? subtotal : Math.max(0, money(subtotal - fee));
  if (promo.discountType === "percent") {
    return money(base * (Math.min(100, Math.max(0, promo.discountValue)) / 100));
  }
  return money(Math.min(base, Math.max(0, promo.discountValue)));
}

async function repeatDiscountApplies(
  db: ReturnType<typeof getFirestore>,
  orderId: string,
  order: Record<string, unknown>
) {
  const uid = typeof order.uid === "string" ? order.uid : "";
  if (!uid) return false;
  if (order.automatedWeekly === true && typeof order.sourceOrderId === "string") {
    const source = await db.doc(`orders/${order.sourceOrderId}`).get();
    return source.exists
      && source.data()?.uid === uid
      && (source.data()?.pickup as Record<string, unknown> | undefined)?.repeat === true;
  }
  const recent = await db.collection("orders")
    .where("uid", "==", uid)
    .orderBy("createdAt", "desc")
    .limit(6)
    .get();
  return recent.docs.some((row) =>
    row.id !== orderId
      && (row.data().pickup as Record<string, unknown> | undefined)?.repeat === true
  );
}

/** Derive the Stripe amount from the validated order snapshot and live catalog.
 * Caller totals and promo numbers are display hints only and never authorize a charge. */
export async function computeAuthoritativeCharge(
  db: ReturnType<typeof getFirestore>,
  orderId: string,
  order: Record<string, unknown>,
  requestData: Record<string, unknown>
): Promise<AuthoritativeCharge> {
  const services = (order.services || {}) as Record<string, unknown>;
  const pricing = (order.pricing || {}) as Record<string, unknown>;
  const hasLaundry = services.laundry === true;
  const hasDryCleaning = services.dryCleaning === true;
  if (!hasLaundry && !hasDryCleaning) {
    throw new HttpsError("failed-precondition", "Order has no billable service.");
  }

  const weightInput = Number(requestData.weightLbs ?? 0);
  if (hasLaundry && (!Number.isFinite(weightInput) || weightInput <= 0 || weightInput > 500)) {
    throw new HttpsError("invalid-argument", "Weight must be between 0 and 500 lb.");
  }
  const weightLbs = hasLaundry ? money(weightInput) : 0;

  const rawItems = Array.isArray(requestData.dryCleanItems)
    ? requestData.dryCleanItems as DryItem[]
    : [];
  if (rawItems.length > 100) {
    throw new HttpsError("invalid-argument", "Too many dry-cleaning line items.");
  }
  const catalogSnap = await db.doc("config/dryCleanCatalog").get();
  const catalogRows = catalogSnap.data()?.items;
  if (rawItems.length && (!Array.isArray(catalogRows) || catalogRows.length === 0)) {
    throw new HttpsError("failed-precondition", "Dry-cleaning catalog is unavailable.");
  }
  const catalog = new Map<string, number>();
  for (const row of Array.isArray(catalogRows) ? catalogRows : []) {
    if (!row || typeof row.name !== "string") continue;
    const price = Number(row.price);
    if (Number.isFinite(price) && price >= 0) catalog.set(row.name.trim().toLowerCase(), money(price));
  }
  const dryCleanItems = rawItems.map((item) => {
    const name = typeof item?.name === "string" ? item.name.trim() : "";
    const catalogPrice = catalog.get(name.toLowerCase());
    const submittedPrice = Number(item?.price);
    if (catalogPrice == null || !Number.isFinite(submittedPrice) || money(submittedPrice) !== catalogPrice) {
      throw new HttpsError("invalid-argument", `Dry-cleaning price does not match the catalog for ${name || "an item"}.`);
    }
    return { name, price: catalogPrice };
  });

  const tier = pricing.tier;
  const pickup = (order.pickup || {}) as Record<string, unknown>;
  if (tier !== (pickup.repeat === true ? "weekly" : "standard")) {
    throw new HttpsError("failed-precondition", "Order rate tier does not match its pickup plan.");
  }
  const ratesSnap = await db.doc("config/laundryRates").get();
  const liveRates = ratesSnap.data() || {};
  const rate = Number(tier === "weekly" ? liveRates.weeklyPerLb : liveRates.standardPerLb);
  const fee = Number(liveRates.deliveryFee);
  const minimum = Number(liveRates.minimumOrder);
  const snapshotRate = Number(pricing.laundryRatePerLb);
  const snapshotFee = Number(pricing.deliveryFee);
  const snapshotMinimum = Number(pricing.minimumOrder);
  const tip = Number(order.tip ?? pricing.tip ?? 0);
  if (![rate, fee, minimum, tip].every(Number.isFinite)
    || rate <= 0 || rate >= 100 || fee < 0 || fee >= 100
    || minimum <= 0 || minimum >= 1000 || tip < 0 || tip > 500) {
    throw new HttpsError("failed-precondition", "Current order pricing is unavailable or invalid.");
  }
  if (money(snapshotRate) !== money(rate)
    || money(snapshotFee) !== money(fee)
    || money(snapshotMinimum) !== money(minimum)) {
    throw new HttpsError("failed-precondition", "Order pricing changed. Refresh and recalculate before charging.");
  }
  const discountApplies = await repeatDiscountApplies(db, orderId, order);
  const discountPercent = Number(pricing.repeatDiscountPercent);
  if (Boolean(pricing.repeatDiscountEligible) !== discountApplies
    || discountPercent !== (discountApplies ? 10 : 0)) {
    await db.doc(`orders/${orderId}`).set({
      "pricing.repeatDiscountEligible": discountApplies,
      "pricing.repeatDiscountPercent": discountApplies ? 10 : 0,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    throw new HttpsError("failed-precondition", "Repeat discount was recalculated. Refresh the order and confirm the updated total before charging.");
  }

  let laundryCharge = 0;
  if (hasLaundry) {
    laundryCharge = money(weightLbs * rate * (1 - discountPercent / 100));
    laundryCharge = Math.max(laundryCharge, minimum);
  }
  const dryRaw = money(dryCleanItems.reduce((sum, item) => sum + Number(item.price || 0), 0));
  const dryCharge = !hasDryCleaning && dryRaw === 0
    ? 0
    : hasLaundry ? dryRaw : Math.max(dryRaw, 50);
  const feeCharge = fee;
  const subtotal = money(laundryCharge + dryCharge + feeCharge);

  let promoCodeUsed = "";
  let promoDiscountAmount = 0;
  let promoLabel = "";
  const promoCode = String(order.promoCode || pricing.promoCode || "").trim();
  if (promoCode) {
    const promoSnap = await db.doc(`promoCodes/${promoCode}`).get();
    if (!promoSnap.exists) {
      throw new HttpsError("failed-precondition", "Promo code is no longer available. Refresh the order before charging.");
    }
    const data = promoSnap.data() || {};
    const value = Number(data.discountValue);
    if (!promoIsValidAtCharge(data, todayLasVegas())
      || (data.discountType !== "percent" && data.discountType !== "fixed")
      || !Number.isFinite(value)
      || value <= 0) {
      throw new HttpsError("failed-precondition", "Promo code is no longer active. Refresh the order before charging.");
    }
    const promo = {
      discountType: String(data.discountType),
      discountValue: value,
      includesFee: data.includesFee === true,
    };
    promoDiscountAmount = promoDiscountForAmount(subtotal, feeCharge, promo);
    const base = promo.discountType === "percent"
      ? `${promo.discountValue}% off`
      : `$${promo.discountValue.toFixed(2)} off`;
    promoLabel = `${base} (${promo.includesFee ? "incl." : "excl."} fee)`;
    promoCodeUsed = String(data.code || promoCode);
  }
  const finalTotal = money(subtotal - promoDiscountAmount + tip);
  const submittedTotal = Number(requestData.finalTotal);
  if (!Number.isFinite(submittedTotal) || Math.abs(money(submittedTotal) - finalTotal) >= 0.01) {
    throw new HttpsError("failed-precondition", `Order total is $${finalTotal.toFixed(2)}. Refresh and recalculate before charging.`);
  }
  return { finalTotal, weightLbs, dryCleanItems, promoCodeUsed: promoCodeUsed || undefined, promoDiscountAmount, promoLabel: promoLabel || undefined };
}

/** Claim the order before talking to Stripe so concurrent staff calls cannot
 * create different payment intents for different submitted amounts. */
async function acquireChargeLock(
  orderRef: ReturnType<ReturnType<typeof getFirestore>["doc"]>,
  orderId: string,
  verifiedPaymentIntentId: string,
  attemptFingerprint: string
): Promise<string> {
  const db = getFirestore();
  let attemptId = "";
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(orderRef);
    if (!snap.exists) throw new HttpsError("not-found", "Order not found.");
    const current = snap.data() || {};
    if (current.refundAttemptFingerprint) {
      throw new HttpsError("failed-precondition", "A refund attempt is unresolved. Retry it before charging this order.");
    }
    const billingSnap = await tx.get(db.doc(`orderBilling/${orderId}`));
    const billing = billingFromData(
      billingSnap.exists ? (billingSnap.data() as Record<string, unknown>) : undefined
    );
    const currentPaymentIntentId = selectPaymentIntentId(billing, current);
    if (currentPaymentIntentId !== verifiedPaymentIntentId) {
      throw new HttpsError(
        "failed-precondition",
        "Payment state changed while charging. Refresh the order and retry."
      );
    }
    const lockAt = current.chargeLockAt as { toDate?: () => Date } | undefined;
    if (lockAt?.toDate) {
      const ageMs = Date.now() - lockAt.toDate().getTime();
      if (ageMs >= 0 && ageMs < 90_000) {
        throw new HttpsError(
          "failed-precondition",
          "Charge already in progress. Wait a moment, then refresh."
        );
      }
    }
    const previousFingerprint = String(current.chargeAttemptFingerprint || "");
    if (previousFingerprint && previousFingerprint !== attemptFingerprint) {
      throw new HttpsError(
        "failed-precondition",
        "A previous charge attempt is unresolved. Retry it with the same order details first."
      );
    }
    attemptId = String(current.chargeAttemptId || "") || randomUUID();
    tx.set(
      orderRef,
      {
        chargeLockAt: FieldValue.serverTimestamp(),
        chargeAttemptId: attemptId,
        chargeAttemptFingerprint: attemptFingerprint,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  });
  return attemptId;
}

/** Serialize refunds and reuse the same Stripe keys after an uncertain retry. */
export async function acquireRefundLock(
  orderRef: ReturnType<ReturnType<typeof getFirestore>["doc"]>,
  attemptFingerprint: string,
  expectedLedger: ChargeLedgerEntry[]
): Promise<string> {
  let attemptId = "";
  await getFirestore().runTransaction(async (tx) => {
    const snap = await tx.get(orderRef);
    if (!snap.exists) throw new HttpsError("not-found", "Order not found.");
    const current = snap.data() || {};
    if (current.chargeAttemptFingerprint) {
      throw new HttpsError("failed-precondition", "A charge attempt is unresolved. Retry it before refunding this order.");
    }
    const billingSnap = await tx.get(getFirestore().doc(`orderBilling/${orderRef.id}`));
    const billing = billingFromData(
      billingSnap.exists ? (billingSnap.data() as Record<string, unknown>) : undefined
    );
    const currentLedger = resolveChargeLedger(billing, current);
    const sameLedger = currentLedger.length === expectedLedger.length
      && currentLedger.every((row, index) =>
        row.paymentIntentId === expectedLedger[index]?.paymentIntentId
          && money(row.amount) === money(expectedLedger[index]?.amount)
          && money(row.refunded) === money(expectedLedger[index]?.refunded)
      );
    if (!sameLedger) {
      throw new HttpsError("failed-precondition", "Payment ledger changed while preparing the refund. Refresh and retry.");
    }
    const lockAt = current.refundLockAt as { toDate?: () => Date } | undefined;
    if (lockAt?.toDate) {
      const ageMs = Date.now() - lockAt.toDate().getTime();
      if (ageMs >= 0 && ageMs < 90_000) {
        throw new HttpsError("failed-precondition", "Refund already in progress. Wait a moment, then refresh.");
      }
    }
    const previousFingerprint = String(current.refundAttemptFingerprint || "");
    if (previousFingerprint && previousFingerprint !== attemptFingerprint) {
      throw new HttpsError("failed-precondition", "A previous refund attempt is unresolved. Retry it with the same details first.");
    }
    attemptId = String(current.refundAttemptId || "") || randomUUID();
    tx.set(orderRef, {
      refundLockAt: FieldValue.serverTimestamp(),
      refundAttemptId: attemptId,
      refundAttemptFingerprint: attemptFingerprint,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  });
  return attemptId;
}

/** Block new charges when paid, or when an in-flight PI already succeeded/processing. */
async function guardAgainstDoubleCharge(
  stripe: Stripe,
  order: Record<string, unknown>,
  billing: { stripePaymentIntentId?: string; chargeLedger?: unknown } | null | undefined
): Promise<{ ok: true } | { ok: false; message: string; paymentIntentId?: string }> {
  const lockAt = order.chargeLockAt as { toDate?: () => Date } | undefined;
  if (lockAt && typeof lockAt.toDate === "function") {
    const ageMs = Date.now() - lockAt.toDate().getTime();
    if (ageMs >= 0 && ageMs < 90_000) {
      return {
        ok: false,
        message: "Charge already in progress. Wait a moment, then refresh.",
      };
    }
  }

  const candidateIds = collectPaymentIntentIds(billing, order);
  if (candidateIds.length > 100) {
    return { ok: false, message: "Too many payment attempts to verify. Contact an administrator." };
  }
  for (const piId of candidateIds) {
    let pi: Stripe.PaymentIntent;
    try {
      pi = await stripe.paymentIntents.retrieve(piId);
    } catch {
      return {
        ok: false,
        message: "Could not verify the previous Stripe payment. Retry after checking payment status.",
      };
    }
    if (pi.status === "succeeded" || pi.status === "processing") {
      return {
        ok: false,
        message: "Order already charged.",
        ...(pi.metadata?.chargeMode === "top_up" ? {} : { paymentIntentId: pi.id }),
      };
    }
    if (["requires_payment_method", "requires_confirmation", "requires_action", "requires_capture"].includes(pi.status)) {
      await stripe.paymentIntents.cancel(piId).catch(() => undefined);
    }
  }
  return { ok: true };
}

async function writeTrackWashing(
  db: ReturnType<typeof getFirestore>,
  order: Record<string, unknown>,
  finalTotal: number,
  weightLbs: number
) {
  const trackKey = typeof order.trackKey === "string" ? order.trackKey : "";
  if (!trackKey) return;
  await db
    .doc(`orderTracks/${trackKey}`)
    .set(
      {
        status: "washing",
        finalTotal,
        ...(Number.isFinite(weightLbs) && weightLbs > 0 ? { weightLbs } : {}),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    )
    .catch(() => undefined);
}

/** Apply paid/processing charge + move order to laundry (shared by finalize + webhook). */
async function applyPaidChargeToOrder(opts: {
  db: ReturnType<typeof getFirestore>;
  orderId: string;
  order: Record<string, unknown>;
  paymentIntent: Stripe.PaymentIntent;
  staffEmail: string;
  chargedOnSpot?: boolean;
  weightLbs?: number;
  dryCleanItems?: DryItem[];
  finalTotal?: number;
  promoCodeUsed?: string;
  promoDiscountAmount?: number;
  promoLabel?: string;
}) {
  const {
    db,
    orderId,
    order,
    paymentIntent,
    staffEmail,
    chargedOnSpot = false,
  } = opts;

  const pending =
    order.pendingOnSpotCharge && typeof order.pendingOnSpotCharge === "object"
      ? (order.pendingOnSpotCharge as Record<string, unknown>)
      : {};

  const weightLbs = Number(
    opts.weightLbs ?? pending.weightLbs ?? order.weightLbs ?? 0
  );
  const dryCleanItems: DryItem[] = Array.isArray(opts.dryCleanItems)
    ? opts.dryCleanItems
    : Array.isArray(pending.dryCleanItems)
      ? (pending.dryCleanItems as DryItem[])
      : Array.isArray(order.dryCleanItems)
        ? (order.dryCleanItems as DryItem[])
        : [];
  const finalTotal = Number(
    opts.finalTotal ??
      pending.finalTotal ??
      order.finalTotal ??
      paymentIntent.amount / 100
  );
  const promoCodeUsed = String(
    opts.promoCodeUsed ?? pending.promoCodeUsed ?? ""
  );
  const promoOff = Number(
    opts.promoDiscountAmount ?? pending.promoDiscountAmount ?? 0
  );
  const promoLabel = String(opts.promoLabel ?? pending.promoLabel ?? "");

  const paid = paymentIntent.status === "succeeded";
  const stripe = stripeClient();
  const pm = paymentIntent.payment_method;
  let card: Stripe.PaymentMethod.Card | null | undefined = null;
  let pmId = "";
  if (pm) {
    const pmObj =
      typeof pm === "string" ? await stripe.paymentMethods.retrieve(pm) : pm;
    card = pmObj.card;
    pmId = pmObj.id;
  }
  const customerId =
    typeof paymentIntent.customer === "string"
      ? paymentIntent.customer
      : paymentIntent.customer?.id || "";

  const patch: Record<string, unknown> = {
    ...(Number.isFinite(weightLbs) && weightLbs > 0 ? { weightLbs } : {}),
    dryCleanItems,
    finalTotal,
    status: "washing",
    "pricing.finalTotalPending": false,
    paymentStatus: paid ? "paid" : "pending",
    paymentError: FieldValue.delete(),
    pendingOnSpotCharge: FieldValue.delete(),
    chargeLockAt: FieldValue.delete(),
    chargeAttemptId: FieldValue.delete(),
    chargeAttemptFingerprint: FieldValue.delete(),
    ...(chargedOnSpot || paymentIntent.metadata?.chargeMode === "on_spot"
      ? { chargedOnSpot: true }
      : {}),
    paidAt: paid ? FieldValue.serverTimestamp() : null,
    chargedBy: staffEmail || paymentIntent.metadata?.chargedBy || "",
    statusUpdatedAt: FieldValue.serverTimestamp(),
    lastUpdatedBy: staffEmail || paymentIntent.metadata?.chargedBy || "stripe",
    updatedAt: FieldValue.serverTimestamp(),
  };

  const billing = await readOrderBilling(db, orderId);
  let nextLedger: ChargeLedgerEntry[] | undefined;
  if (paid) {
    const chargedUsd =
      Math.round((paymentIntent.amount || Math.round(finalTotal * 100)) ) / 100;
    const ledger = resolveChargeLedger(billing, order);
    const already = ledger.some((row) => row.paymentIntentId === paymentIntent.id);
    nextLedger = already
      ? ledger
      : [
          ...ledger,
          {
            paymentIntentId: paymentIntent.id,
            amount: chargedUsd,
            refunded: 0,
          },
        ];
  }

  if (promoCodeUsed && promoOff > 0) {
    patch["pricing.promoApplied"] = true;
    patch["pricing.promoDiscountAmount"] = promoOff;
    patch["pricing.promoLabel"] = promoLabel;
  }

  await db.doc(`orders/${orderId}`).set(patch, { merge: true });
  await mergeOrderBilling(db, orderId, {
    stripeCustomerId: customerId,
    stripePaymentMethodId: pmId,
    cardBrand: card?.brand || "",
    cardLast4: card?.last4 || "",
    cardExpMonth: card?.exp_month ?? null,
    cardExpYear: card?.exp_year ?? null,
    stripePaymentIntentId: paymentIntent.id,
    chargeLedger: nextLedger,
  });
  await writeTrackWashing(db, order, finalTotal, weightLbs);

  return {
    ok: true as const,
    paymentStatus: (paid ? "paid" : "pending") as "paid" | "pending",
    paymentIntentId: paymentIntent.id,
    finalTotal,
  };
}

type ChargeLedgerEntry = {
  paymentIntentId: string;
  amount: number;
  refunded: number;
};

function parseChargeLedger(raw: unknown): ChargeLedgerEntry[] {
  if (!Array.isArray(raw) || raw.length === 0) return [];
  return raw
    .map((row) => {
      const item = row && typeof row === "object" ? (row as Record<string, unknown>) : {};
      const paymentIntentId = String(item.paymentIntentId || "");
      const amount =
        typeof item.amount === "number" && Number.isFinite(item.amount)
          ? Math.round(item.amount * 100) / 100
          : 0;
      const refunded =
        typeof item.refunded === "number" && Number.isFinite(item.refunded)
          ? Math.round(item.refunded * 100) / 100
          : 0;
      return { paymentIntentId, amount, refunded };
    })
    .filter((row) => row.paymentIntentId && row.amount > 0);
}

function normalizeChargeLedger(order: Record<string, unknown>): ChargeLedgerEntry[] {
  const parsed = parseChargeLedger(order.chargeLedger);
  if (parsed.length > 0) return parsed;

  const piId = String(order.stripePaymentIntentId || "");
  if (!piId) return [];
  const charged =
    typeof order.finalTotal === "number" && Number.isFinite(order.finalTotal)
      ? Math.round(order.finalTotal * 100) / 100
      : 0;
  const refunded =
    typeof order.refundAmount === "number" && Number.isFinite(order.refundAmount)
      ? Math.round(order.refundAmount * 100) / 100
      : 0;
  if (charged < 0.01) return [];
  return [
    {
      paymentIntentId: piId,
      amount: charged,
      refunded: Math.min(refunded, charged),
    },
  ];
}

export function selectPaymentIntentId(
  billing: { stripePaymentIntentId?: unknown } | null | undefined,
  legacy: { stripePaymentIntentId?: unknown } | null | undefined
) {
  return billingText(billing?.stripePaymentIntentId) || billingText(legacy?.stripePaymentIntentId);
}

export function resolveChargeLedger(
  billing: { chargeLedger?: unknown } | null | undefined,
  legacy: Record<string, unknown>
) {
  const fromBilling = parseChargeLedger(billing?.chargeLedger);
  if (fromBilling.length > 0) return fromBilling;
  return normalizeChargeLedger(legacy);
}

export function collectPaymentIntentIds(
  billing: { stripePaymentIntentId?: unknown; chargeLedger?: unknown } | null | undefined,
  legacy: Record<string, unknown>
) {
  return [...new Set([
    billingText(billing?.stripePaymentIntentId),
    billingText(legacy.stripePaymentIntentId),
    ...parseChargeLedger(billing?.chargeLedger).map((row) => row.paymentIntentId),
    ...parseChargeLedger(legacy.chargeLedger).map((row) => row.paymentIntentId),
  ].filter(Boolean))];
}

async function verifyChargeLedger(
  stripe: Stripe,
  orderId: string,
  ledger: ChargeLedgerEntry[]
) {
  if (ledger.length === 0) {
    throw new HttpsError("failed-precondition", "No recorded Stripe charge to verify.");
  }
  let total = 0;
  for (const entry of ledger) {
    let intent: Stripe.PaymentIntent;
    try {
      intent = await stripe.paymentIntents.retrieve(entry.paymentIntentId);
    } catch {
      throw new HttpsError("failed-precondition", "Could not verify the order's Stripe charge ledger.");
    }
    if (intent.status !== "succeeded"
      || intent.metadata?.orderId !== orderId
      || money(intent.amount / 100) !== entry.amount
      || entry.refunded < 0
      || entry.refunded > entry.amount) {
      throw new HttpsError("failed-precondition", "Stripe charge ledger does not match successful payments for this order.");
    }
    total += entry.amount;
  }
  return money(total);
}

function billingText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function billingExp(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function selectGuestPaymentIds(
  billing: { stripeCustomerId?: string; stripePaymentMethodId?: string } | null | undefined,
  legacy: { stripeCustomerId?: unknown; stripePaymentMethodId?: unknown } | null | undefined
) {
  return {
    customerId: billingText(billing?.stripeCustomerId) || billingText(legacy?.stripeCustomerId),
    paymentMethodId:
      billingText(billing?.stripePaymentMethodId) || billingText(legacy?.stripePaymentMethodId),
  };
}

function billingFromData(data: Record<string, unknown> | undefined) {
  return {
    stripeCustomerId: billingText(data?.stripeCustomerId),
    stripePaymentMethodId: billingText(data?.stripePaymentMethodId),
    cardBrand: billingText(data?.cardBrand),
    cardLast4: billingText(data?.cardLast4),
    cardExpMonth: billingExp(data?.cardExpMonth),
    cardExpYear: billingExp(data?.cardExpYear),
    stripePaymentIntentId: billingText(data?.stripePaymentIntentId),
    chargeLedger: parseChargeLedger(data?.chargeLedger),
  };
}

async function readOrderBilling(db: ReturnType<typeof getFirestore>, orderId: string) {
  const snap = await db.doc(`orderBilling/${orderId}`).get();
  return billingFromData(snap.exists ? (snap.data() as Record<string, unknown>) : undefined);
}

async function mergeOrderBilling(
  db: ReturnType<typeof getFirestore>,
  orderId: string,
  fields: {
    stripeCustomerId?: string;
    stripePaymentMethodId?: string;
    cardBrand?: string;
    cardLast4?: string;
    cardExpMonth?: number | null;
    cardExpYear?: number | null;
    stripePaymentIntentId?: string;
    chargeLedger?: ChargeLedgerEntry[];
  }
) {
  const patch: Record<string, unknown> = {
    updatedAt: FieldValue.serverTimestamp(),
  };
  const customerId = billingText(fields.stripeCustomerId);
  const paymentMethodId = billingText(fields.stripePaymentMethodId);
  const cardBrand = billingText(fields.cardBrand);
  const cardLast4 = billingText(fields.cardLast4);
  if (customerId) patch.stripeCustomerId = customerId;
  if (paymentMethodId) patch.stripePaymentMethodId = paymentMethodId;
  if (cardBrand) patch.cardBrand = cardBrand;
  if (cardLast4) patch.cardLast4 = cardLast4;
  if (fields.cardExpMonth != null) patch.cardExpMonth = fields.cardExpMonth;
  if (fields.cardExpYear != null) patch.cardExpYear = fields.cardExpYear;
  const paymentIntentId = billingText(fields.stripePaymentIntentId);
  if (paymentIntentId) patch.stripePaymentIntentId = paymentIntentId;
  if (fields.chargeLedger && fields.chargeLedger.length > 0) {
    patch.chargeLedger = fields.chargeLedger;
  }
  if (Object.keys(patch).length < 2) return;
  await db.doc(`orderBilling/${orderId}`).set(patch, { merge: true });
}

async function resolveOrderCard(order: Record<string, unknown>, orderId: string) {
  const db = getFirestore();
  const customerUid = typeof order.uid === "string" ? order.uid : "";
  let customerId = "";
  let paymentMethodId = "";

  if (customerUid) {
    const userSnap = await db.doc(`users/${customerUid}`).get();
    if (!userSnap.exists) {
      throw new HttpsError(
        "failed-precondition",
        "Customer profile missing. Customer must save a card first."
      );
    }
    const user = userSnap.data() || {};
    customerId = String(user.stripeCustomerId || "");
    paymentMethodId = String(user.stripePaymentMethodId || "");
  } else {
    const billing = await readOrderBilling(db, orderId);
    const selected = selectGuestPaymentIds(billing, order);
    customerId = selected.customerId;
    paymentMethodId = selected.paymentMethodId;
  }

  if (!customerId || !paymentMethodId) {
    throw new HttpsError(
      "failed-precondition",
      customerUid
        ? "No card on file. Customer must add a card in Account → Payments."
        : "Guest order has no card on file. Use Charge different card on the spot."
    );
  }

  const stripe = stripeClient();
  const [customer, paymentMethod] = await Promise.all([
    stripe.customers.retrieve(customerId),
    stripe.paymentMethods.retrieve(paymentMethodId),
  ]);
  const attachedCustomerId =
    typeof paymentMethod.customer === "string"
      ? paymentMethod.customer
      : paymentMethod.customer?.id || "";
  if (customer.deleted || attachedCustomerId !== customerId) {
    throw new HttpsError(
      "failed-precondition",
      "Saved payment method is not attached to its customer."
    );
  }
  const expectedOwner = customerUid
    ? customer.metadata?.firebaseUid === customerUid
    : customer.metadata?.foamGuest === "true";
  if (!expectedOwner) {
    throw new HttpsError(
      "permission-denied",
      "Saved payment method does not belong to this order's customer."
    );
  }

  return { customerUid, customerId, paymentMethodId };
}

/** Guest booking: create SetupIntent without Firebase Auth. */
export const createGuestSetupIntent = onCall(async (request) => {
  const email =
    typeof request.data?.email === "string"
      ? request.data.email.trim().toLowerCase()
      : "";
  const name =
    typeof request.data?.name === "string" ? request.data.name.trim() : "";
  if (!email || !email.includes("@") || email.length > 200 || name.length > 120) {
    throw new HttpsError("invalid-argument", "Valid email required.");
  }
  await limitGuestCaller(request, "guest-setup", 20, 60 * 60 * 1000);
  await consumeRateLimit(
    getFirestore(),
    `guest-email:${createHash("sha256").update(email).digest("hex").slice(0, 32)}`,
    5,
    60 * 60 * 1000
  );

  const stripe = stripeClient();
  const customer = await stripe.customers.create({
    email,
    name: name || undefined,
    metadata: { foamGuest: "true" },
  });
  const intent = await stripe.setupIntents.create({
    customer: customer.id,
    payment_method_types: ["card"],
    usage: "off_session",
    metadata: {
      foamGuest: "true",
      guestEmail: email,
    },
  });

  return {
    clientSecret: intent.client_secret,
  };
});

/** Guest booking: confirm SetupIntent and return card + Stripe ids for the order. */
export const confirmGuestCardSaved = onCall(async (request) => {
  await limitGuestCaller(request, "guest-confirm", 30, 60 * 60 * 1000);
  const setupIntentId =
    typeof request.data?.setupIntentId === "string"
      ? request.data.setupIntentId
      : "";
  if (!setupIntentId) {
    throw new HttpsError("invalid-argument", "setupIntentId required.");
  }

  const stripe = stripeClient();
  const intent = await stripe.setupIntents.retrieve(setupIntentId, {
    expand: ["payment_method"],
  });

  if (intent.metadata?.foamGuest !== "true") {
    throw new HttpsError("permission-denied", "Not a guest SetupIntent.");
  }
  if (intent.status !== "succeeded" || !intent.payment_method) {
    throw new HttpsError("failed-precondition", "Card setup not complete.");
  }

  const pmId =
    typeof intent.payment_method === "string"
      ? intent.payment_method
      : intent.payment_method.id;
  const pm =
    typeof intent.payment_method === "string"
      ? await stripe.paymentMethods.retrieve(pmId)
      : intent.payment_method;
  const customerId =
    typeof intent.customer === "string"
      ? intent.customer
      : intent.customer?.id || "";

  if (customerId) {
    await stripe.customers.update(customerId, {
      invoice_settings: { default_payment_method: pmId },
    });
  }

  return {
    brand: pm.card?.brand || "",
    last4: pm.card?.last4 || "",
    expMonth: pm.card?.exp_month || null,
    expYear: pm.card?.exp_year || null,
  };
});

async function guestOrderForSetupIntent(orderId: string, setupIntentId: string) {
  if (!orderId || !setupIntentId) {
    throw new HttpsError("invalid-argument", "orderId and setupIntentId required.");
  }
  const db = getFirestore();
  const orderSnap = await db.doc(`orders/${orderId}`).get();
  if (!orderSnap.exists) {
    throw new HttpsError("not-found", "Order not found.");
  }
  const order = orderSnap.data() || {};
  if (order.guest !== true || (typeof order.uid === "string" && order.uid)) {
    throw new HttpsError("permission-denied", "Guest order required.");
  }
  const createdRaw = order.createdAt as { toDate?: () => Date } | undefined;
  const createdAt = createdRaw?.toDate?.();
  if (!createdAt || Date.now() - createdAt.getTime() > 30 * 60 * 1000) {
    throw new HttpsError("failed-precondition", "Guest card attachment window has closed.");
  }
  const contact =
    order.contact && typeof order.contact === "object"
      ? (order.contact as Record<string, unknown>)
      : {};
  const orderEmail = billingText(contact.email).toLowerCase();
  const stripe = stripeClient();
  const intent = await stripe.setupIntents.retrieve(setupIntentId, {
    expand: ["payment_method"],
  });
  if (intent.metadata?.foamGuest !== "true") {
    throw new HttpsError("permission-denied", "Not a guest SetupIntent.");
  }
  const intentEmail = billingText(intent.metadata?.guestEmail).toLowerCase();
  if (!orderEmail || !intentEmail || intentEmail !== orderEmail) {
    throw new HttpsError("permission-denied", "Guest card does not match this order.");
  }
  return { db, order, intent };
}

/** Guest booking: store the confirmed card on orderBilling, not on the order. */
export const attachGuestOrderBilling = onCall(async (request) => {
  await limitGuestCaller(request, "guest-attach", 20, 60 * 60 * 1000);
  const orderId = typeof request.data?.orderId === "string" ? request.data.orderId : "";
  const setupIntentId =
    typeof request.data?.setupIntentId === "string" ? request.data.setupIntentId : "";
  const { db, intent } = await guestOrderForSetupIntent(orderId, setupIntentId);
  if (intent.status !== "succeeded" || !intent.payment_method) {
    throw new HttpsError("failed-precondition", "Card setup not complete.");
  }
  const pmId =
    typeof intent.payment_method === "string"
      ? intent.payment_method
      : intent.payment_method.id;
  const pm =
    typeof intent.payment_method === "string"
      ? await stripeClient().paymentMethods.retrieve(pmId)
      : intent.payment_method;
  const customerId =
    typeof intent.customer === "string" ? intent.customer : intent.customer?.id || "";
  const existing = await readOrderBilling(db, orderId);
  if (
    existing.stripePaymentMethodId &&
    existing.stripePaymentMethodId !== pmId
  ) {
    throw new HttpsError("already-exists", "This order already has a card on file.");
  }
  await mergeOrderBilling(db, orderId, {
    stripeCustomerId: customerId,
    stripePaymentMethodId: pmId,
    cardBrand: pm.card?.brand || "",
    cardLast4: pm.card?.last4 || "",
    cardExpMonth: pm.card?.exp_month ?? null,
    cardExpYear: pm.card?.exp_year ?? null,
  });
  return { ok: true as const };
});

/** Guest booking rollback when the card could not be stored. */
export const discardUnbilledGuestOrder = onCall(async (request) => {
  await limitGuestCaller(request, "guest-discard", 20, 60 * 60 * 1000);
  const orderId = typeof request.data?.orderId === "string" ? request.data.orderId : "";
  const setupIntentId =
    typeof request.data?.setupIntentId === "string" ? request.data.setupIntentId : "";
  const { db, order } = await guestOrderForSetupIntent(orderId, setupIntentId);
  if (order.status !== "new") {
    throw new HttpsError("failed-precondition", "Only a new guest order can be discarded.");
  }
  const existing = await readOrderBilling(db, orderId);
  if (existing.stripePaymentMethodId) {
    throw new HttpsError("failed-precondition", "Guest order already has billing.");
  }
  await deleteOrderDependents(db, orderId, order);
  await db.doc(`orders/${orderId}`).delete();
  return { ok: true as const };
});

/**
 * Owner-only copy of legacy order payment metadata into orderBilling.
 * Does not delete the fields on the order. Defaults to a dry run.
 */
export const backfillOrderBilling = onCall({ timeoutSeconds: 300 }, async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Sign in required.");
  }
  const email = String(request.auth.token.email || "").toLowerCase();
  if (!OWNER_EMAILS.has(email)) {
    throw new HttpsError("permission-denied", "Owner access required.");
  }
  const dryRun = request.data?.dryRun !== false;
  const db = getFirestore();
  const snap = await db.collection("orders").select(
    "status",
    "paymentStatus",
    "guest",
    "uid",
    "stripeCustomerId",
    "stripePaymentMethodId",
    "cardBrand",
    "cardLast4",
    "cardExpMonth",
    "cardExpYear",
    "stripePaymentIntentId",
    "chargeLedger",
    "finalTotal",
    "refundAmount"
  ).get();
  let withLegacy = 0;
  let activeGuestDependents = 0;
  let copied = 0;
  let alreadyComplete = 0;
  let conflicts = 0;
  let paymentIntentIdsCopied = 0;
  let ledgersCopied = 0;
  for (const orderDoc of snap.docs) {
    const data = orderDoc.data() as Record<string, unknown>;
    const legacy = billingFromData(data);
    const legacyLedger = parseChargeLedger(data.chargeLedger);
    const hasLegacy = Boolean(
      legacy.stripeCustomerId ||
      legacy.stripePaymentMethodId ||
      legacy.cardBrand ||
      legacy.cardLast4 ||
      legacy.cardExpMonth != null ||
      legacy.cardExpYear != null ||
      legacy.stripePaymentIntentId ||
      legacyLedger.length > 0
    );
    if (!hasLegacy) continue;
    withLegacy += 1;
    const status = billingText(data.status);
    const paymentStatus = billingText(data.paymentStatus);
    const guest = data.guest === true || !billingText(data.uid);
    const open = status !== "delivered" && status !== "cancelled" && paymentStatus !== "paid";
    if (guest && open && (legacy.stripeCustomerId || legacy.stripePaymentMethodId)) {
      activeGuestDependents += 1;
    }
    const existing = await readOrderBilling(db, orderDoc.id);
    const pmConflict = Boolean(
      existing.stripePaymentMethodId &&
      legacy.stripePaymentMethodId &&
      existing.stripePaymentMethodId !== legacy.stripePaymentMethodId
    );
    const customerConflict = Boolean(
      existing.stripeCustomerId &&
      legacy.stripeCustomerId &&
      existing.stripeCustomerId !== legacy.stripeCustomerId
    );
    const paymentIntentConflict = Boolean(
      existing.stripePaymentIntentId &&
      legacy.stripePaymentIntentId &&
      existing.stripePaymentIntentId !== legacy.stripePaymentIntentId
    );
    if (pmConflict || customerConflict || paymentIntentConflict) {
      conflicts += 1;
      continue;
    }
    const copyPaymentIntent = !existing.stripePaymentIntentId && Boolean(legacy.stripePaymentIntentId);
    const copyLedger = existing.chargeLedger.length === 0 && legacyLedger.length > 0;
    const missing =
      (!existing.stripeCustomerId && legacy.stripeCustomerId) ||
      (!existing.stripePaymentMethodId && legacy.stripePaymentMethodId) ||
      (!existing.cardBrand && legacy.cardBrand) ||
      (!existing.cardLast4 && legacy.cardLast4) ||
      (existing.cardExpMonth == null && legacy.cardExpMonth != null) ||
      (existing.cardExpYear == null && legacy.cardExpYear != null) ||
      copyPaymentIntent ||
      copyLedger;
    if (!missing) {
      alreadyComplete += 1;
      continue;
    }
    if (!dryRun) {
      await mergeOrderBilling(db, orderDoc.id, {
        stripeCustomerId: existing.stripeCustomerId ? "" : legacy.stripeCustomerId,
        stripePaymentMethodId: existing.stripePaymentMethodId ? "" : legacy.stripePaymentMethodId,
        cardBrand: existing.cardBrand ? "" : legacy.cardBrand,
        cardLast4: existing.cardLast4 ? "" : legacy.cardLast4,
        cardExpMonth: existing.cardExpMonth == null ? legacy.cardExpMonth : null,
        cardExpYear: existing.cardExpYear == null ? legacy.cardExpYear : null,
        stripePaymentIntentId: copyPaymentIntent ? legacy.stripePaymentIntentId : "",
        chargeLedger: copyLedger ? legacyLedger : undefined,
      });
      copied += 1;
      if (copyPaymentIntent) paymentIntentIdsCopied += 1;
      if (copyLedger) ledgersCopied += 1;
    }
  }
  return {
    dryRun,
    scanned: snap.size,
    withLegacy,
    activeGuestDependents,
    copied,
    alreadyComplete,
    conflicts,
    paymentIntentIdsCopied,
    ledgersCopied,
  };
});
/**
 * Receipt address from Auth, the user profile, or the email stored on the order.
 * Payment requests cannot supply a different address.
 */
async function orderReceiptEmail(order: Record<string, unknown>): Promise<string | null> {
  const contact =
    order.contact && typeof order.contact === "object"
      ? (order.contact as Record<string, unknown>)
      : {};
  const contactEmail =
    (typeof contact.email === "string" ? contact.email : "") ||
    (typeof order.email === "string" ? order.email : "");
  const uid = typeof order.uid === "string" ? order.uid.trim() : "";
  let authEmail = "";
  let authEmailVerified = false;
  let profileEmail = "";
  if (uid) {
    try {
      const user = await getAuth().getUser(uid);
      authEmail = user.email || "";
      authEmailVerified = user.emailVerified === true;
    } catch {
      authEmail = "";
    }
    try {
      const profile = await getFirestore().doc(`users/${uid}`).get();
      const stored = profile.data()?.email;
      profileEmail = typeof stored === "string" ? stored : "";
    } catch {
      profileEmail = "";
    }
  }
  return resolveReceiptEmail({
    accountUid: uid,
    authEmail,
    authEmailVerified,
    profileEmail,
    orderContactEmail: contactEmail,
  });
}

/**
 * Staff: charge card on file after weigh, then mark order paid + at laundry.
 */
export const chargeOrder = onCall(async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Sign in required.");
  }

  const staff = await assertStaff(request.auth.uid);
  const orderId =
    typeof request.data?.orderId === "string" ? request.data.orderId : "";
  if (!orderId) {
    throw new HttpsError("invalid-argument", "orderId required.");
  }

  const db = getFirestore();
  const orderRef = db.doc(`orders/${orderId}`);
  const orderSnap = await orderRef.get();
  if (!orderSnap.exists) {
    throw new HttpsError("not-found", "Order not found.");
  }
  const order = orderSnap.data() || {};
  assertCallerMayChargeOrder(staff.role, request.auth.uid, order);
  const {
    weightLbs,
    dryCleanItems,
    finalTotal,
    promoCodeUsed,
    promoDiscountAmount,
    promoLabel,
  } = await computeAuthoritativeCharge(db, orderId, order, request.data || {});
  const stripe = stripeClient();
  const billing = await readOrderBilling(db, orderId);

  const guard = await guardAgainstDoubleCharge(stripe, order, billing);
  if (!guard.ok) {
    if (guard.message === "Order already charged." && guard.paymentIntentId) {
      const pi = await stripe.paymentIntents.retrieve(guard.paymentIntentId);
      await applyPaidChargeToOrder({
        db,
        orderId,
        order,
        paymentIntent: pi,
        staffEmail: staff.email,
        weightLbs,
        dryCleanItems,
        finalTotal,
        promoCodeUsed,
        promoDiscountAmount,
        promoLabel,
      });
      return {
        ok: true,
        paymentStatus: "paid" as const,
        paymentIntentId: guard.paymentIntentId,
        finalTotal:
          typeof order.finalTotal === "number" ? order.finalTotal : finalTotal,
      };
    }
    throw new HttpsError("failed-precondition", guard.message);
  }

  const customerUid = typeof order.uid === "string" ? order.uid : "";
  const { customerId, paymentMethodId } = await resolveOrderCard(order, orderId);

  const amountCents = Math.round(finalTotal * 100);
  const attemptFingerprint = JSON.stringify({
    amountCents,
    paymentMethodId,
    weightLbs,
    dryCleanItems,
    promoCodeUsed,
    promoDiscountAmount,
  });
  const attemptId = await acquireChargeLock(
    orderRef,
    orderId,
    selectPaymentIntentId(billing, order),
    attemptFingerprint
  );
  const receiptEmail = await orderReceiptEmail(order);

  let paymentIntent: Stripe.PaymentIntent;
  try {
    paymentIntent = await stripe.paymentIntents.create(
      {
        amount: amountCents,
        currency: "usd",
        customer: customerId,
        payment_method: paymentMethodId,
        off_session: true,
        confirm: true,
        description: `FOAM order ${orderId}`,
        ...receiptParamsForAttempt(receiptEmail, false),
        metadata: {
          orderId,
          firebaseUid: customerUid,
          chargedBy: staff.email,
          chargeMode: "saved_card",
        },
      },
      {
        idempotencyKey: `foam-charge-${orderId}-${attemptId}`,
      }
    );
  } catch (err) {
    const stripeErr = err as {
      message?: string;
      code?: string;
      decline_code?: string;
      payment_intent?: Stripe.PaymentIntent;
    };
    if (
      stripeErr.payment_intent &&
      (stripeErr.payment_intent.status === "succeeded" ||
        stripeErr.payment_intent.status === "processing")
    ) {
      return applyPaidChargeToOrder({
        db,
        orderId,
        order,
        paymentIntent: stripeErr.payment_intent,
        staffEmail: staff.email,
        weightLbs,
        dryCleanItems,
        finalTotal,
        promoCodeUsed,
        promoDiscountAmount,
        promoLabel,
      });
    }
    const parts = [
      stripeErr.message,
      stripeErr.code ? `code=${stripeErr.code}` : "",
      stripeErr.decline_code ? `decline=${stripeErr.decline_code}` : "",
    ].filter(Boolean);
    const message = parts.join(" · ") || "Stripe charge failed.";
    if (stripeErr.payment_intent) {
      await mergeOrderBilling(db, orderId, {
        stripePaymentIntentId: stripeErr.payment_intent.id,
      });
    }
    await orderRef.set(
      {
        paymentStatus: "failed",
        paymentError: message,
        chargeLockAt: FieldValue.delete(),
        ...(stripeErr.payment_intent
          ? {
              chargeAttemptId: FieldValue.delete(),
              chargeAttemptFingerprint: FieldValue.delete(),
            }
          : {}),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    throw new HttpsError("aborted", message);
  }

  if (
    paymentIntent.status !== "succeeded" &&
    paymentIntent.status !== "processing"
  ) {
    await mergeOrderBilling(db, orderId, { stripePaymentIntentId: paymentIntent.id });
    await orderRef.set(
      {
        paymentStatus: "failed",
        paymentError: `Stripe status: ${paymentIntent.status}`,
        chargeLockAt: FieldValue.delete(),
        chargeAttemptId: FieldValue.delete(),
        chargeAttemptFingerprint: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    throw new HttpsError(
      "aborted",
      `Payment not completed (${paymentIntent.status}).`
    );
  }

  return applyPaidChargeToOrder({
    db,
    orderId,
    order,
    paymentIntent,
    staffEmail: staff.email,
    weightLbs,
    dryCleanItems,
    finalTotal,
    promoCodeUsed,
    promoDiscountAmount,
    promoLabel,
  });
});

/**
 * Staff (owner/admin/manager): charge an extra amount on an already-paid order
 * (fix undercharge). Uses the saved card; on-spot can still be used separately.
 */
export const chargeOrderMore = onCall(async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Sign in required.");
  }

  const staff = await assertStaff(request.auth.uid);

  const orderId =
    typeof request.data?.orderId === "string" ? request.data.orderId : "";
  const amountUsdRaw = Number(request.data?.amount);
  if (!orderId) {
    throw new HttpsError("invalid-argument", "orderId required.");
  }
  if (!Number.isFinite(amountUsdRaw) || amountUsdRaw < 0.5) {
    throw new HttpsError(
      "invalid-argument",
      "Additional charge must be at least $0.50."
    );
  }
  const amountUsd = Math.round(amountUsdRaw * 100) / 100;
  const amountCents = Math.round(amountUsd * 100);

  const db = getFirestore();
  const orderRef = db.doc(`orders/${orderId}`);
  const orderSnap = await orderRef.get();
  if (!orderSnap.exists) {
    throw new HttpsError("not-found", "Order not found.");
  }
  const order = orderSnap.data() || {};
  assertCallerMayChargeOrder(staff.role, request.auth.uid, order);
  if (staff.role === "driver") {
    throw new HttpsError(
      "permission-denied",
      "Only owners and managers can charge more."
    );
  }
  const stripe = stripeClient();
  const billing = await readOrderBilling(db, orderId);
  const ledger = resolveChargeLedger(billing, order);
  const priorTotal = await verifyChargeLedger(stripe, orderId, ledger);
  const remainingPaid = ledger.reduce(
    (sum, row) => sum + Math.max(0, row.amount - row.refunded),
    0
  );
  if (remainingPaid < 0.01) {
    throw new HttpsError(
      "failed-precondition",
      "Order must have an unrefunded successful Stripe charge before charging more."
    );
  }

  const { customerUid, customerId, paymentMethodId } =
    await resolveOrderCard(order, orderId);
  const attemptFingerprint = JSON.stringify({
    kind: "topup",
    amountCents,
    priorTotal,
    customerId,
    paymentMethodId,
  });
  const attemptId = await acquireChargeLock(
    orderRef,
    orderId,
    selectPaymentIntentId(billing, order),
    attemptFingerprint
  );
  const receiptEmail = await orderReceiptEmail(order);

  let paymentIntent: Stripe.PaymentIntent;
  try {
    paymentIntent = await stripe.paymentIntents.create(
      {
        amount: amountCents,
        currency: "usd",
        customer: customerId,
        payment_method: paymentMethodId,
        off_session: true,
        confirm: true,
        description: `FOAM order ${orderId} top-up`,
        ...receiptParamsForAttempt(receiptEmail, false),
        metadata: {
          orderId,
          firebaseUid: customerUid,
          chargedBy: staff.email,
          chargeMode: "top_up",
        },
      },
      {
        idempotencyKey: `foam-topup-${orderId}-${attemptId}`,
      }
    );
  } catch (err) {
    const stripeErr = err as {
      message?: string;
      code?: string;
      decline_code?: string;
      payment_intent?: Stripe.PaymentIntent;
    };
    const parts = [
      stripeErr.message,
      stripeErr.code ? `code=${stripeErr.code}` : "",
      stripeErr.decline_code ? `decline=${stripeErr.decline_code}` : "",
    ].filter(Boolean);
    if (stripeErr.payment_intent) {
      await mergeOrderBilling(db, orderId, {
        stripePaymentIntentId: stripeErr.payment_intent.id,
      });
    }
    await orderRef.set({
      chargeLockAt: FieldValue.delete(),
      ...(stripeErr.payment_intent
        ? {
            chargeAttemptId: FieldValue.delete(),
            chargeAttemptFingerprint: FieldValue.delete(),
          }
        : {}),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    throw new HttpsError("aborted", parts.join(" · ") || "Top-up charge failed.");
  }

  if (
    paymentIntent.status !== "succeeded" &&
    paymentIntent.status !== "processing"
  ) {
    await mergeOrderBilling(db, orderId, { stripePaymentIntentId: paymentIntent.id });
    await orderRef.set({
      paymentStatus: "failed",
      paymentError: `Additional payment not completed (${paymentIntent.status}).`,
      chargeLockAt: FieldValue.delete(),
      chargeAttemptId: FieldValue.delete(),
      chargeAttemptFingerprint: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    throw new HttpsError(
      "aborted",
      `Additional payment not completed (${paymentIntent.status}).`
    );
  }

  const nextTotal = Math.round((priorTotal + amountUsd) * 100) / 100;
  const nextLedger = [
    ...ledger.filter((row) => row.paymentIntentId !== paymentIntent.id),
    {
      paymentIntentId: paymentIntent.id,
      amount: amountUsd,
      refunded: 0,
    },
  ];

  await mergeOrderBilling(db, orderId, {
    stripePaymentIntentId: paymentIntent.id,
    chargeLedger: nextLedger,
  });
  await orderRef.set(
    {
      finalTotal: nextTotal,
      paymentStatus: paymentIntent.status === "succeeded" ? "paid" : "pending",
      chargeLockAt: FieldValue.delete(),
      chargeAttemptId: FieldValue.delete(),
      chargeAttemptFingerprint: FieldValue.delete(),
      paymentError: FieldValue.delete(),
      topUpLastAmount: amountUsd,
      topUpLastAt: FieldValue.serverTimestamp(),
      topUpBy: staff.email,
      updatedAt: FieldValue.serverTimestamp(),
      lastUpdatedBy: staff.email,
    },
    { merge: true }
  );

  return {
    ok: true as const,
    paymentStatus:
      paymentIntent.status === "succeeded"
        ? ("paid" as const)
        : ("pending" as const),
    paymentIntentId: paymentIntent.id,
    amount: amountUsd,
    finalTotal: nextTotal,
  };
});

/**
 * Staff: create a PaymentIntent so the driver can enter a different card
 * on the spot when the saved card fails (or is missing).
 */
export const createOnSpotPaymentIntent = onCall(async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Sign in required.");
  }

  const staff = await assertStaff(request.auth.uid);
  const orderId =
    typeof request.data?.orderId === "string" ? request.data.orderId : "";
  if (!orderId) {
    throw new HttpsError("invalid-argument", "orderId required.");
  }

  const db = getFirestore();
  const orderRef = db.doc(`orders/${orderId}`);
  const orderSnap = await orderRef.get();
  if (!orderSnap.exists) {
    throw new HttpsError("not-found", "Order not found.");
  }
  const order = orderSnap.data() || {};
  assertCallerMayChargeOrder(staff.role, request.auth.uid, order);
  const {
    weightLbs,
    dryCleanItems,
    finalTotal,
    promoCodeUsed,
    promoDiscountAmount,
    promoLabel,
  } = await computeAuthoritativeCharge(db, orderId, order, request.data || {});
  const stripe = stripeClient();

  const billing = await readOrderBilling(db, orderId);
  const guard = await guardAgainstDoubleCharge(stripe, order, billing);
  if (!guard.ok) {
    throw new HttpsError("failed-precondition", guard.message);
  }

  const customerUid = typeof order.uid === "string" ? order.uid : "";
  const contact =
    order.contact && typeof order.contact === "object"
      ? (order.contact as Record<string, unknown>)
      : {};
  const email = String(contact.email || order.email || "").trim();
  const name = String(contact.name || "").trim();

  let customerId = "";

  if (customerUid) {
    const userSnap = await db.doc(`users/${customerUid}`).get();
    const user = userSnap.data() || {};
    customerId = String(user.stripeCustomerId || "");
    if (customerId) {
      const customer = await stripe.customers.retrieve(customerId);
      if (customer.deleted || customer.metadata?.firebaseUid !== customerUid) {
        throw new HttpsError("permission-denied", "Customer profile does not match the Stripe customer.");
      }
    }
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: email || undefined,
        name: name || undefined,
        metadata: { firebaseUid: customerUid },
      });
      customerId = customer.id;
      await db.doc(`users/${customerUid}`).set(
        {
          stripeCustomerId: customerId,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }
  } else {
    const billing = await readOrderBilling(db, orderId);
    customerId = selectGuestPaymentIds(billing, order).customerId;
    if (customerId) {
      const customer = await stripe.customers.retrieve(customerId);
      if (customer.deleted || (customer.metadata?.foamGuest !== "true"
        && customer.metadata?.orderId !== orderId)) {
        customerId = "";
      }
    }
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: email || undefined,
        name: name || undefined,
        metadata: { foamOnSpot: "true", orderId },
      });
      customerId = customer.id;
    }
  }

  const amountCents = Math.round(finalTotal * 100);
  const attemptFingerprint = JSON.stringify({
    kind: "on_spot",
    amountCents,
    customerId,
    weightLbs,
    dryCleanItems,
    promoCodeUsed,
    promoDiscountAmount,
  });
  const attemptId = await acquireChargeLock(
    orderRef,
    orderId,
    selectPaymentIntentId(billing, order),
    attemptFingerprint
  );
  const receiptEmail = await orderReceiptEmail(order);
  const paymentIntent = await stripe.paymentIntents.create(
    {
      amount: amountCents,
      currency: "usd",
      customer: customerId,
      payment_method_types: ["card"],
      description: `FOAM order ${orderId} (on-spot)`,
      ...receiptParamsForAttempt(receiptEmail, false),
      metadata: {
        orderId,
        firebaseUid: customerUid,
        chargedBy: staff.email,
        chargeMode: "on_spot",
      },
    },
    {
      idempotencyKey: `foam-onspot-${orderId}-${attemptId}`,
    }
  );

  if (!paymentIntent.client_secret) {
    throw new HttpsError("internal", "Missing PaymentIntent client secret.");
  }

  await mergeOrderBilling(db, orderId, {
    stripeCustomerId: customerId,
    stripePaymentIntentId: paymentIntent.id,
  });
  await orderRef.set(
    {
      chargeLockAt: FieldValue.delete(),
      chargeAttemptId: FieldValue.delete(),
      chargeAttemptFingerprint: FieldValue.delete(),
      pendingOnSpotCharge: {
        weightLbs: Number.isFinite(weightLbs) && weightLbs > 0 ? weightLbs : 0,
        dryCleanItems,
        finalTotal,
        promoCodeUsed: promoCodeUsed || "",
        promoDiscountAmount,
        promoLabel: promoLabel || "",
        createdBy: staff.email,
      },
      paymentStatus: "pending",
      paymentError: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return {
    clientSecret: paymentIntent.client_secret,
    paymentIntentId: paymentIntent.id,
    finalTotal,
  };
});

/**
 * Staff: after on-spot Payment Element succeeds, mark order paid + at laundry.
 */
export const finalizeOnSpotCharge = onCall(async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Sign in required.");
  }

  const staff = await assertStaff(request.auth.uid);
  const orderId =
    typeof request.data?.orderId === "string" ? request.data.orderId : "";
  const paymentIntentId =
    typeof request.data?.paymentIntentId === "string"
      ? request.data.paymentIntentId
      : "";
  if (!orderId || !paymentIntentId) {
    throw new HttpsError(
      "invalid-argument",
      "orderId and paymentIntentId required."
    );
  }

  const db = getFirestore();
  const orderRef = db.doc(`orders/${orderId}`);
  const orderSnap = await orderRef.get();
  if (!orderSnap.exists) {
    throw new HttpsError("not-found", "Order not found.");
  }
  const order = orderSnap.data() || {};
  assertCallerMayChargeOrder(staff.role, request.auth.uid, order);
  const billing = await readOrderBilling(db, orderId);
  if (selectPaymentIntentId(billing, order) !== paymentIntentId) {
    throw new HttpsError("permission-denied", "PaymentIntent is not the active payment attempt for this order.");
  }

  const stripe = stripeClient();
  const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId, {
    expand: ["payment_method"],
  });

  if (paymentIntent.metadata?.orderId !== orderId
    || paymentIntent.metadata?.chargeMode !== "on_spot") {
    throw new HttpsError("permission-denied", "PaymentIntent mismatch.");
  }
  if (
    paymentIntent.status !== "succeeded" &&
    paymentIntent.status !== "processing"
  ) {
    throw new HttpsError(
      "failed-precondition",
      `Payment not completed (${paymentIntent.status}).`
    );
  }

  return applyPaidChargeToOrder({
    db,
    orderId,
    order,
    paymentIntent,
    staffEmail: staff.email,
    chargedOnSpot: true,
  });
});

/**
 * Staff (owner/admin/manager): full or partial refund of a paid order.
 * Allowed any time after a successful charge (not History-only).
 * Refunds across the charge ledger (original + top-ups).
 */
export const refundOrder = onCall(async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Sign in required.");
  }

  const staff = await assertStaff(request.auth.uid);
  if (staff.role === "driver") {
    throw new HttpsError(
      "permission-denied",
      "Only owners and managers can issue refunds."
    );
  }

  const orderId =
    typeof request.data?.orderId === "string" ? request.data.orderId : "";
  const reason =
    typeof request.data?.reason === "string"
      ? request.data.reason.trim().slice(0, 200)
      : "";
  if (!orderId) {
    throw new HttpsError("invalid-argument", "orderId required.");
  }

  const db = getFirestore();
  const orderRef = db.doc(`orders/${orderId}`);
  const orderSnap = await orderRef.get();
  if (!orderSnap.exists) {
    throw new HttpsError("not-found", "Order not found.");
  }
  const order = orderSnap.data() || {};
  const billing = await readOrderBilling(db, orderId);
  const ledger = resolveChargeLedger(billing, order);
  const stripe = stripeClient();
  const chargedUsd = await verifyChargeLedger(stripe, orderId, ledger);

  const alreadyRefundedUsd =
    Math.round(ledger.reduce((sum, row) => sum + row.refunded, 0) * 100) / 100;
  const remainingUsd = Math.max(
    0,
    Math.round((chargedUsd - alreadyRefundedUsd) * 100) / 100
  );

  if (remainingUsd < 0.01) {
    return {
      ok: true,
      refundId: String(order.stripeRefundId || ""),
      amount: alreadyRefundedUsd,
      remaining: 0,
    };
  }

  let amountUsd =
    typeof request.data?.amount === "number" &&
    Number.isFinite(request.data.amount)
      ? Math.round(request.data.amount * 100) / 100
      : remainingUsd;

  if (amountUsd < 0.01) {
    throw new HttpsError(
      "invalid-argument",
      "Refund amount must be at least $0.01."
    );
  }
  if (amountUsd > remainingUsd + 0.001) {
    throw new HttpsError(
      "invalid-argument",
      `Refund cannot exceed remaining $${remainingUsd.toFixed(2)}.`
    );
  }
  amountUsd = Math.min(amountUsd, remainingUsd);

  const attemptFingerprint = JSON.stringify({
    amountCents: Math.round(amountUsd * 100),
    reason,
    ledger: ledger.map((row) => ({
      paymentIntentId: row.paymentIntentId,
      amountCents: Math.round(row.amount * 100),
      refundedCents: Math.round(row.refunded * 100),
    })),
  });
  const attemptId = await acquireRefundLock(orderRef, attemptFingerprint, ledger);

  const nextLedger = ledger.map((row) => ({ ...row }));
  let left = amountUsd;
  let lastRefundId = "";
  let thisRefundUsd = 0;

  for (let i = 0; i < nextLedger.length && left >= 0.01; i += 1) {
    const entry = nextLedger[i];
    const room = Math.round((entry.amount - entry.refunded) * 100) / 100;
    if (room < 0.01) continue;
    const take = Math.min(room, left);
    const takeCents = Math.round(take * 100);
    const refund = await stripe.refunds.create(
      {
        payment_intent: entry.paymentIntentId,
        amount: takeCents,
        reason: "requested_by_customer",
        metadata: {
          orderId,
          refundedBy: staff.email,
          note: reason || "",
        },
      },
      {
        idempotencyKey: `foam-refund-${attemptId}-${i}`,
      }
    );
    const refundedNow =
      typeof refund.amount === "number"
        ? Math.round(refund.amount) / 100
        : take;
    entry.refunded = Math.round((entry.refunded + refundedNow) * 100) / 100;
    left = Math.round((left - refundedNow) * 100) / 100;
    thisRefundUsd = Math.round((thisRefundUsd + refundedNow) * 100) / 100;
    lastRefundId = refund.id;
  }

  const totalRefundedUsd =
    Math.round(nextLedger.reduce((sum, row) => sum + row.refunded, 0) * 100) /
    100;
  const fullyRefunded = totalRefundedUsd >= chargedUsd - 0.001;

  await mergeOrderBilling(db, orderId, { chargeLedger: nextLedger });
  await orderRef.set(
    {
      refundStatus: fullyRefunded ? "issued" : "approved",
      refundAmount: totalRefundedUsd,
      stripeRefundId: lastRefundId,
      refundError: FieldValue.delete(),
      refundedBy: staff.email,
      refundReason: reason || FieldValue.delete(),
      refundedAt: FieldValue.serverTimestamp(),
      refundLockAt: FieldValue.delete(),
      refundAttemptId: FieldValue.delete(),
      refundAttemptFingerprint: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
      lastUpdatedBy: staff.email,
    },
    { merge: true }
  );

  return {
    ok: true,
    refundId: lastRefundId,
    amount: thisRefundUsd,
    remaining: Math.max(
      0,
      Math.round((chargedUsd - totalRefundedUsd) * 100) / 100
    ),
  };
});

/** Stripe → Firebase: confirm paid / failed asynchronously. */
export const stripeWebhook = onRequest({ cors: false }, async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).send("Method not allowed");
    return;
  }

  const stripe = stripeClient();
  const whSecret = (process.env.STRIPE_WEBHOOK_SECRET || "").trim();
  if (!whSecret) {
    res.status(500).send("Webhook secret not configured");
    return;
  }

  const sig = req.headers["stripe-signature"];
  if (!sig || Array.isArray(sig)) {
    res.status(400).send("Missing signature");
    return;
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      (req as unknown as { rawBody: Buffer }).rawBody || req.body,
      sig,
      whSecret
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Webhook error";
    res.status(400).send(`Webhook Error: ${message}`);
    return;
  }

  const db = getFirestore();

  // Receipts are Stripe's. receipt_email is set only when the PaymentIntent
  // is created. Do not update it here after success.
  if (
    event.type === "payment_intent.succeeded" ||
    event.type === "payment_intent.payment_failed"
  ) {
    const pi = event.data.object as Stripe.PaymentIntent;
    const orderId = pi.metadata?.orderId;
    if (orderId) {
      const orderRef = db.doc(`orders/${orderId}`);
      const orderSnap = await orderRef.get();
      const order = orderSnap.exists ? orderSnap.data() || {} : {};

      if (event.type === "payment_intent.succeeded") {
        if (pi.metadata?.chargeMode === "top_up") {
          const billing = await readOrderBilling(db, orderId);
          const ledger = resolveChargeLedger(billing, order);
          const amountUsd = Math.round((pi.amount || 0)) / 100;
          const hasPi = ledger.some((row) => row.paymentIntentId === pi.id);
          if (!hasPi && amountUsd >= 0.01) {
            const priorTotal =
              typeof order.finalTotal === "number" &&
              Number.isFinite(order.finalTotal)
                ? order.finalTotal
                : 0;
            await mergeOrderBilling(db, orderId, {
              stripePaymentIntentId: pi.id,
              chargeLedger: [
                ...ledger,
                {
                  paymentIntentId: pi.id,
                  amount: amountUsd,
                  refunded: 0,
                },
              ],
            });
            await orderRef.set(
              {
                finalTotal: Math.round((priorTotal + amountUsd) * 100) / 100,
                paymentStatus: "paid",
                paymentError: FieldValue.delete(),
                updatedAt: FieldValue.serverTimestamp(),
              },
              { merge: true }
            );
          }
        } else if (order.paymentStatus !== "paid") {
          await applyPaidChargeToOrder({
            db,
            orderId,
            order,
            paymentIntent: pi,
            staffEmail: String(pi.metadata?.chargedBy || "stripe-webhook"),
            chargedOnSpot: pi.metadata?.chargeMode === "on_spot",
          });
        }
      } else {
        await mergeOrderBilling(db, orderId, { stripePaymentIntentId: pi.id });
        await orderRef.set(
          {
            paymentStatus: "failed",
            paymentError:
              pi.last_payment_error?.message || "Payment failed",
            chargeLockAt: FieldValue.delete(),
            pendingOnSpotCharge: FieldValue.delete(),
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      }
    }
  }

  if (event.type === "setup_intent.succeeded") {
    const si = event.data.object as Stripe.SetupIntent;
    const uid = si.metadata?.firebaseUid;
    if (uid && si.payment_method) {
      const pmId =
        typeof si.payment_method === "string"
          ? si.payment_method
          : si.payment_method.id;
      const pm = await stripe.paymentMethods.retrieve(pmId);
      const customerId =
        typeof si.customer === "string" ? si.customer : si.customer?.id || "";
      await db.doc(`users/${uid}`).set(
        {
          stripeCustomerId: customerId,
          stripePaymentMethodId: pmId,
          cardBrand: pm.card?.brand || "",
          cardLast4: pm.card?.last4 || "",
          cardExpMonth: pm.card?.exp_month || null,
          cardExpYear: pm.card?.exp_year || null,
          paymentUpdatedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }
  }

  if (event.type === "refund.failed" || event.type === "refund.updated") {
    const refund = event.data.object as Stripe.Refund;
    const orderId = refund.metadata?.orderId;
    if (orderId && event.type === "refund.failed") {
      await db.doc(`orders/${orderId}`).set(
        {
          refundError:
            refund.failure_reason ||
            "Refund failed. Check Stripe Dashboard.",
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }
  }

  res.json({ received: true });
});
