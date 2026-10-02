import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import {
  getAuth,
  initializeAuth,
  getReactNativePersistence,
  type Auth,
} from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
import ReactNativeAsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Public Firebase JS client config — mirrors the existing FOAM web pattern.
 * Uses the shared Firebase web app ID for JS Auth (native Google Sign-In uses
 * google-services.json / GoogleService-Info.plist separately).
 */
function resolveAuthDomain() {
  const projectId = process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID?.trim();
  const raw = process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN?.trim();
  if (raw?.endsWith(".web.app") && projectId) {
    return `${projectId}.firebaseapp.com`;
  }
  if (raw) return raw;
  return projectId ? `${projectId}.firebaseapp.com` : undefined;
}

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: resolveAuthDomain(),
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

let authInstance: Auth | null = null;
let dbInstance: Firestore | null = null;

function assertConfig() {
  if (!firebaseConfig.apiKey || !firebaseConfig.projectId || !firebaseConfig.appId) {
    throw new Error(
      "Firebase env vars are missing. Copy .env.example to .env.local and fill EXPO_PUBLIC_FIREBASE_*."
    );
  }
}

export function getFirebaseApp(): FirebaseApp {
  assertConfig();
  return getApps().length ? getApp() : initializeApp(firebaseConfig);
}

/**
 * Firebase Auth with React Native AsyncStorage persistence.
 * Browser-only Auth persistence APIs are intentionally not used here.
 */
export function getFirebaseAuth(): Auth {
  if (authInstance) return authInstance;

  const app = getFirebaseApp();
  try {
    authInstance = initializeAuth(app, {
      persistence: getReactNativePersistence(ReactNativeAsyncStorage),
    });
  } catch {
    authInstance = getAuth(app);
  }
  return authInstance;
}

export function readyFirebaseAuth(): Promise<Auth> {
  return Promise.resolve(getFirebaseAuth());
}

export function getFirebaseDb(): Firestore {
  if (!dbInstance) {
    dbInstance = getFirestore(getFirebaseApp());
  }
  return dbInstance;
}
