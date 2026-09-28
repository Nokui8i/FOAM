import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  type User,
  type UserCredential,
} from "firebase/auth";

import { getFirebaseAuth, readyFirebaseAuth } from "@/lib/firebase";

function popupErrorCode(error: unknown): string {
  if (error && typeof error === "object" && "code" in error) {
    return String((error as { code: string }).code);
  }
  return "";
}

/**
 * Prefer popup (works on modern mobile Safari/Chrome from a tap).
 * Only fall back to redirect when the popup truly cannot open —
 * blind redirect to *.firebaseapp.com breaks on partitioned storage
 * when the app runs on *.web.app.
 */
export async function signInWithGoogle(): Promise<User> {
  const auth = await readyFirebaseAuth();
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });

  try {
    const result: UserCredential = await signInWithPopup(auth, provider);
    return result.user;
  } catch (error) {
    const code = popupErrorCode(error);
    if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") {
      throw error;
    }
    const popupUnavailable =
      code === "auth/popup-blocked" ||
      code === "auth/operation-not-supported-in-this-environment";
    if (!popupUnavailable) {
      throw error;
    }
  }

  // Last resort — requires authDomain to match the app host (*.web.app).
  await signInWithRedirect(auth, provider);
  // Redirect navigates away; this promise won't resolve in-page.
  return new Promise(() => {});
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
  if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") {
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
