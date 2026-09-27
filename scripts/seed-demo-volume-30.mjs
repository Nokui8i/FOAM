/**
 * Seed 30 DEMO rows for each Ops list:
 * - Orders (today, waiting)
 * - Future / Alerts (pickup in 3 days → both Future + Alerts badges)
 * - History (delivered)
 * - Support (contactMessages)
 *
 * Usage: node scripts/seed-demo-volume-30.mjs
 */
import { readFileSync } from "fs";
import { initializeApp } from "firebase/app";
import {
  getFirestore,
  collection,
  addDoc,
  doc,
  setDoc,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";

const COUNT = 30;
const DEMO_BATCH = "volume-30-2026-09-27";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => {
      const i = line.indexOf("=");
      return [
        line.slice(0, i).trim(),
        line
          .slice(i + 1)
          .trim()
          .replace(/^["']|["']$/g, ""),
      ];
    })
);

function todayLasVegas() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function addDaysYmd(ymd, days) {
  const base = new Date(`${ymd}T12:00:00Z`);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

function makeTrackKey() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function orderRefFromId(orderId) {
  let hash = 2166136261;
  for (let i = 0; i < orderId.length; i++) {
    hash ^= orderId.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return String(10000000 + ((hash >>> 0) % 90000000));
}

const SLOTS = ["7am - 10am", "10am - 1pm", "1pm - 4pm", "4pm - 7pm"];

const app = initializeApp({
  apiKey: env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.NEXT_PUBLIC_FIREBASE_APP_ID,
});

const db = getFirestore(app);
const today = todayLasVegas();
const alertDate = addDaysYmd(today, 3);
const historyDate = addDaysYmd(today, -5);

async function seedOrder({
  kind,
  index,
  pickupDate,
  status,
  slot,
}) {
  const trackKey = makeTrackKey();
  const n = String(index + 1).padStart(2, "0");
  const payload = {
    status,
    guest: true,
    uid: null,
    trackKey,
    demoBatch: DEMO_BATCH,
    demoKind: kind,
    services: {
      laundry: true,
      dryCleaning: index % 3 === 0,
      bagCount: 1 + (index % 4),
    },
    contact: {
      name: `Demo ${kind} ${n}`,
      email: `demo.${kind}.${n}@example.com`,
      phone: `702555${String(1000 + index).slice(-4)}`,
    },
    pickup: {
      address: `${3700 + index} Demo Las Vegas Blvd`,
      unit: String(100 + index),
      city: "Las Vegas",
      zip: "89109",
      notes: `DEMO ${kind} #${n} — ${DEMO_BATCH}`,
      date: pickupDate,
      slot,
      repeat: kind === "alerts",
      repeatRequested: kind === "alerts",
    },
    preferences: {
      pants: "Folded",
      dresses: "Folded",
      detergent: "All Free and Clear",
      softener: "No softener",
      whitesWashTemp: "Cold wash",
      colorsWashTemp: "Cold wash",
      whitesDryerHeat: "Low",
      colorsDryerHeat: "Low",
    },
    orderNotes: `DEMO volume seed — ${kind} #${n}`,
    pricing: {
      mode: "per_lb",
      tier: kind === "alerts" ? "weekly" : "standard",
      laundryRatePerLb: kind === "alerts" ? 2.35 : 2.6,
      deliveryFee: 5,
      minimumOrder: 50,
      tip: 0,
      promoCode: "",
      finalTotalPending: status !== "delivered",
      repeatDiscountEligible: kind === "alerts",
      repeatDiscountPercent: kind === "alerts" ? 10 : 0,
    },
    tip: 0,
    promoCode: "",
    automatedWeekly: kind === "alerts",
    createdAt: serverTimestamp(),
  };

  if (status === "delivered") {
    payload.weightLbs = 12 + (index % 8);
    payload.finalTotal = 40 + index * 1.25;
    payload.deliveredAt = Timestamp.fromDate(
      new Date(`${pickupDate}T20:00:00Z`)
    );
  }

  const ref = await addDoc(collection(db, "orders"), payload);
  const displayRef = orderRefFromId(ref.id);
  await setDoc(doc(db, "orderTracks", trackKey), {
    orderId: ref.id,
    ref: displayRef,
    status,
    firstName: "Demo",
    pickupDate,
    pickupSlot: slot,
    laundry: true,
    dryCleaning: index % 3 === 0,
    bagCount: 1 + (index % 4),
    demoBatch: DEMO_BATCH,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

async function seedSupport(index) {
  const n = String(index + 1).padStart(2, "0");
  const ref = await addDoc(collection(db, "contactMessages"), {
    name: `Demo Support ${n}`,
    email: `demo.support.${n}@example.com`,
    phone: `702555${String(2000 + index).slice(-4)}`,
    topic: `DEMO support #${n}`,
    message: `Hi FOAM — DEMO support message #${n} (${DEMO_BATCH}). Please help with scheduling.`,
    status: "new",
    read: false,
    demoBatch: DEMO_BATCH,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

const summary = {
  batch: DEMO_BATCH,
  orders: [],
  alertsFuture: [],
  history: [],
  support: [],
};

console.log(`Seeding ${COUNT} × Orders / Future+Alerts / History / Support…`);

for (let i = 0; i < COUNT; i++) {
  const slot = SLOTS[i % SLOTS.length];
  summary.orders.push(
    await seedOrder({
      kind: "orders",
      index: i,
      pickupDate: today,
      status: "new",
      slot,
    })
  );
  summary.alertsFuture.push(
    await seedOrder({
      kind: "alerts",
      index: i,
      pickupDate: alertDate,
      status: "new",
      slot,
    })
  );
  summary.history.push(
    await seedOrder({
      kind: "history",
      index: i,
      pickupDate: historyDate,
      status: "delivered",
      slot,
    })
  );
  summary.support.push(await seedSupport(i));
  if ((i + 1) % 5 === 0) console.log(`  … ${i + 1}/${COUNT}`);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      batch: DEMO_BATCH,
      counts: {
        ordersToday: summary.orders.length,
        futureAndAlerts: summary.alertsFuture.length,
        history: summary.history.length,
        support: summary.support.length,
      },
      opsUrl: "https://foam-laundry-app.web.app/ops",
      note: "Future + Alerts share the +3-day DEMO orders so each badge shows 30.",
    },
    null,
    2
  )
);

process.exit(0);
