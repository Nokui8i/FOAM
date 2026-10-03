import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";

const requireFunctions = createRequire(new URL("../functions/lib/index.js", import.meta.url));
const { getFirestore } = requireFunctions("firebase-admin/firestore");
const {
  GUEST_ORDER_EMAIL_LIMIT,
  GUEST_ORDER_IP_LIMIT,
  guestOrderHasProtectedFields,
} = requireFunctions("./guest-order.js");
const { createGuestOrderRecord } = requireFunctions("./index.js");
const db = getFirestore();
const source = readFileSync(new URL("../functions/src/index.ts", import.meta.url), "utf8");

function validInput(overrides = {}) {
  return {
    services: { laundry: true, dryCleaning: false, bagCount: 1 },
    contact: { name: "Guest Customer", email: "guest@example.com", phone: "7025550100" },
    pickup: {
      address: "123 Example St",
      unit: "",
      city: "Las Vegas",
      zip: "89101",
      notes: "",
      date: "2026-10-10",
      slot: "7am - 10am",
      repeatRequested: false,
    },
    preferences: { detergent: "Persil" },
    orderNotes: "",
    tip: 0,
    promoCode: "",
    ...overrides,
  };
}

test("valid guest booking is created by the server", async () => {
  await db.doc("config/laundryRates").set({
    weeklyPerLb: 2.35,
    standardPerLb: 2.6,
    deliveryFee: 5,
    minimumOrder: 50,
  });
  const created = await createGuestOrderRecord(validInput());
  const order = (await db.doc(`orders/${created.orderId}`).get()).data();
  assert.equal(order.status, "new");
  assert.equal(order.guest, true);
  assert.equal(order.uid, null);
  assert.equal(order.pricing.laundryRatePerLb, 2.6);
  assert.equal(order.pricing.finalTotalPending, true);
  assert.equal(order.pickup.repeat, false);
  assert.equal(created.trackKey.length, 32);
  assert.equal((await db.doc(`orderTracks/${created.trackKey}`).get()).exists, true);
});

test("invalid guest booking is rejected", async () => {
  const input = validInput();
  input.contact.email = "not-an-email";
  await assert.rejects(
    () => createGuestOrderRecord(input),
    (err) => err.code === "invalid-argument"
  );
});

test("guest cannot choose the price snapshot", async () => {
  await db.doc("config/laundryRates").set({
    weeklyPerLb: 2.35,
    standardPerLb: 2.6,
    deliveryFee: 5,
    minimumOrder: 50,
  });
  const created = await createGuestOrderRecord(validInput({
    pricing: { laundryRatePerLb: 0.01, deliveryFee: 0, minimumOrder: 1 },
    tip: 4,
    finalTotal: 0.01,
  }));
  const order = (await db.doc(`orders/${created.orderId}`).get()).data();
  assert.equal(order.pricing.laundryRatePerLb, 2.6);
  assert.equal(order.pricing.deliveryFee, 5);
  assert.equal(order.pricing.minimumOrder, 50);
  assert.equal(order.tip, 4);
  assert.equal(order.finalTotal, undefined);
});

test("guest cannot write protected payment or assignment fields", async () => {
  await db.doc("config/laundryRates").set({
    weeklyPerLb: 2.35,
    standardPerLb: 2.6,
    deliveryFee: 5,
    minimumOrder: 50,
  });
  const created = await createGuestOrderRecord(validInput({
    assignedDriverUid: "driver-1",
    paymentStatus: "paid",
    stripeCustomerId: "cus_secret",
    stripePaymentMethodId: "pm_secret",
    stripePaymentIntentId: "pi_fake",
    uid: "customer-1",
    guest: false,
    status: "delivered",
  }));
  const order = (await db.doc(`orders/${created.orderId}`).get()).data();
  assert.equal(guestOrderHasProtectedFields(order), false);
  assert.equal(order.uid, null);
  assert.equal(order.guest, true);
  assert.equal(order.status, "new");
});

test("guest order creation is rate limited before the order is written", () => {
  const start = source.indexOf("export const createGuestOrder");
  const body = source.slice(start, source.indexOf("\nexport const ", start + 10));
  const limit = body.indexOf("limitGuestCaller(request, \"guest-order\", GUEST_ORDER_IP_LIMIT");
  const email = body.indexOf("guest-order-email:");
  const write = body.indexOf("createGuestOrderRecord");
  assert.equal(GUEST_ORDER_IP_LIMIT, 10);
  assert.equal(GUEST_ORDER_EMAIL_LIMIT, 5);
  assert.ok(limit > 0 && email > limit && write > email);
});
