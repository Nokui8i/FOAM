import { Platform } from "react-native";
import {
  GoogleSignin,
  isCancelledResponse,
  isErrorWithCode,
  isSuccessResponse,
  statusCodes,
} from "@react-native-google-signin/google-signin";
import {
  GoogleAuthProvider,
  signInWithCredential,
  signOut as firebaseSignOut,
  type User,
} from "firebase/auth";

import { getFirebaseAuth, readyFirebaseAuth } from "@/lib/firebase";

let configured = false;
let configurePromise: Promise<void> | null = null;

/**
 * Public Web OAuth client ID used for Google ID tokens → Firebase credential.
 * Do not use Android or iOS OAuth client IDs here.
 */
export function getGoogleWebClientId(): string {
  const webClientId = process.env.EXPO_PUBLIC_FIREBASE_WEB_CLIENT_ID?.trim();
  if (!webClientId) {
    throw new Error(
      "EXPO_PUBLIC_FIREBASE_WEB_CLIENT_ID is missing. Copy .env.example to .env.local."
    );
  }
  return webClientId;
}

/**
 * iOS OAuth client ID from GoogleService-Info.plist CLIENT_ID (app.foam.ops / driver).
 * Required for reliable native iOS Google Sign-In alongside webClientId.
 */
function getGoogleIosClientId(): string | undefined {
  const iosClientId = process.env.EXPO_PUBLIC_FIREBASE_IOS_CLIENT_ID?.trim();
  return iosClientId || undefined;
}

/**
 * Idempotent Google Sign-In SDK configuration (Original Google Sign-In API).
 * Free package @react-native-google-signin/google-signin@16.x uses the legacy
 * play-services-auth SDK on Android; Credential Manager requires Universal Sign In.
 */
export function configureGoogleSignIn(): void {
  if (configured) return;
  const iosClientId = getGoogleIosClientId();
  GoogleSignin.configure({
    webClientId: getGoogleWebClientId(),
    ...(iosClientId ? { iosClientId } : {}),
    offlineAccess: false,
  });
  configured = true;
  // Native configure is async under the hood; keep a local settle promise so callers
  // can wait before presenting the sign-in UI.
  configurePromise = Promise.resolve();
}

async function ensureGoogleSignInConfigured(): Promise<void> {
  configureGoogleSignIn();
  await configurePromise;
}

function authErrorCode(error: unknown): string {
  if (error && typeof error === "object" && "code" in error) {
    return String((error as { code: string }).code);
  }
  return "";
}

/**
 * Dev-only safe logging of Google / Firebase Auth failures.
 * Never logs tokens, passwords, or credentials.
 */
export function logGoogleSignInFailure(phase: string, error: unknown): void {
  if (!__DEV__) return;

  const err = error as {
    name?: string;
    message?: string;
    code?: string | number;
    statusCode?: string | number;
    nativeStackAndroid?: unknown;
    userInfo?: Record<string, unknown>;
    stack?: string;
  };

  const code = err?.code != null ? String(err.code) : "";
  const message = err?.message ?? String(error);
  // User dismiss / cancel is expected — no LogBox noise.
  if (
    code === "auth/cancelled-popup-request" ||
    code === "12501" ||
    code === String(statusCodes.SIGN_IN_CANCELLED) ||
    /cancel|cancelled|canceled/i.test(message)
  ) {
    return;
  }

  const safeUserInfo =
    err?.userInfo && typeof err.userInfo === "object"
      ? Object.fromEntries(
          Object.entries(err.userInfo).filter(([key]) => {
            const k = key.toLowerCase();
            return !(
              k.includes("token") ||
              k.includes("password") ||
              k.includes("secret") ||
              k.includes("credential")
            );
          })
        )
      : undefined;

  console.error("[FOAM GoogleSignIn]", {
    phase,
    errorClass: err?.name ?? (error instanceof Error ? error.constructor.name : typeof error),
    code: err?.code != null ? String(err.code) : undefined,
    statusCode: err?.statusCode != null ? String(err.statusCode) : undefined,
    message,
    userInfo: safeUserInfo,
    stack: typeof err?.stack === "string" ? err.stack.split("\n").slice(0, 8).join("\n") : undefined,
  });
}

/**
 * Native Google Sign-In → Firebase Auth credential exchange.
 *
 * Important (Android): do not trigger React state updates that remount the
 * presenting activity immediately before GoogleSignin.signIn() — that can abort
 * SignInHubActivity and surface as a generic failure.
 */
