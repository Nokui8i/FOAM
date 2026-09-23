/**
 * Seed a DEMO order whose pickup is in 3 days (Las Vegas) so it appears in Ops → Alerts.
 * Usage: node scripts/seed-demo-alert.mjs
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
} from "firebase/firestore";

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

const app = initializeApp({
  apiKey: env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.NEXT_PUBLIC_FIREBASE_APP_ID,
});

const db = getFirestore(app);
const trackKey = makeTrackKey();
const pickupDate = addDaysYmd(todayLasVegas(), 3);

const payload = {
  status: "new",
  guest: true,
  uid: null,
  trackKey,
  services: {
    laundry: true,
    dryCleaning: false,
    bagCount: 2,
  },
  contact: {
    name: "Alert Demo Customer",
    email: "alert.demo@example.com",
    phone: "7025550188",
  },
  pickup: {
    address: "3720 Howard Hughes Pkwy",
    unit: "512",
    city: "Las Vegas",
    zip: "89169",
    notes: "DEMO alert — leave bags by the door. Gate code 4412.",
    date: pickupDate,
    slot: "10am - 1pm",
    repeat: true,
    repeatRequested: true,
  },
  preferences: {
    pants: "Folded",
    dresses: "Folded",
    detergent: "All Free and Clear",
    softener: "Downy",
    whitesWashTemp: "Cold wash",
    colorsWashTemp: "Cold wash",
    whitesDryerHeat: "Low",
    colorsDryerHeat: "Low",
  },
  orderNotes: "DEMO — appears under Ops → Alerts (3 days out).",
  pricing: {
    mode: "weighed_at_pickup",
    tier: "weekly",
    laundryRatePerLb: 2.35,
    deliveryFee: 5,
    minimumOrder: 50,
    tip: 5,
    promoCode: "",
    finalTotalPending: true,
    repeatDiscountEligible: true,
    repeatDiscountPercent: 10,
  },
  tip: 5,
  promoCode: "",
  automatedWeekly: true,
  createdAt: serverTimestamp(),
};

const ref = await addDoc(collection(db, "orders"), payload);
const displayRef = orderRefFromId(ref.id);

await setDoc(doc(db, "orderTracks", trackKey), {
  orderId: ref.id,
  ref: displayRef,
  status: "new",
  firstName: "Alert",
  pickupDate,
  pickupSlot: "10am - 1pm",
  laundry: true,
  dryCleaning: false,
  bagCount: 2,
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
});

console.log(
  JSON.stringify(
    {
      ok: true,
      orderId: ref.id,
      displayRef: `#${displayRef}`,
      pickupDate,
      daysUntil: 3,
      alertsUrl: "https://foam-laundry-app.web.app/ops?tab=alerts",
    },
    null,
    2
  )
);

process.exit(0);
