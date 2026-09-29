import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  type Auth,
  type User,
} from "firebase/auth";

import { readyFirebaseAuth } from "@/lib/firebase";

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
 * Google sign-in that survives Cross-Origin-Opener-Policy popup glitches.
 *
 * Prefer popup. Only fall back to redirect when the popup is truly blocked
 * AND redirect can keep sessionStorage on the same host. Never redirect on
 * iPhone — it lands on firebaseapp.com with a dead state.
 */
export async function signInWithGoogle(): Promise<User> {
  const auth = await readyFirebaseAuth();
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });

  if (auth.currentUser) return auth.currentUser;

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
        await sleep(1200);
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

        const popupBlocked =
          code === "auth/popup-blocked" ||
          code === "auth/operation-not-supported-in-this-environment";

        const canRedirect =
          popupBlocked &&
          !isAppleMobileBrowser() &&
          !redirectWouldLoseState(auth);

        if (!canRedirect) {
          fail(
            popupBlocked
              ? Object.assign(new Error("popup-unavailable-no-redirect"), {
                  code: "auth/popup-blocked",
                })
              : error
          );
          return;
        }

        try {
          settled = true;
          unsub();
          await signInWithRedirect(auth, provider);
          // Redirect navigates away.
        } catch (redirectError) {
          fail(redirectError);
        }
      });
  });
}

export function googleSignInErrorMessage(error: unknown, fallback: string) {
  const code = popupErrorCode(error);
  const message =
    error && typeof error === "object" && "message" in error
      ? String((error as { message: string }).message)
      : "";
  if (
    /redirect_uri_mismatch/i.test(message) ||
    /invalid.?request/i.test(message)
  ) {
    return "Google sign-in isn’t configured for this address yet. Try email, or try again in a moment.";
  }
  if (/missing initial state/i.test(message)) {
    return "Google sign-in couldn’t finish in this browser. Close this tab, open the site again, and try Google — or use email.";
  }
  if (
    code === "auth/popup-closed-by-user" ||
    code === "auth/cancelled-popup-request"
  ) {
    return "Sign-in was cancelled. Tap again to continue.";
  }
  if (code === "auth/popup-blocked") {
    return "Your browser blocked the Google window. Allow popups for this site, or sign in with email.";
  }
  if (code === "auth/network-request-failed") {
    return "Network error. Check your connection and try again.";
  }
  if (code === "auth/unauthorized-domain") {
    return "This address isn’t authorized for Google sign-in yet.";
  }
  if (code === "auth/internal-error" || code === "auth/argument-error") {
    return "Google sign-in hit a browser glitch. Refresh the page and try again.";
  }
  return fallback;
}
