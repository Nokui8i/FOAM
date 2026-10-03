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
  getDoc,
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
  const anonymous = env.unauthenticatedContext().firestore();
  await assertFails(setDoc(doc(anonymous, "orders/order-safe"), makeOrder()));
  const db = env.authenticatedContext("customer-1").firestore();
  await assertSucceeds(setDoc(doc(db, "orders/order-safe"), makeOrder({
    guest: false,
    uid: "customer-1",
  })));
  await assertFails(setDoc(
    doc(db, "orders/order-injected"),
    makeOrder({
      guest: false,
      uid: "customer-1",
      paymentStatus: "paid",
      finalTotal: 0.01,
      stripePaymentIntentId: "pi_fake",
      chargeLedger: [{ paymentIntentId: "pi_fake", amount: 1, refunded: 0 }],
    })
  ));
  await assertFails(setDoc(
    doc(db, "orders/order-card-meta"),
    makeOrder({
      guest: false,
      uid: "customer-1",
      stripeCustomerId: "cus_secret",
      stripePaymentMethodId: "pm_secret",
      cardBrand: "visa",
      cardLast4: "0019",
      cardExpMonth: 1,
      cardExpYear: 2028,
    })
  ));
});

test("order pricing snapshot must match current server configuration", async () => {
  const db = env.authenticatedContext("customer-1").firestore();
  const tampered = makeOrder({ guest: false, uid: "customer-1" });
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
  const db = env.authenticatedContext("customer-1").firestore();
  const order = makeOrder({ guest: false, uid: "customer-1", promoCode: "SAVE10" });
  order.pricing.promoCode = "SAVE10";
  order.pricing.promoDiscountType = "percent";
  order.pricing.promoDiscountValue = 10;
  await assertSucceeds(setDoc(doc(db, "orders/order-promo"), order));

  const forged = makeOrder({ guest: false, uid: "customer-1", promoCode: "SAVE10" });
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

  const admin = env.authenticatedContext("owner", { email: "paylocksmith@gmail.com", email_verified: true }).firestore();
  await assertSucceeds(setDoc(doc(admin, "pickupAvailability/2026-10-10"), update));
});

test("clients cannot read order billing documents", async () => {
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, "staff/driver-1"), { status: "approved", role: "driver" });
    await setDoc(doc(db, "orderBilling/assigned-order"), {
      stripeCustomerId: "cus_secret",
      stripePaymentMethodId: "pm_secret",
      cardLast4: "0019",
    });
    await setDoc(doc(db, "orders/assigned-order"), {
      ...makeOrder({ guest: false, uid: "customer-1" }),
      assignedDriverUid: "driver-1",
    });
  });
  const driver = env.authenticatedContext("driver-1").firestore();
  await assertFails(getDoc(doc(driver, "orderBilling/assigned-order")));
  await assertSucceeds(getDoc(doc(driver, "orders/assigned-order")));
  const customer = env.authenticatedContext("customer-1").firestore();
  await assertFails(getDoc(doc(customer, "orderBilling/assigned-order")));
  const admin = env.authenticatedContext("owner", { email: "paylocksmith@gmail.com", email_verified: true }).firestore();
  await assertFails(getDoc(doc(admin, "orderBilling/assigned-order")));
  await assertFails(setDoc(doc(driver, "orderBilling/assigned-order"), { cardLast4: "0000" }));
  await assertFails(getDoc(doc(driver, "rateLimits/guest-setup")));
  await assertFails(setDoc(doc(admin, "rateLimits/guest-setup"), { count: 1 }));
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), "rateLimits/guest-setup")));
});

test("approved driver cannot read customer profiles", async () => {
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, "staff/driver-1"), { status: "approved", role: "driver" });
    await setDoc(doc(db, "users/customer-1"), {
      uid: "customer-1",
      email: "customer@example.com",
      name: "Customer",
      stripeCustomerId: "cus_secret",
      stripePaymentMethodId: "pm_secret",
      cardBrand: "visa",
      cardLast4: "0019",
    });
    await setDoc(doc(db, "orders/assigned-order"), {
      ...makeOrder({ guest: false, uid: "customer-1" }),
      assignedDriverUid: "driver-1",
      contact: { name: "Customer", email: "customer@example.com", phone: "7025550100" },
    });
  });
  const driver = env.authenticatedContext("driver-1").firestore();
  await assertFails(getDoc(doc(driver, "users/customer-1")));
  await assertSucceeds(getDoc(doc(driver, "orders/assigned-order")));

  const customer = env.authenticatedContext("customer-1").firestore();
  await assertSucceeds(getDoc(doc(customer, "users/customer-1")));

  const admin = env.authenticatedContext("owner", { email: "paylocksmith@gmail.com", email_verified: true }).firestore();
  await assertSucceeds(getDoc(doc(admin, "users/customer-1")));
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

test("signed-in customer can create only their own order", async () => {
  const db = env.authenticatedContext("customer-1").firestore();
  await assertSucceeds(setDoc(doc(db, "orders/mine"), makeOrder({
    guest: false,
    uid: "customer-1",
  })));
  await assertFails(setDoc(doc(db, "orders/other"), makeOrder({
    guest: false,
    uid: "customer-2",
  })));
  await assertFails(setDoc(doc(db, "orders/as-guest"), makeOrder()));
});

test("tracking document creation must point to its order and secret key", async () => {
  const order = makeOrder();
  await env.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "orders/order-track"), order);
  });
  const db = env.unauthenticatedContext().firestore();
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
