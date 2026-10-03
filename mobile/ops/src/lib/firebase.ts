import { Platform } from "react-native";
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
 * Public Firebase JS client config for FOAM OPS (native).
 *
 * Native platforms must NOT use the Web Browser API key (HTTP referrer
 * restricted). Android / iOS keys come from OPS google-services.json and
 * GoogleService-Info.plist respectively (app.foam.ops).
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

/**
 * Platform-specific Firebase API key for the JS SDK Identity Toolkit calls.
 * Never logs key values.
 */
function resolveNativeFirebaseApiKey(): string | undefined {
  if (Platform.OS === "android") {
    return process.env.EXPO_PUBLIC_FIREBASE_ANDROID_API_KEY?.trim();
  }
  if (Platform.OS === "ios") {
    return process.env.EXPO_PUBLIC_FIREBASE_IOS_API_KEY?.trim();
  }
  return undefined;
}

function buildFirebaseConfig() {
  return {
    apiKey: resolveNativeFirebaseApiKey(),
    authDomain: resolveAuthDomain(),
    projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
  };
}

let authInstance: Auth | null = null;
let dbInstance: Firestore | null = null;

function assertConfig(config: ReturnType<typeof buildFirebaseConfig>) {
  if (!config.apiKey || !config.projectId || !config.appId) {
    const platformHint =
      Platform.OS === "android"
        ? "EXPO_PUBLIC_FIREBASE_ANDROID_API_KEY"
        : Platform.OS === "ios"
          ? "EXPO_PUBLIC_FIREBASE_IOS_API_KEY"
          : "EXPO_PUBLIC_FIREBASE_ANDROID_API_KEY / EXPO_PUBLIC_FIREBASE_IOS_API_KEY";
    throw new Error(
      `Firebase env vars are missing (${platformHint} and project/app ids). Copy .env.example to .env.local.`
    );
  }
}

export function getFirebaseApp(): FirebaseApp {
  if (getApps().length) return getApp();
  const firebaseConfig = buildFirebaseConfig();
  assertConfig(firebaseConfig);
  return initializeApp(firebaseConfig);
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
