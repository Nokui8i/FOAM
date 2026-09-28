import { initializeApp, getApps, getApp } from "firebase/app";
import {
  browserSessionPersistence,
  getAuth,
  initializeAuth,
  setPersistence,
  type Auth,
} from "firebase/auth";
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
let authInstance: Auth | null = null;

function assertConfig() {
  if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
    throw new Error("Firebase env vars are missing. Check .env.local");
  }
}

export function getFirebaseApp() {
  assertConfig();
  return getApps().length ? getApp() : initializeApp(firebaseConfig);
}

/**
 * Session persistence (sessionStorage) — one login per browser tab/window.
 * OPS, Driver, and other tabs do not share Auth; each can use a different user.
 */
export function getFirebaseAuth() {
  if (authInstance) return authInstance;
  const app = getFirebaseApp();
  try {
    authInstance = initializeAuth(app, {
      persistence: browserSessionPersistence,
    });
  } catch {
    // Already initialized in this runtime (HMR / duplicate import).
    authInstance = getAuth(app);
    void setPersistence(authInstance, browserSessionPersistence).catch(
      () => undefined
    );
  }
  return authInstance;
}

/** Resolves once Auth is ready (session persistence already applied at init). */
export function readyFirebaseAuth(): Promise<Auth> {
  return Promise.resolve(getFirebaseAuth());
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
