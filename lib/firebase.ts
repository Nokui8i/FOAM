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

/** Prefer *.web.app so Google redirect shares origin with Hosting (Safari/Chrome ITP). */
function resolveAuthDomain() {
  const raw = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN?.trim();
  if (raw?.endsWith(".firebaseapp.com") && projectId) {
    return `${projectId}.web.app`;
  }
  if (raw) return raw;
  return projectId ? `${projectId}.web.app` : undefined;
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
