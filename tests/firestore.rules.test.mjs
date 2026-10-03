import { readFileSync } from "node:fs";
import path from "node:path";
import { after, before, beforeEach, test } from "node:test";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  doc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";

const projectId = "demo-foam-rules";
let env;

const rates = {
  weeklyPerLb: 2.35,
  standardPerLb: 2.6,
  deliveryFee: 5,
  minimumOrder: 50,
};

function makeOrder(overrides = {}) {
  return {
    status: "new",
    guest: true,
    uid: null,
    trackKey: "tracking-secret-key-123456789",
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
      repeat: false,
      repeatRequested: false,
    },
    preferences: {},
    orderNotes: "",
    pricing: {
      mode: "weighed_at_pickup",
      tier: "standard",
      laundryRatePerLb: rates.standardPerLb,
      deliveryFee: rates.deliveryFee,
      minimumOrder: rates.minimumOrder,
      tip: 0,
      promoCode: "",
      promoDiscountType: null,
      promoDiscountValue: null,
      promoIncludesFee: false,
      promoLabel: "",
      finalTotalPending: true,
      repeatDiscountEligible: false,
      repeatDiscountPercent: 0,
    },
    tip: 0,
    promoCode: "",
    createdAt: serverTimestamp(),
    ...overrides,
  };
}

async function seedRates() {
  await env.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "config/laundryRates"), rates);
  });
}

before(async () => {
  env = await initializeTestEnvironment({
    projectId,
    firestore: {
      rules: readFileSync(path.join(process.cwd(), "firestore.rules"), "utf8"),
    },
  });
});

beforeEach(async () => {
  await env.clearFirestore();
  await seedRates();
});

after(async () => {
  await env?.cleanup();
});

test("guest order creation succeeds, but injected payment fields are rejected", async () => {
  const db = env.unauthenticatedContext().firestore();
  await assertSucceeds(setDoc(doc(db, "orders/order-safe"), makeOrder()));
  await assertFails(setDoc(
    doc(db, "orders/order-injected"),
    makeOrder({ paymentStatus: "paid", finalTotal: 0.01, stripePaymentIntentId: "pi_fake" })
  ));
});

test("order pricing snapshot must match current server configuration", async () => {
  const db = env.unauthenticatedContext().firestore();
  const tampered = makeOrder();
  tampered.pricing.laundryRatePerLb = 0.01;
  await assertFails(setDoc(doc(db, "orders/order-bad-rate"), tampered));
});

test("promo discount snapshot must match an active stored promo", async () => {
  await env.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "promoCodes/SAVE10"), {
      code: "SAVE10",
      discountType: "percent",
      discountValue: 10,
      includesFee: false,
      limitMode: "uses",
      maxUses: 100,
      usedCount: 0,
      active: true,
    });
  });
  const db = env.unauthenticatedContext().firestore();
  const order = makeOrder({ promoCode: "SAVE10" });
  order.pricing.promoCode = "SAVE10";
  order.pricing.promoDiscountType = "percent";
  order.pricing.promoDiscountValue = 10;
  await assertSucceeds(setDoc(doc(db, "orders/order-promo"), order));

  const forged = makeOrder({ promoCode: "SAVE10" });
  forged.pricing.promoCode = "SAVE10";
  forged.pricing.promoDiscountType = "percent";
  forged.pricing.promoDiscountValue = 90;
  await assertFails(setDoc(doc(db, "orders/order-forged-promo"), forged));
});

test("only admins can write pickup availability", async () => {
  const anonymous = env.unauthenticatedContext().firestore();
  const update = {
    slots: { "7am - 10am": 1 },
    updatedAt: serverTimestamp(),
  };
  await assertFails(setDoc(doc(anonymous, "pickupAvailability/2026-10-10"), update));

  const admin = env.authenticatedContext("owner", { email: "paylocksmith@gmail.com" }).firestore();
  await assertSucceeds(setDoc(doc(admin, "pickupAvailability/2026-10-10"), update));
});

test("assigned driver can take an allowed transition but cannot change billing", async () => {
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, "staff/driver-1"), { status: "approved", role: "driver" });
    await setDoc(doc(db, "orders/driver-order"), {
      status: "new",
      assignedDriverUid: "driver-1",
      photos: [],
    });
  });
  const db = env.authenticatedContext("driver-1").firestore();
  await assertSucceeds(updateDoc(doc(db, "orders/driver-order"), {
    status: "confirmed",
    statusUpdatedAt: serverTimestamp(),
    lastUpdatedBy: "driver@example.com",
  }));
  await assertFails(updateDoc(doc(db, "orders/driver-order"), {
    paymentStatus: "paid",
  }));
  await assertFails(updateDoc(doc(db, "orders/driver-order"), {
    status: "delivered",
  }));
});

test("customer order edits allow preferences but reject payment and price changes", async () => {
  const trackKey = "customer-edit-track-key-123456789";
  await env.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "orders/customer-edit-order"), makeOrder({
      guest: false,
      uid: "customer-1",
      trackKey,
    }));
  });
  const db = env.authenticatedContext("customer-1").firestore();
  await assertSucceeds(updateDoc(doc(db, "orders/customer-edit-order"), {
    preferences: { detergent: "Persil" },
    editProof: trackKey,
  }));
  await assertFails(updateDoc(doc(db, "orders/customer-edit-order"), {
    finalTotal: 0.01,
  }));
  await assertFails(updateDoc(doc(db, "orders/customer-edit-order"), {
    stripePaymentIntentId: "pi_fake",
  }));
});

test("tracking document creation must point to its order and secret key", async () => {
  const db = env.unauthenticatedContext().firestore();
  const order = makeOrder();
  await assertSucceeds(setDoc(doc(db, "orders/order-track"), order));
  const track = {
    orderId: "order-track",
    ref: "12345678",
    status: "new",
    firstName: "Guest",
    pickupDate: order.pickup.date,
    pickupSlot: order.pickup.slot,
    laundry: true,
    dryCleaning: false,
    bagCount: 1,
    preferences: {},
    orderNotes: "",
    pickupNotes: "",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  await assertSucceeds(setDoc(doc(db, "orderTracks", order.trackKey), track));
  await assertFails(setDoc(doc(db, "orderTracks/unrelated-secret-key-123456"), track));
});
