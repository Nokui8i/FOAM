import { Capacitor } from "@capacitor/core";
import { FirebaseAuthentication } from "@capacitor-firebase/authentication";
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithCredential,
  signInWithPopup,
  signInWithRedirect,
  type Auth,
  type User,
} from "firebase/auth";

import {
  ensureStaffBackendBound,
  readyFirebaseAuth,
} from "@/lib/firebase";

function popupErrorCode(error: unknown): string {
  if (error && typeof error === "object" && "code" in error) {
    return String((error as { code: string }).code);
  }
  return "";
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

/** iOS (and iOS Chrome) partition storage across web.app ↔ firebaseapp.com. */
function isAppleMobileBrowser() {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|iPod/i.test(navigator.userAgent);
}

/**
 * Redirect only works when the page origin matches authDomain. Otherwise
 * Firebase writes state on web.app, then the handler on firebaseapp.com
 * can't read it → "missing initial state" (the white error page).
 */
function redirectWouldLoseState(auth: Auth) {
  const domain = auth.app.options.authDomain;
  if (!domain || typeof window === "undefined") return true;
  return domain !== window.location.hostname;
}

/**
 * Native Google account picker inside OPS / Driver Capacitor apps.
 * Never opens Chrome Custom Tabs / the browser OAuth flow.
 */
async function signInWithGoogleNative(): Promise<User> {
  ensureStaffBackendBound();
  const auth = await readyFirebaseAuth();

  const result = await FirebaseAuthentication.signInWithGoogle({
    skipNativeAuth: true,
  });
  const idToken = result.credential?.idToken;
  if (!idToken) {
    throw Object.assign(new Error("Google sign-in did not return an ID token."), {
      code: "auth/missing-id-token",
    });
  }

  const credential = GoogleAuthProvider.credential(
    idToken,
    result.credential?.accessToken
  );
  const signedIn = await signInWithCredential(auth, credential);
  return signedIn.user;
}

/**
 * Browser Google sign-in (customer site / desktop).
 *
 * Prefer popup. Only fall back to redirect when the popup is truly blocked
 * AND redirect can keep sessionStorage on the same host. Never redirect on
 * iPhone — it lands on firebaseapp.com with a dead state.
 */
async function signInWithGoogleWeb(): Promise<User> {
  ensureStaffBackendBound();
  const auth = await readyFirebaseAuth();
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });

  return new Promise<User>((resolve, reject) => {
    let settled = false;

    const finish = (user: User) => {
      if (settled) return;
      settled = true;
      unsub();
      resolve(user);
    };

    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      unsub();
      reject(error);
    };

    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) finish(user);
    });

    void signInWithPopup(auth, provider)
      .then((result) => {
        finish(result.user);
      })
      .catch(async (error) => {
        if (settled) return;

        // Auth may already be applied even when COOP breaks the popup promise.
        if (auth.currentUser) {
          finish(auth.currentUser);
          return;
        }
        await sleep(1500);
        if (auth.currentUser) {
          finish(auth.currentUser);
          return;
        }

        const code = popupErrorCode(error);
        if (
          code === "auth/popup-closed-by-user" ||
          code === "auth/cancelled-popup-request"
        ) {
          fail(error);
          return;
        }

        // Popup blocked / COOP — redirect only when state can survive.
        if (
          !isAppleMobileBrowser() &&
          !redirectWouldLoseState(auth) &&
          (code === "auth/popup-blocked" ||
            code === "auth/operation-not-supported-in-this-environment" ||
            code === "")
        ) {
          try {
            await signInWithRedirect(auth, provider);
            return;
          } catch (redirectError) {
            fail(redirectError);
            return;
          }
        }

        fail(error);
      });
  });
}

/**
 * Google sign-in for staff consoles.
 * Capacitor apps use the native account sheet; browsers keep the web flow.
 */
export async function signInWithGoogle(): Promise<User> {
  if (Capacitor.isNativePlatform()) {
    return signInWithGoogleNative();
  }
  return signInWithGoogleWeb();
}

export function googleSignInErrorMessage(
  error: unknown,
  fallback: string
): string {
  const code = popupErrorCode(error);
  if (
    code === "auth/popup-closed-by-user" ||
    code === "auth/cancelled-popup-request" ||
    /cancel|cancelled|canceled/i.test(String((error as { message?: string })?.message ?? ""))
  ) {
    return "Google sign-in was cancelled. Try again.";
  }
  if (code === "auth/popup-blocked") {
    return "Popup blocked. Allow popups for this site, or try again.";
  }
  if (code === "auth/network-request-failed") {
    return "Network error during Google sign-in. Try again.";
  }
  if (code === "auth/unauthorized-domain") {
    return "This domain is not authorized for Google sign-in.";
  }
  if (code === "auth/missing-id-token") {
    return "Google sign-in failed in the app. Try again.";
  }
  return fallback;
}
