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

  if (typeof order.finalTotal === "number" && order.paymentStatus === "paid") {
    throw new HttpsError("failed-precondition", "Order already charged.");
  }

  const customerUid = typeof order.uid === "string" ? order.uid : "";
  if (!customerUid) {
    throw new HttpsError(
      "failed-precondition",
      "Guest order has no card on file. Ask the customer to sign in and save a card in Account → Payments."
    );
  }

  const userSnap = await db.doc(`users/${customerUid}`).get();
  if (!userSnap.exists) {
    throw new HttpsError(
      "failed-precondition",
      "Customer profile missing. Customer must save a card first."
    );
  }
  const user = userSnap.data() || {};
  const customerId = String(user.stripeCustomerId || "");
  const paymentMethodId = String(user.stripePaymentMethodId || "");
  if (!customerId || !paymentMethodId) {
    throw new HttpsError(
      "failed-precondition",
      "No card on file. Customer must add a card in Account → Payments."
    );
  }

  const amountCents = Math.round(finalTotal * 100);
  const stripe = stripeClient();

  let paymentIntent: Stripe.PaymentIntent;
  try {
    paymentIntent = await stripe.paymentIntents.create({
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
      },
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Stripe charge failed.";
    await orderRef.set(
      {
        paymentStatus: "failed",
        paymentError: message,
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
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    throw new HttpsError(
      "aborted",
      `Payment not completed (${paymentIntent.status}).`
    );
  }

  const paid = paymentIntent.status === "succeeded";
  const patch: Record<string, unknown> = {
    ...(Number.isFinite(weightLbs) && weightLbs > 0 ? { weightLbs } : {}),
    dryCleanItems,
    finalTotal,
    status: "washing",
    "pricing.finalTotalPending": false,
    paymentStatus: paid ? "paid" : "pending",
    stripePaymentIntentId: paymentIntent.id,
    paymentError: FieldValue.delete(),
    paidAt: paid ? FieldValue.serverTimestamp() : null,
    chargedBy: staff.email,
    statusUpdatedAt: FieldValue.serverTimestamp(),
    lastUpdatedBy: staff.email,
    updatedAt: FieldValue.serverTimestamp(),
  };

  if (typeof request.data?.promoCodeUsed === "string") {
    const promoOff = Number(request.data?.promoDiscountAmount ?? 0);
    const promoLabel =
      typeof request.data?.promoLabel === "string"
        ? request.data.promoLabel
        : "";
    if (request.data.promoCodeUsed && promoOff > 0) {
      patch["pricing.promoApplied"] = true;
      patch["pricing.promoDiscountAmount"] = promoOff;
      patch["pricing.promoLabel"] = promoLabel;
    }
  }

  await orderRef.set(patch, { merge: true });

  const trackKey = typeof order.trackKey === "string" ? order.trackKey : "";
  if (trackKey) {
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

  return {
    ok: true,
    paymentStatus: paid ? "paid" : "pending",
    paymentIntentId: paymentIntent.id,
    finalTotal,
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
  let event: Stripe.Event;

  try {
    if (whSecret) {
      const sig = req.headers["stripe-signature"];
      if (!sig || Array.isArray(sig)) {
        res.status(400).send("Missing signature");
        return;
      }
      event = stripe.webhooks.constructEvent(
        // Firebase provides rawBody on Cloud Functions requests
        (req as unknown as { rawBody: Buffer }).rawBody || req.body,
        sig,
        whSecret
      );
    } else {
      event = req.body as Stripe.Event;
    }
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
      const paid = event.type === "payment_intent.succeeded";
      await db.doc(`orders/${orderId}`).set(
        {
          paymentStatus: paid ? "paid" : "failed",
          stripePaymentIntentId: pi.id,
          ...(paid
            ? {
                paidAt: FieldValue.serverTimestamp(),
                paymentError: FieldValue.delete(),
              }
            : {
                paymentError:
                  pi.last_payment_error?.message || "Payment failed",
              }),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
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

  res.json({ received: true });
});
