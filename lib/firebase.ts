import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import {
  initializeFirestore,
  getFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from "firebase/firestore";
import { getStorage } from "firebase/storage";

const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

/**
 * Use the Firebase Auth domain Google already authorizes
 * (`*.firebaseapp.com/__/auth/handler`). Forcing `*.web.app` as authDomain
 * without adding that URI in Google Cloud Console causes
 * `redirect_uri_mismatch` on every Google popup.
 *
 * Popup auth (preferred) talks to firebaseapp.com via postMessage and works
 * while the app itself runs on foam-laundry-app.web.app.
 */
function resolveAuthDomain() {
  const raw = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN?.trim();
  if (raw?.endsWith(".web.app") && projectId) {
    return `${projectId}.firebaseapp.com`;
  }
  if (raw) return raw;
  return projectId ? `${projectId}.firebaseapp.com` : undefined;
}

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: resolveAuthDomain(),
  projectId,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

let dbInstance: Firestore | null = null;

function assertConfig() {
  if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
    throw new Error("Firebase env vars are missing. Check .env.local");
  }
}

export function getFirebaseApp() {
  assertConfig();
  return getApps().length ? getApp() : initializeApp(firebaseConfig);
}

export function getFirebaseAuth() {
  return getAuth(getFirebaseApp());
}

export function getFirebaseDb() {
  if (dbInstance) return dbInstance;
  const app = getFirebaseApp();
  try {
    // Cache locally so refresh can paint from disk before the network round-trip.
    dbInstance = initializeFirestore(app, {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager(),
      }),
    });
  } catch {
    dbInstance = getFirestore(app);
  }
  return dbInstance;
}

export function getFirebaseStorage() {
  return getStorage(getFirebaseApp());
}
