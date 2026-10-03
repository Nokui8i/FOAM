import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";

const requireFunctions = createRequire(
  new URL("../functions/lib/index.js", import.meta.url)
);
requireFunctions("./index.js");
const { getFirestore, Timestamp } = requireFunctions("firebase-admin/firestore");
const {
  DATA_RETENTION_DAYS,
  purgeExpiredOpsData,
  shouldPurgeContact,
  shouldPurgeOrder,
} = requireFunctions("./retention.js");
const { deleteOrderDependents } = requireFunctions("./order-cleanup.js");

const db = getFirestore();
const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse("2026-10-03T12:00:00.000Z");
const CUTOFF = NOW - DATA_RETENTION_DAYS * DAY;

function at(ms) {
  return Timestamp.fromMillis(ms);
}

test("retention period stays 365 days", () => {
  assert.equal(DATA_RETENTION_DAYS, 365);
});

test("delivered order older than 365 days is deleted", () => {
  assert.equal(
    shouldPurgeOrder(
      { status: "delivered", statusUpdatedAt: at(CUTOFF - 1), createdAt: at(CUTOFF - DAY) },
      CUTOFF
    ),
    true
  );
});

test("delivered order within 365 days is retained", () => {
  assert.equal(
    shouldPurgeOrder(
      { status: "delivered", statusUpdatedAt: at(CUTOFF), createdAt: at(CUTOFF - 10 * DAY) },
      CUTOFF
    ),
    false
  );
  assert.equal(
    shouldPurgeOrder(
      { status: "delivered", statusUpdatedAt: at(NOW - DAY), createdAt: at(NOW - 2 * DAY) },
      CUTOFF
    ),
    false
  );
});

test("delivered order uses createdAt when statusUpdatedAt is missing", () => {
  assert.equal(
    shouldPurgeOrder(
      { status: "delivered", createdAt: at(CUTOFF - DAY) },
      CUTOFF
    ),
    true
  );
  assert.equal(
    shouldPurgeOrder(
      { status: "delivered", createdAt: "2026-09-01T12:00:00.000Z" },
      CUTOFF
    ),
    false
  );
});

test("cancelled order is deleted", () => {
  assert.equal(
    shouldPurgeOrder(
      { status: "cancelled", createdAt: at(NOW), statusUpdatedAt: at(NOW) },
      CUTOFF
    ),
    true
  );
});

test("non-delivered order older than 365 days is deleted", () => {
  assert.equal(
    shouldPurgeOrder(
      {
        status: "washing",
        createdAt: at(CUTOFF - DAY),
        pickup: { date: "2020-01-01" },
      },
      CUTOFF
    ),
    true
  );
});

test("non-delivered order with a current or future pickup date is retained", () => {
  assert.equal(
    shouldPurgeOrder(
      {
        status: "new",
        createdAt: at(CUTOFF - DAY),
        pickup: { date: "2026-10-03" },
      },
      CUTOFF
    ),
    false
  );
});

test("contact messages follow 365 days from createdAt", () => {
  assert.equal(shouldPurgeContact(at(CUTOFF - 1), CUTOFF), true);
  assert.equal(shouldPurgeContact(at(CUTOFF), CUTOFF), false);
  assert.equal(shouldPurgeContact(at(NOW), CUTOFF), false);
});

test("permanent order deletion also deletes orderBilling and its track", async () => {
  const orderId = `ret-delete-${Date.now()}`;
  const trackKey = `track-delete-${orderId}-key`;
  await db.doc(`orders/${orderId}`).set({
    status: "new",
    trackKey,
    createdAt: at(NOW),
  });
  await db.doc(`orderBilling/${orderId}`).set({
    cardLast4: "4242",
    updatedAt: at(NOW),
  });
  await db.doc(`orderTracks/${trackKey}`).set({ orderId, status: "new" });
  await db.doc("orderBilling/someone-else").set({ cardLast4: "0000" });

  await deleteOrderDependents(db, orderId, { trackKey });
  await db.doc(`orders/${orderId}`).delete();

  assert.equal((await db.doc(`orders/${orderId}`).get()).exists, false);
  assert.equal((await db.doc(`orderBilling/${orderId}`).get()).exists, false);
  assert.equal((await db.doc(`orderTracks/${trackKey}`).get()).exists, false);
  assert.equal((await db.doc("orderBilling/someone-else").get()).exists, true);
});

test("retention purge deletes expired orders with billing and keeps the rest", async () => {
  const stamp = Date.now();
  const oldDelivered = `ret-old-delivered-${stamp}`;
  const recentDelivered = `ret-recent-delivered-${stamp}`;
  const fallbackOld = `ret-fallback-old-${stamp}`;
  const cancelled = `ret-cancelled-${stamp}`;
  const oldOpen = `ret-old-open-${stamp}`;
  const futurePickup = `ret-future-pickup-${stamp}`;
  const oldContact = `ret-old-contact-${stamp}`;
  const newContact = `ret-new-contact-${stamp}`;

  async function seed(id, data) {
    await db.doc(`orders/${id}`).set(data);
    await db.doc(`orderBilling/${id}`).set({
      cardLast4: "4242",
      updatedAt: at(NOW - 2 * DAY),
    });
  }

  await seed(oldDelivered, {
    status: "delivered",
    statusUpdatedAt: at(CUTOFF - DAY),
    createdAt: at(CUTOFF - 2 * DAY),
    trackKey: `track-${oldDelivered}-abcd`,
  });
  await db.doc(`orderTracks/track-${oldDelivered}-abcd`).set({ orderId: oldDelivered });

  await seed(recentDelivered, {
    status: "delivered",
    statusUpdatedAt: at(NOW - DAY),
    createdAt: at(NOW - 2 * DAY),
  });
  await seed(fallbackOld, {
    status: "delivered",
    createdAt: at(CUTOFF - DAY),
  });
  await seed(cancelled, {
    status: "cancelled",
    createdAt: at(NOW),
    statusUpdatedAt: at(NOW),
  });
  await seed(oldOpen, {
    status: "picked_up",
    createdAt: at(CUTOFF - DAY),
    pickup: { date: "2020-06-01" },
  });
  await seed(futurePickup, {
    status: "confirmed",
    createdAt: at(CUTOFF - DAY),
    pickup: { date: "2026-12-01" },
  });
  await db.doc(`contactMessages/${oldContact}`).set({
    createdAt: at(CUTOFF - DAY),
    email: "old@example.com",
  });
  await db.doc(`contactMessages/${newContact}`).set({
    createdAt: at(NOW),
    email: "new@example.com",
  });

  await purgeExpiredOpsData(NOW);

  for (const id of [oldDelivered, fallbackOld, cancelled, oldOpen]) {
    assert.equal((await db.doc(`orders/${id}`).get()).exists, false, id);
    assert.equal((await db.doc(`orderBilling/${id}`).get()).exists, false, `${id} billing`);
  }
  assert.equal(
    (await db.doc(`orderTracks/track-${oldDelivered}-abcd`).get()).exists,
    false
  );
  for (const id of [recentDelivered, futurePickup]) {
    assert.equal((await db.doc(`orders/${id}`).get()).exists, true, id);
    assert.equal((await db.doc(`orderBilling/${id}`).get()).exists, true, `${id} billing`);
  }
  assert.equal((await db.doc(`contactMessages/${oldContact}`).get()).exists, false);
  assert.equal((await db.doc(`contactMessages/${newContact}`).get()).exists, true);
});
