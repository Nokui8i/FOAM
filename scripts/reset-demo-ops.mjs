/**
 * Clear demo ops data in Firestore, then seed one Waiting DEMO order for today (Las Vegas).
 * Uses gcloud access token for admin deletes + public client create for the new order.
 *
 * Usage (PowerShell):
 *   $env:GCLOUD_ACCESS_TOKEN = (gcloud auth print-access-token)
 *   node scripts/reset-demo-ops.mjs
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

const PROJECT = "foam-laundry-app";
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;

const token = process.env.GCLOUD_ACCESS_TOKEN?.trim();
if (!token) {
  console.error("Missing GCLOUD_ACCESS_TOKEN");
  process.exit(1);
}

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

function makeTrackKey() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function orderDisplayRef(orderId) {
  let hash = 2166136261;
  for (let i = 0; i < orderId.length; i++) {
    hash ^= orderId.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return String(10000000 + ((hash >>> 0) % 90000000));
}

async function listDocs(collectionId) {
  const out = [];
  let pageToken = "";
  do {
    const url = new URL(`${BASE}/${collectionId}`);
    url.searchParams.set("pageSize", "100");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      throw new Error(`List ${collectionId} failed: ${res.status} ${await res.text()}`);
    }
    const json = await res.json();
    for (const doc of json.documents ?? []) {
      const id = doc.name.split("/").pop();
      const fields = doc.fields ?? {};
      out.push({ id, fields });
    }
    pageToken = json.nextPageToken ?? "";
  } while (pageToken);
  return out;
}

async function deleteDocPath(collectionId, id) {
  const res = await fetch(`${BASE}/${collectionId}/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok && res.status !== 404) {
    throw new Error(`Delete ${collectionId}/${id}: ${res.status} ${await res.text()}`);
  }
}

function fieldString(fields, key) {
  return fields?.[key]?.stringValue ?? "";
}

// --- wipe existing ---
const orders = await listDocs("orders");
const contacts = await listDocs("contactMessages");
console.log(`Found ${orders.length} order(s), ${contacts.length} support message(s).`);

for (const order of orders) {
  const trackKey = fieldString(order.fields, "trackKey");
  if (trackKey) {
    await deleteDocPath("orderTracks", trackKey);
    console.log("deleted track", trackKey);
  }
  await deleteDocPath("orders", order.id);
  console.log("deleted order", order.id);
}

for (const contact of contacts) {
  await deleteDocPath("contactMessages", contact.id);
  console.log("deleted support", contact.id, fieldString(contact.fields, "name"));
}

// --- seed DEMO order (guest create via client SDK) ---
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
const pickupDate = todayLasVegas();

const payload = {
  status: "new",
  guest: true,
  uid: null,
  trackKey,
  services: {
    laundry: true,
    dryCleaning: true,
    bagCount: 2,
  },
  contact: {
    name: "Demo Customer",
    email: "demo.customer@example.com",
    phone: "7025550199",
  },
  pickup: {
    address: "3720 Howard Hughes Pkwy",
    unit: "411",
    city: "Las Vegas",
    zip: "89169",
    notes: "DEMO order — call at the gate. Hypoallergenic detergent.",
    date: pickupDate,
    slot: "7am - 10am",
    repeat: false,
    repeatRequested: false,
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
  orderNotes: "DEMO — use this to walk through pickup → charge → delivery.",
  pricing: {
    mode: "per_lb",
    tier: "standard",
    laundryRatePerLb: 2.6,
    deliveryFee: 5,
    minimumOrder: 50,
    tip: 0,
    promoCode: "",
    finalTotalPending: true,
    repeatDiscountEligible: false,
    repeatDiscountPercent: 0,
  },
  tip: 0,
  promoCode: "",
  createdAt: serverTimestamp(),
};

const ref = await addDoc(collection(db, "orders"), payload);
const displayRef = orderDisplayRef(ref.id);

await setDoc(doc(db, "orderTracks", trackKey), {
  orderId: ref.id,
  ref: displayRef,
  status: "new",
  firstName: "Demo",
  pickupDate,
  pickupSlot: "7am - 10am",
  laundry: true,
  dryCleaning: true,
  bagCount: 2,
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
});

console.log(
  JSON.stringify(
    {
      ok: true,
      orderId: ref.id,
      displayRef,
      trackKey,
      pickupDate,
      trackUrl: `https://foam-laundry-app.web.app/track?k=${trackKey}`,
    },
    null,
    2
  )
);
