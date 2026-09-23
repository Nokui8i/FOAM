/**
 * Backfill incomplete order.preferences to the full wash-preference shape.
 * Usage: node scripts/backfill-wash-prefs.mjs
 */
import { readFileSync } from "fs";
import { initializeApp } from "firebase/app";
import {
  getFirestore,
  collection,
  getDocs,
  updateDoc,
  doc,
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

const app = initializeApp({
  apiKey: env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.NEXT_PUBLIC_FIREBASE_APP_ID,
});

const db = getFirestore(app);

const DEFAULTS = {
  pants: "Folded",
  dresses: "Folded",
  detergent: "Persil",
  softener: "No softener",
  whitesWashTemp: "Cold wash",
  colorsWashTemp: "Cold wash",
  whitesDryerHeat: "Low",
  colorsDryerHeat: "Low",
};

const REQUIRED = Object.keys(DEFAULTS);

const snap = await getDocs(collection(db, "orders"));
let updated = 0;

for (const d of snap.docs) {
  const data = d.data();
  const prefs = { ...(data.preferences ?? {}) };
  const missing = REQUIRED.some((key) => !String(prefs[key] ?? "").trim());
  if (!missing) continue;

  if (prefs.detergent === "Free & Clear") prefs.detergent = "All Free and Clear";
  if (prefs.softener === "None") prefs.softener = "No softener";

  const merged = { ...DEFAULTS, ...prefs };
  for (const key of REQUIRED) {
    if (!String(merged[key] ?? "").trim()) merged[key] = DEFAULTS[key];
  }

  await updateDoc(doc(db, "orders", d.id), { preferences: merged });
  updated += 1;
  console.log("updated", d.id, data?.contact?.name ?? "", merged);
}

console.log("done updated=", updated);
process.exit(0);
