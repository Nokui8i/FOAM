import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";

const requireFunctions = createRequire(new URL("../functions/lib/index.js", import.meta.url));
const { getFirestore, Timestamp } = requireFunctions("firebase-admin/firestore");
const {
  acquireRefundLock,
  collectPaymentIntentIds,
  consumeRateLimit,
  deleteOrderTrackProjection,
  requestClientIp,
  resolveChargeLedger,
  selectGuestPaymentIds,
  selectPaymentIntentId,
} = requireFunctions("./index.js");
const db = getFirestore();

test("payment intent ids and ledgers prefer order billing", () => {
  assert.equal(
    selectPaymentIntentId(
      { stripePaymentIntentId: "pi_billing" },
      { stripePaymentIntentId: "pi_legacy" }
    ),
    "pi_billing"
  );
  assert.equal(
    selectPaymentIntentId(
      { stripePaymentIntentId: "" },
      { stripePaymentIntentId: "pi_legacy" }
    ),
    "pi_legacy"
  );
  const billingLedger = [{ paymentIntentId: "pi_billing", amount: 10, refunded: 0 }];
  assert.deepEqual(
    resolveChargeLedger(
      { chargeLedger: billingLedger },
      { chargeLedger: [{ paymentIntentId: "pi_legacy", amount: 5, refunded: 0 }] }
    ),
    billingLedger
  );
  assert.deepEqual(
    resolveChargeLedger(
      { chargeLedger: [] },
      {
        stripePaymentIntentId: "pi_only",
        finalTotal: 55,
        refundAmount: 10,
      }
    ),
    [{ paymentIntentId: "pi_only", amount: 55, refunded: 10 }]
  );
  assert.deepEqual(
    collectPaymentIntentIds(
      {
        stripePaymentIntentId: "pi_billing",
        chargeLedger: [{ paymentIntentId: "pi_billing", amount: 10, refunded: 0 }],
      },
      {
        stripePaymentIntentId: "pi_billing",
        chargeLedger: [{ paymentIntentId: "pi_legacy", amount: 5, refunded: 0 }],
      }
    ),
    ["pi_billing", "pi_legacy"]
  );
});

test("unauthenticated callers are rate limited without a shared empty address", async () => {
  assert.equal(
    requestClientIp({
      rawRequest: { headers: { "x-forwarded-for": "198.51.100.9, 203.0.113.8, 35.191.0.1" } },
    }),
    "203.0.113.8"
  );
  assert.equal(requestClientIp({}), "");
  const bucket = `unit-${Date.now()}`;
  await consumeRateLimit(db, bucket, 1, 60_000);
  await assert.rejects(() => consumeRateLimit(db, bucket, 1, 60_000));
});

test("guest payment ids prefer order billing and fall back to the order", () => {
  assert.deepEqual(
    selectGuestPaymentIds(
      { stripeCustomerId: "cus_billing", stripePaymentMethodId: "pm_billing" },
      { stripeCustomerId: "cus_legacy", stripePaymentMethodId: "pm_legacy" }
    ),
    { customerId: "cus_billing", paymentMethodId: "pm_billing" }
  );
  assert.deepEqual(
    selectGuestPaymentIds(
      { stripeCustomerId: "", stripePaymentMethodId: "" },
      { stripeCustomerId: "cus_legacy", stripePaymentMethodId: "pm_legacy" }
    ),
    { customerId: "cus_legacy", paymentMethodId: "pm_legacy" }
  );
});

test("order deletion removes only its own tracking projection", async () => {
  const trackKey = "tracking-delete-test-key-123456789";
  const trackRef = db.doc(`orderTracks/${trackKey}`);
  await trackRef.set({ orderId: "order-delete-test", status: "new" });

  await deleteOrderTrackProjection(db, "different-order", trackKey);
  assert.equal((await trackRef.get()).exists, true);

  await deleteOrderTrackProjection(db, "order-delete-test", trackKey);
  assert.equal((await trackRef.get()).exists, false);
});

test("refund lock blocks a concurrent amount and reuses its id after an uncertain retry", async () => {
  const orderRef = db.doc("orders/refund-lock-test");
  const ledger = [{ paymentIntentId: "pi_test_refund_lock", amount: 50, refunded: 0 }];
  await orderRef.set({ chargeLedger: ledger });
  const fingerprint = JSON.stringify({ amountCents: 1000, reason: "test" });

  const attemptId = await acquireRefundLock(orderRef, fingerprint, ledger);
  await assert.rejects(
    acquireRefundLock(orderRef, JSON.stringify({ amountCents: 2000 }), ledger),
    /Refund already in progress/
  );

  await orderRef.set({
    refundLockAt: Timestamp.fromMillis(Date.now() - 120_000),
  }, { merge: true });
  const retryId = await acquireRefundLock(orderRef, fingerprint, ledger);
  assert.equal(retryId, attemptId);
});