export async function signInWithGoogle(): Promise<User> {
  await ensureGoogleSignInConfigured();
  const auth = await readyFirebaseAuth();

  if (auth.currentUser) {
    try {
      await firebaseSignOut(auth);
      try {
        await GoogleSignin.signOut();
      } catch {
        /* ignore native sign-out blips */
      }
    } catch {
      /* continue into fresh sign-in */
    }
  }

  if (Platform.OS === "android") {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  }

  let response;
  try {
    response = await GoogleSignin.signIn();
  } catch (error) {
    logGoogleSignInFailure("GoogleSignin.signIn", error);
    throw error;
  }

  if (isCancelledResponse(response)) {
    const cancelled = Object.assign(new Error("Google sign-in was cancelled."), {
      code: "auth/cancelled-popup-request",
    });
    throw cancelled;
  }

  if (!isSuccessResponse(response)) {
    const unexpected = Object.assign(
      new Error("Google sign-in returned an unexpected response."),
      { code: "auth/unknown" }
    );
    logGoogleSignInFailure("GoogleSignin.signIn.unexpected", {
      type: (response as { type?: string })?.type,
    });
    throw unexpected;
  }

  let idToken = response.data.idToken;
  if (!idToken) {
    try {
      const tokens = await GoogleSignin.getTokens();
      idToken = tokens.idToken;
    } catch (error) {
      logGoogleSignInFailure("GoogleSignin.getTokens", error);
      throw error;
    }
  }
  if (!idToken) {
    const missing = Object.assign(
      new Error("Google sign-in did not return an ID token."),
      { code: "auth/missing-id-token" }
    );
    logGoogleSignInFailure("GoogleSignin.missingIdToken", missing);
    throw missing;
  }

  try {
    const credential = GoogleAuthProvider.credential(idToken);
    const signedIn = await signInWithCredential(auth, credential);
    return signedIn.user;
  } catch (error) {
    logGoogleSignInFailure("Firebase.signInWithCredential", error);
    throw error;
  }
}

export async function signOutStaff(): Promise<void> {
  const auth = getFirebaseAuth();
  try {
    await Promise.race([
      GoogleSignin.signOut(),
      new Promise<void>((resolve) => setTimeout(resolve, 1500)),
    ]);
  } catch {
    /* ignore native sign-out blips */
  }
  try {
    await firebaseSignOut(auth);
  } catch {
    /* already signed out */
  }
}

export function googleSignInErrorMessage(
  error: unknown,
  fallback: string
): string {
  if (isErrorWithCode(error)) {
    if (error.code === statusCodes.SIGN_IN_CANCELLED) {
      return "Google sign-in was cancelled. Try again.";
    }
    if (error.code === statusCodes.IN_PROGRESS) {
      return "Google sign-in is already in progress.";
    }
    if (error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
      return "Google Play Services is unavailable on this device.";
    }
  }

  const code = authErrorCode(error);
  const message = String((error as { message?: string })?.message ?? error ?? "");

  // Native Android ApiException status codes from play-services-auth.
  if (code === "10" || code === "DEVELOPER_ERROR" || /DEVELOPER_ERROR/i.test(message)) {
    return "Google Sign-In configuration error. Contact FOAM support.";
  }
  if (code === "12500" || /non-recoverable sign in failure/i.test(message)) {
    return "Google sign-in failed on this device. Try again.";
  }
  if (code === "12501") {
    return "Google sign-in was cancelled. Try again.";
  }
  if (code === "7" || /NETWORK_ERROR/i.test(message)) {
    return "Network error during Google sign-in. Try again.";
  }

  if (
    code === "auth/popup-closed-by-user" ||
    code === "auth/cancelled-popup-request" ||
    /cancel|cancelled|canceled/i.test(message)
  ) {
    return "Google sign-in was cancelled. Try again.";
  }
  if (code === "auth/network-request-failed") {
    return "Network error during Google sign-in. Try again.";
  }
  if (code === "auth/missing-id-token") {
    return "Google sign-in failed in the app. Try again.";
  }
  if (
    code === "auth/invalid-credential" ||
    code === "auth/internal-error" ||
    code === "auth/operation-not-allowed"
  ) {
    return "Google sign-in could not complete with Firebase Auth. Try again.";
  }
  if (
    code.includes("requests-from-referer") ||
    /requests-from-referer/i.test(message)
  ) {
    return "Google sign-in reached Firebase, but Auth API key restrictions blocked the request.";
  }
  return fallback;
}

export { GoogleSignin };
