import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { onCall, onRequest, HttpsError } from "firebase-functions/v2/https";
import { setGlobalOptions } from "firebase-functions/v2";
import Stripe from "stripe";

initializeApp();
setGlobalOptions({ region: "us-central1", timeoutSeconds: 60 });

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

function orderAlreadyPaid(order: Record<string, unknown>) {
  return order.paymentStatus === "paid";
}

/** Block new charges when paid, or when an in-flight PI already succeeded/processing. */
async function guardAgainstDoubleCharge(
  stripe: Stripe,
  order: Record<string, unknown>
): Promise<{ ok: true } | { ok: false; message: string; paymentIntentId?: string }> {
  if (orderAlreadyPaid(order)) {
    return { ok: false, message: "Order already charged." };
  }

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

  const piId = String(order.stripePaymentIntentId || "");
  if (!piId) return { ok: true };

  try {
    const pi = await stripe.paymentIntents.retrieve(piId);
    if (pi.status === "succeeded" || pi.status === "processing") {
      return {
        ok: false,
        message: "Order already charged.",
        paymentIntentId: pi.id,
      };
    }
    if (
      pi.status === "requires_payment_method" ||
      pi.status === "requires_confirmation" ||
      pi.status === "requires_action" ||
      pi.status === "requires_capture"
    ) {
      await stripe.paymentIntents.cancel(piId).catch(() => undefined);
    }
  } catch {
    /* ignore retrieve errors; allow a new attempt */
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
    stripePaymentIntentId: paymentIntent.id,
    ...(customerId ? { stripeCustomerId: customerId } : {}),
    ...(pmId ? { stripePaymentMethodId: pmId } : {}),
    ...(card?.brand ? { cardBrand: card.brand } : {}),
    ...(card?.last4 ? { cardLast4: card.last4 } : {}),
    ...(card?.exp_month != null ? { cardExpMonth: card.exp_month } : {}),
    ...(card?.exp_year != null ? { cardExpYear: card.exp_year } : {}),
    paymentError: FieldValue.delete(),
    pendingOnSpotCharge: FieldValue.delete(),
    chargeLockAt: FieldValue.delete(),
    ...(chargedOnSpot || paymentIntent.metadata?.chargeMode === "on_spot"
      ? { chargedOnSpot: true }
      : {}),
    paidAt: paid ? FieldValue.serverTimestamp() : null,
    chargedBy: staffEmail || paymentIntent.metadata?.chargedBy || "",
    statusUpdatedAt: FieldValue.serverTimestamp(),
    lastUpdatedBy: staffEmail || paymentIntent.metadata?.chargedBy || "stripe",
    updatedAt: FieldValue.serverTimestamp(),
  };

  if (paid) {
    const chargedUsd =
      Math.round((paymentIntent.amount || Math.round(finalTotal * 100)) ) / 100;
    const ledger = normalizeChargeLedger(order);
    const already = ledger.some((row) => row.paymentIntentId === paymentIntent.id);
    patch.chargeLedger = already
      ? ledger
      : order.paymentStatus === "paid" && ledger.length > 0
        ? [
            ...ledger,
            {
              paymentIntentId: paymentIntent.id,
              amount: chargedUsd,
              refunded: 0,
            },
          ]
        : [
            {
              paymentIntentId: paymentIntent.id,
              amount: Math.round(finalTotal * 100) / 100,
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
  await writeTrackWashing(db, order, finalTotal, weightLbs);

  return {
    ok: true as const,
    paymentStatus: (paid ? "paid" : "pending") as "paid" | "pending",
    paymentIntentId: paymentIntent.id,
    finalTotal,
    brand: card?.brand || "",
    last4: card?.last4 || "",
  };
}

type ChargeLedgerEntry = {
  paymentIntentId: string;
  amount: number;
  refunded: number;
};

function normalizeChargeLedger(order: Record<string, unknown>): ChargeLedgerEntry[] {
  const raw = order.chargeLedger;
  if (Array.isArray(raw) && raw.length > 0) {
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

async function resolveOrderCard(order: Record<string, unknown>) {
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
    customerId = String(order.stripeCustomerId || "");
    paymentMethodId = String(order.stripePaymentMethodId || "");
  }

  if (!customerId || !paymentMethodId) {
    throw new HttpsError(
      "failed-precondition",
      customerUid
        ? "No card on file. Customer must add a card in Account → Payments."
        : "Guest order has no card on file. Use Charge different card on the spot."
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
  if (!email || !email.includes("@") || email.length > 200) {
    throw new HttpsError("invalid-argument", "Valid email required.");
  }

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
    customerId: customer.id,
  };
});

/** Guest booking: confirm SetupIntent and return card + Stripe ids for the order. */
export const confirmGuestCardSaved = onCall(async (request) => {
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
    customerId,
    paymentMethodId: pmId,
    brand: pm.card?.brand || "",
    last4: pm.card?.last4 || "",
    expMonth: pm.card?.exp_month || null,
    expYear: pm.card?.exp_year || null,
  };
});
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

  const weightLbs = Number(request.data?.weightLbs ?? 0);
  const dryCleanItems: DryItem[] = Array.isArray(request.data?.dryCleanItems)
    ? request.data.dryCleanItems
    : [];
  const finalTotal = Number(request.data?.finalTotal);
  if (!Number.isFinite(finalTotal) || finalTotal < 0.5) {
    throw new HttpsError("invalid-argument", "Invalid charge amount.");
  }

  const db = getFirestore();
  const orderRef = db.doc(`orders/${orderId}`);
  const orderSnap = await orderRef.get();
  if (!orderSnap.exists) {
    throw new HttpsError("not-found", "Order not found.");
  }
  const order = orderSnap.data() || {};
  const stripe = stripeClient();

  const guard = await guardAgainstDoubleCharge(stripe, order);
  if (!guard.ok) {
    if (guard.message === "Order already charged." && guard.paymentIntentId) {
      const pi = await stripe.paymentIntents.retrieve(guard.paymentIntentId);
      if (order.paymentStatus !== "paid") {
        await applyPaidChargeToOrder({
          db,
          orderId,
          order,
          paymentIntent: pi,
          staffEmail: staff.email,
          weightLbs,
          dryCleanItems,
          finalTotal,
          promoCodeUsed:
            typeof request.data?.promoCodeUsed === "string"
              ? request.data.promoCodeUsed
              : undefined,
          promoDiscountAmount: Number(request.data?.promoDiscountAmount ?? 0),
          promoLabel:
            typeof request.data?.promoLabel === "string"
              ? request.data.promoLabel
              : undefined,
        });
      }
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
  const { customerId, paymentMethodId } = await resolveOrderCard(order);

  const amountCents = Math.round(finalTotal * 100);
  await orderRef.set(
    {
      chargeLockAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

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
        metadata: {
          orderId,
          firebaseUid: customerUid,
          chargedBy: staff.email,
          chargeMode: "saved_card",
        },
      },
      {
        idempotencyKey: `foam-charge-${orderId}-${amountCents}-${paymentMethodId}`,
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
        promoCodeUsed:
          typeof request.data?.promoCodeUsed === "string"
            ? request.data.promoCodeUsed
            : undefined,
        promoDiscountAmount: Number(request.data?.promoDiscountAmount ?? 0),
        promoLabel:
          typeof request.data?.promoLabel === "string"
            ? request.data.promoLabel
            : undefined,
      });
    }
    const parts = [
      stripeErr.message,
      stripeErr.code ? `code=${stripeErr.code}` : "",
      stripeErr.decline_code ? `decline=${stripeErr.decline_code}` : "",
    ].filter(Boolean);
    const message = parts.join(" · ") || "Stripe charge failed.";
    await orderRef.set(
      {
        paymentStatus: "failed",
        paymentError: message,
        chargeLockAt: FieldValue.delete(),
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
    await orderRef.set(
      {
        paymentStatus: "failed",
        paymentError: `Stripe status: ${paymentIntent.status}`,
        stripePaymentIntentId: paymentIntent.id,
        chargeLockAt: FieldValue.delete(),
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
    promoCodeUsed:
      typeof request.data?.promoCodeUsed === "string"
        ? request.data.promoCodeUsed
        : undefined,
    promoDiscountAmount: Number(request.data?.promoDiscountAmount ?? 0),
    promoLabel:
      typeof request.data?.promoLabel === "string"
        ? request.data.promoLabel
        : undefined,
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
  if (staff.role === "driver") {
    throw new HttpsError(
      "permission-denied",
      "Only owners and managers can charge more."
    );
  }

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
  if (order.paymentStatus !== "paid") {
    throw new HttpsError(
      "failed-precondition",
      "Order must already be paid before charging more."
    );
  }

  const { customerUid, customerId, paymentMethodId } =
    await resolveOrderCard(order);
  const priorTotal =
    typeof order.finalTotal === "number" && Number.isFinite(order.finalTotal)
      ? order.finalTotal
      : 0;
  const stripe = stripeClient();

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
        metadata: {
          orderId,
          firebaseUid: customerUid,
          chargedBy: staff.email,
          chargeMode: "top_up",
        },
      },
      {
        idempotencyKey: `foam-topup-${orderId}-${amountCents}-${priorTotal.toFixed(2)}-${paymentMethodId}`,
      }
    );
  } catch (err) {
    const stripeErr = err as {
      message?: string;
      code?: string;
      decline_code?: string;
    };
    const parts = [
      stripeErr.message,
      stripeErr.code ? `code=${stripeErr.code}` : "",
      stripeErr.decline_code ? `decline=${stripeErr.decline_code}` : "",
    ].filter(Boolean);
    throw new HttpsError("aborted", parts.join(" · ") || "Top-up charge failed.");
  }

  if (
    paymentIntent.status !== "succeeded" &&
    paymentIntent.status !== "processing"
  ) {
    throw new HttpsError(
      "aborted",
      `Additional payment not completed (${paymentIntent.status}).`
    );
  }

  const nextTotal = Math.round((priorTotal + amountUsd) * 100) / 100;
  const ledger = normalizeChargeLedger(order);
  const nextLedger = [
    ...ledger.filter((row) => row.paymentIntentId !== paymentIntent.id),
    {
      paymentIntentId: paymentIntent.id,
      amount: amountUsd,
      refunded: 0,
    },
  ];

  await orderRef.set(
    {
      finalTotal: nextTotal,
      paymentStatus: paymentIntent.status === "succeeded" ? "paid" : "pending",
      stripePaymentIntentId: paymentIntent.id,
      chargeLedger: nextLedger,
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

  const weightLbs = Number(request.data?.weightLbs ?? 0);
  const dryCleanItems: DryItem[] = Array.isArray(request.data?.dryCleanItems)
    ? request.data.dryCleanItems
    : [];
  const finalTotal = Number(request.data?.finalTotal);
  if (!Number.isFinite(finalTotal) || finalTotal < 0.5) {
    throw new HttpsError("invalid-argument", "Invalid charge amount.");
  }

  const db = getFirestore();
  const orderRef = db.doc(`orders/${orderId}`);
  const orderSnap = await orderRef.get();
  if (!orderSnap.exists) {
    throw new HttpsError("not-found", "Order not found.");
  }
  const order = orderSnap.data() || {};
  const stripe = stripeClient();

  const guard = await guardAgainstDoubleCharge(stripe, order);
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
    customerId = String(order.stripeCustomerId || "");
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
  // Minute bucket so retries within the same minute reuse the same PI.
  const minuteBucket = Math.floor(Date.now() / 60_000);
  const paymentIntent = await stripe.paymentIntents.create(
    {
      amount: amountCents,
      currency: "usd",
      customer: customerId,
      payment_method_types: ["card"],
      description: `FOAM order ${orderId} (on-spot)`,
      metadata: {
        orderId,
        firebaseUid: customerUid,
        chargedBy: staff.email,
        chargeMode: "on_spot",
      },
    },
    {
      idempotencyKey: `foam-onspot-${orderId}-${amountCents}-${minuteBucket}`,
    }
  );

  if (!paymentIntent.client_secret) {
    throw new HttpsError("internal", "Missing PaymentIntent client secret.");
  }

  const promoCodeUsed =
    typeof request.data?.promoCodeUsed === "string"
      ? request.data.promoCodeUsed
      : "";
  const promoDiscountAmount = Number(request.data?.promoDiscountAmount ?? 0);
  const promoLabel =
    typeof request.data?.promoLabel === "string" ? request.data.promoLabel : "";

  await orderRef.set(
    {
      stripeCustomerId: customerId,
      stripePaymentIntentId: paymentIntent.id,
      chargeLockAt: FieldValue.serverTimestamp(),
      pendingOnSpotCharge: {
        weightLbs: Number.isFinite(weightLbs) && weightLbs > 0 ? weightLbs : 0,
        dryCleanItems,
        finalTotal,
        promoCodeUsed: promoCodeUsed || "",
        promoDiscountAmount:
          Number.isFinite(promoDiscountAmount) && promoDiscountAmount > 0
            ? promoDiscountAmount
            : 0,
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
    customerId,
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

  if (orderAlreadyPaid(order)) {
    return {
      ok: true,
      paymentStatus: "paid" as const,
      paymentIntentId,
      finalTotal:
        typeof order.finalTotal === "number" ? order.finalTotal : 0,
      brand: "",
      last4: "",
    };
  }

  const stripe = stripeClient();
  const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId, {
    expand: ["payment_method"],
  });

  if (paymentIntent.metadata?.orderId !== orderId) {
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

  if (order.paymentStatus !== "paid") {
    throw new HttpsError(
      "failed-precondition",
      "Order is not paid. Nothing to refund."
    );
  }

  const ledger = normalizeChargeLedger(order);
  if (ledger.length === 0) {
    throw new HttpsError(
      "failed-precondition",
      "Missing PaymentIntent on this order."
    );
  }

  const chargedUsd =
    Math.round(ledger.reduce((sum, row) => sum + row.amount, 0) * 100) / 100;
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

  const stripe = stripeClient();
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
        idempotencyKey: `foam-refund-${orderId}-${entry.paymentIntentId}-${entry.refunded.toFixed(2)}-${takeCents}`,
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

  await orderRef.set(
    {
      chargeLedger: nextLedger,
      refundStatus: fullyRefunded ? "issued" : "approved",
      refundAmount: totalRefundedUsd,
      stripeRefundId: lastRefundId,
      refundError: FieldValue.delete(),
      refundedBy: staff.email,
      refundReason: reason || FieldValue.delete(),
      refundedAt: FieldValue.serverTimestamp(),
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
          const ledger = normalizeChargeLedger(order);
          const amountUsd = Math.round((pi.amount || 0)) / 100;
          const hasPi = ledger.some((row) => row.paymentIntentId === pi.id);
          if (!hasPi && amountUsd >= 0.01) {
            const priorTotal =
              typeof order.finalTotal === "number" &&
              Number.isFinite(order.finalTotal)
                ? order.finalTotal
                : 0;
            await orderRef.set(
              {
                finalTotal: Math.round((priorTotal + amountUsd) * 100) / 100,
                paymentStatus: "paid",
                stripePaymentIntentId: pi.id,
                chargeLedger: [
                  ...ledger,
                  {
                    paymentIntentId: pi.id,
                    amount: amountUsd,
                    refunded: 0,
                  },
                ],
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
        await orderRef.set(
          {
            paymentStatus: "failed",
            stripePaymentIntentId: pi.id,
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
