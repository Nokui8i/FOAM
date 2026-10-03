import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { createRequire } from "node:module";

const requireFunctions = createRequire(new URL("../functions/lib/index.js", import.meta.url));
const { getFirestore, Timestamp } = requireFunctions("firebase-admin/firestore");
const { computeAuthoritativeCharge } = requireFunctions("./index.js");
const db = getFirestore();

const rates = {
  weeklyPerLb: 2.35,
  standardPerLb: 2.6,
  deliveryFee: 5,
  minimumOrder: 50,
};

function makeOrder(overrides = {}) {
  return {
    uid: null,
    services: { laundry: true, dryCleaning: false, bagCount: 1 },
    pickup: { repeat: false },
    pricing: {
      tier: "standard",
      laundryRatePerLb: rates.standardPerLb,
      deliveryFee: rates.deliveryFee,
      minimumOrder: rates.minimumOrder,
      tip: 5,
      repeatDiscountEligible: false,
      repeatDiscountPercent: 0,
      promoCode: "",
      promoDiscountType: null,
      promoDiscountValue: null,
      promoIncludesFee: false,
    },
    tip: 5,
    promoCode: "",
    ...overrides,
  };
}

before(async () => {
  await db.doc("config/laundryRates").set(rates);
  await db.doc("config/dryCleanCatalog").set({
    items: [{ name: "Shirt", price: 6.55, department: "tops" }],
  });
});

beforeEach(async () => {
  await db.doc("config/dryCleanCatalog").set({
    items: [{ name: "Shirt", price: 6.55, department: "tops" }],
  });
});

after(async () => {
  // The emulator is disposable; its database is isolated from production.
});

test("server computes laundry, delivery and tip instead of trusting caller total", async () => {
  const order = makeOrder();
  const charge = await computeAuthoritativeCharge(db, "charge-laundry", order, {
    weightLbs: 20,
    dryCleanItems: [],
    finalTotal: 62,
  });
  assert.equal(charge.finalTotal, 62);
  await assert.rejects(
    computeAuthoritativeCharge(db, "charge-laundry", order, {
      weightLbs: 20,
      dryCleanItems: [],
      finalTotal: 0.5,
    }),
    /Order total is \$62\.00/
  );
});

test("server rejects dry-clean line prices that differ from the catalog", async () => {
  await assert.rejects(
    computeAuthoritativeCharge(db, "charge-dry", makeOrder(), {
      weightLbs: 20,
      dryCleanItems: [{ name: "Shirt", price: 0.01 }],
      finalTotal: 56.01,
    }),
    /does not match the catalog/
  );
});

test("server rejects a client-tampered rate snapshot", async () => {
  const order = makeOrder({
    pricing: { ...makeOrder().pricing, laundryRatePerLb: 0.01 },
  });
  await assert.rejects(
    computeAuthoritativeCharge(db, "charge-forged-rate", order, {
      weightLbs: 20,
      dryCleanItems: [],
      finalTotal: 50,
    }),
    /Order pricing changed/
  );
});

test("server uses the active promo document to calculate the discount", async () => {
  await db.doc("promoCodes/SAVE10").set({
    code: "SAVE10",
    active: true,
    discountType: "percent",
    discountValue: 10,
    includesFee: false,
    limitMode: "uses",
    maxUses: 100,
    usedCount: 0,
  });
  const order = makeOrder({
    promoCode: "SAVE10",
    pricing: {
      ...makeOrder().pricing,
      promoCode: "SAVE10",
      promoDiscountType: "percent",
      promoDiscountValue: 10,
      promoIncludesFee: false,
    },
  });
  const charge = await computeAuthoritativeCharge(db, "charge-promo", order, {
    weightLbs: 20,
    dryCleanItems: [],
    finalTotal: 56.8,
  });
  assert.equal(charge.finalTotal, 56.8);
  assert.equal(charge.promoDiscountAmount, 5.2);
  assert.equal(charge.promoCodeUsed, "SAVE10");
});

test("a deleted promo cannot authorize a discount from the order snapshot", async () => {
  const order = makeOrder({
    promoCode: "OLDPROMO",
    pricing: {
      ...makeOrder().pricing,
      promoCode: "OLDPROMO",
      promoDiscountType: "percent",
      promoDiscountValue: 100,
    },
  });
  await assert.rejects(
    computeAuthoritativeCharge(db, "charge-deleted-promo", order, {
      weightLbs: 20,
      dryCleanItems: [],
      finalTotal: 0,
    }),
    /Promo code is no longer available/
  );
});

test("server applies repeat discount only when a prior repeat order exists", async () => {
  const now = Date.now();
  await db.doc("orders/charge-repeat-prior").set({
    uid: "repeat-customer",
    pickup: { repeat: true },
    createdAt: Timestamp.fromMillis(now - 60_000),
  });
  const order = makeOrder({
    uid: "repeat-customer",
    pickup: { repeat: true },
    pricing: {
      ...makeOrder().pricing,
      tier: "weekly",
      laundryRatePerLb: rates.weeklyPerLb,
      repeatDiscountEligible: true,
      repeatDiscountPercent: 10,
      tip: 0,
    },
    tip: 0,
  });
  const charge = await computeAuthoritativeCharge(db, "charge-repeat-current", order, {
    weightLbs: 30,
    dryCleanItems: [],
    finalTotal: 68.45,
  });
  assert.equal(charge.finalTotal, 68.45);
});
