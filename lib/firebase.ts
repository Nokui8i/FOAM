import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import {
  browserLocalPersistence,
  browserPopupRedirectResolver,
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
const STAFF_APP_NAME = "foam-staff";

/**
 * Use the Firebase Auth domain Google already authorizes
 * (`*.firebaseapp.com/__/auth/handler`). Forcing `*.web.app` as authDomain
 * without adding that URI in Google Cloud Console causes
 * `redirect_uri_mismatch` on every Google popup.
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

let customerDb: Firestore | null = null;
let staffDb: Firestore | null = null;
let customerAuth: Auth | null = null;
let staffAuth: Auth | null = null;

/**
 * When true, getFirebaseAuth/getFirebaseDb resolve to the isolated staff app.
 * Set only from /ops and /driver so a staff signOut never clears the public site.
 */
let staffBackendBound = false;

export function bindStaffFirebaseBackend() {
  staffBackendBound = true;
}

export function unbindStaffFirebaseBackend() {
  staffBackendBound = false;
}

/** Staff Auth/DB must stay selected for /ops and /driver writes. */
export function ensureStaffBackendBound() {
  staffBackendBound = true;
}

function assertConfig() {
  if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
    throw new Error("Firebase env vars are missing. Check .env.local");
  }
}

export function getFirebaseApp() {
  assertConfig();
  return getApps().length ? getApp() : initializeApp(firebaseConfig);
}

export function getStaffFirebaseApp(): FirebaseApp {
  assertConfig();
  try {
    return getApp(STAFF_APP_NAME);
  } catch {
    return initializeApp(firebaseConfig, STAFF_APP_NAME);
  }
}

/** True while /ops or /driver has bound the isolated staff backend. */
export function isStaffBackendBound() {
  return staffBackendBound;
}

function initAuth(
  app: FirebaseApp,
  persistence: typeof browserLocalPersistence | typeof browserSessionPersistence
) {
  try {
    return initializeAuth(app, {
      persistence,
      popupRedirectResolver: browserPopupRedirectResolver,
    });
  } catch {
    const auth = getAuth(app);
    void setPersistence(auth, persistence).catch(() => undefined);
    return auth;
  }
}

function initDb(app: FirebaseApp) {
  try {
    return initializeFirestore(app, {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager(),
      }),
    });
  } catch {
    return getFirestore(app);
  }
}

/** Public site Auth — stays signed in across tabs/refreshes. */
export function getCustomerAuth() {
  if (!customerAuth) {
    customerAuth = initAuth(getFirebaseApp(), browserLocalPersistence);
  }
  return customerAuth;
}

/** OPS / Driver Auth — separate Firebase app, per-tab session only. */
export function getStaffAuth() {
  if (!staffAuth) {
    staffAuth = initAuth(getStaffFirebaseApp(), browserSessionPersistence);
  }
  return staffAuth;
}

export function getFirebaseAuth() {
  return staffBackendBound ? getStaffAuth() : getCustomerAuth();
}

/** Resolves once Auth is ready for the active backend. */
export function readyFirebaseAuth(): Promise<Auth> {
  return Promise.resolve(getFirebaseAuth());
}

export function getCustomerDb() {
  if (!customerDb) customerDb = initDb(getFirebaseApp());
  return customerDb;
}

export function getStaffDb() {
  if (!staffDb) staffDb = initDb(getStaffFirebaseApp());
  return staffDb;
}

export function getFirebaseDb() {
  return staffBackendBound ? getStaffDb() : getCustomerDb();
}

export function getFirebaseStorage() {
  return getStorage(
    staffBackendBound ? getStaffFirebaseApp() : getFirebaseApp()
  );
}
