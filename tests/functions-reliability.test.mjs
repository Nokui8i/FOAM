import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";

const requireFunctions = createRequire(new URL("../functions/lib/index.js", import.meta.url));
const { getFirestore, Timestamp } = requireFunctions("firebase-admin/firestore");
const { acquireRefundLock, deleteOrderTrackProjection } = requireFunctions("./index.js");
const db = getFirestore();

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
