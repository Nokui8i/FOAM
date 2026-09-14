"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  GoogleAuthProvider,
  OAuthProvider,
  createUserWithEmailAndPassword,
  getRedirectResult,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut as firebaseSignOut,
  updateProfile,
  type AuthProvider,
  type User,
} from "firebase/auth";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";

import { getFirebaseAuth, getFirebaseDb } from "@/lib/firebase";

type AuthContextValue = {
  user: User | null;
  ready: boolean;
  oauthReturnError: string;
  clearOauthReturnError: () => void;
  signInEmail: (email: string, password: string) => Promise<void>;
  signUpEmail: (name: string, email: string, password: string) => Promise<void>;
  signInGoogle: () => Promise<void>;
  signInApple: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const OAUTH_PENDING_KEY = "foam_oauth_pending";

/**
 * sessionStorage.setItem/getItem/removeItem THROW in Safari Private
 * Browsing (and some locked-down mobile/in-app browsers) instead of just
 * being unavailable. Because that throw happens synchronously, inside a
 * click handler, before any network call even starts, it can produce a
 * button that looks completely frozen: setBusy(true) and the immediate
 * setBusy(false)/setError(...) from the catch block land in the same
 * React render batch, so the busy state never actually paints — the
 * button appears to do nothing at all. Worse, if the *catch* block itself
 * calls sessionStorage.removeItem and that throws too, it can replace the
 * real error we meant to surface. Never let storage access break the
 * sign-in flow or swallow an error.
 */
const safeSessionStorage = {
  get(key: string): string | null {
    try {
      return sessionStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string) {
    try {
      sessionStorage.setItem(key, value);
    } catch {
      // Ignore — the pending-flag is only used to detect a returned-without-
      // a-session redirect; sign-in should still be attempted without it.
    }
  },
  remove(key: string) {
    try {
      sessionStorage.removeItem(key);
    } catch {
      // Ignore.
    }
  },
};

function authErrorMessage(error: unknown, fallback: string) {
  const code =
    error && typeof error === "object" && "code" in error
      ? String((error as { code?: string }).code)
      : "";
  if (code.includes("unauthorized-domain")) {
    return "This site address is not allowed yet. Add it in Firebase → Authentication → Authorized domains.";
  }
  if (code.includes("operation-not-allowed")) {
    return "This sign-in method is not enabled in Firebase Authentication.";
  }
  if (
    code.includes("auth/internal-error") ||
    code.includes("network-request-failed")
  ) {
    return "Network or provider error. Check connection and try again.";
  }
  if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") {
    return "Sign-in was cancelled.";
  }
  if (code === "auth/popup-blocked") {
    return "Your browser blocked the sign-in popup. Please try again.";
  }
  if (
    error instanceof DOMException &&
    (error.name === "QuotaExceededError" || error.name === "SecurityError")
  ) {
    return "This browser is blocking storage that Google/Apple sign-in needs (common in Private/Incognito mode). Try email + password, or use normal browsing mode.";
  }
  if (error instanceof Error && error.message && !code) {
    return error.message;
  }
  return code ? `${fallback} (${code})` : fallback;
}

async function ensureUserProfile(user: User, name?: string) {
  const db = getFirebaseDb();
  const ref = doc(db, "users", user.uid);
  const existing = await getDoc(ref);
  const displayName =
    name?.trim() || user.displayName || user.email?.split("@")[0] || "FOAM customer";

  if (!existing.exists()) {
    await setDoc(ref, {
      uid: user.uid,
      email: user.email ?? "",
      name: displayName,
      phone: "",
      address: "",
      unit: "",
      city: "",
      zip: "",
      pickupNotes: "",
      detergent: "Standard Scented",
      softener: "Standard",
      washTemp: "Cold",
      dryerTemp: "Medium",
      foldStyle: "Standard fold",
      separateColors: false,
      careNotes: "",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      provider: user.providerData[0]?.providerId ?? "password",
    });
    return;
  }

  await setDoc(
    ref,
    {
      email: user.email ?? "",
      name: existing.data()?.name || displayName,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

const REDIRECT_START_TIMEOUT_MS = 8000;

function popupErrorCode(error: unknown) {
  return error && typeof error === "object" && "code" in error
    ? String((error as { code?: string }).code)
    : "";
}

/**
 * Try a popup FIRST, on every device — including phones.
 *
 * Why not redirect-by-default on phones (the previous approach): Firebase's
 * redirect flow round-trips through *.firebaseapp.com before landing back on
 * this origin, and relies on that intermediate domain's storage to carry the
 * result back. Both Chrome's third-party-storage restrictions (desktop) and
 * Safari's cross-site tracking prevention (iPhone) can silently break that
 * hand-off — Google shows the consent screen, the user approves it, the
 * browser lands back here, and getRedirectResult() still comes back with no
 * user and no error (surfaced to the user as "could not finish on this
 * address"). Popup doesn't have this problem: it hands back the result via
 * postMessage, not storage.
 *
 * A popup opened synchronously from a real tap/click is allowed by current
 * mobile Safari and Chrome, so it isn't the automatic "blocked on phones"
 * case it used to be. We still fall back to redirect for the browsers that
 * do block/can't support a popup (older in-app browsers, some Android
 * WebViews) — detected from the specific error Firebase throws for that,
 * not guessed from viewport width.
 */
async function signInWithProvider(provider: AuthProvider) {
  const auth = getFirebaseAuth();

  try {
    const result = await signInWithPopup(auth, provider);
    void ensureUserProfile(result.user).catch(() => {});
    return;
  } catch (error) {
    const code = popupErrorCode(error);
    const popupUnavailable =
      code === "auth/popup-blocked" ||
      code === "auth/operation-not-supported-in-this-environment";
    if (!popupUnavailable) {
      throw error;
    }
    // Fall through to the redirect flow below.
  }

  safeSessionStorage.set(OAUTH_PENDING_KEY, provider.providerId);
  await Promise.race([
    signInWithRedirect(auth, provider),
    new Promise<never>((_, reject) =>
      window.setTimeout(
        () =>
          reject(
            new Error(
              "Sign-in didn't start on this device or browser. This usually means the address you're testing on isn't an authorized domain yet, or the browser is blocking it. Try email + password, or open the site at an authorized address."
            )
          ),
        REDIRECT_START_TIMEOUT_MS
      )
    ),
  ]);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [oauthReturnError, setOauthReturnError] = useState("");

  const clearOauthReturnError = useCallback(() => {
    setOauthReturnError("");
  }, []);

  useEffect(() => {
    let alive = true;
    let unsub: (() => void) | undefined;

    const markReady = () => {
      if (alive) setReady(true);
    };

    const readyTimeout = window.setTimeout(markReady, 2500);

    async function boot() {
      try {
        const auth = getFirebaseAuth();
        const pending = safeSessionStorage.get(OAUTH_PENDING_KEY);

        try {
          const redirectResult = await getRedirectResult(auth);
          if (redirectResult?.user) {
            safeSessionStorage.remove(OAUTH_PENDING_KEY);
            void ensureUserProfile(redirectResult.user).catch(() => {});
            if (window.location.pathname.startsWith("/account")) {
              window.location.replace("/");
              return;
            }
          } else if (pending) {
            safeSessionStorage.remove(OAUTH_PENDING_KEY);
            // User came back without a session — usually blocked third-party storage
            // on phone browsers when using a LAN IP. Email login still works.
            if (alive) {
              setOauthReturnError(
                "Google/Apple sign-in didn't finish after returning from the provider. This can happen when the browser blocks the storage the redirect needs. Please try email + password, or tap the button again."
              );
            }
          }
        } catch (error) {
          safeSessionStorage.remove(OAUTH_PENDING_KEY);
          if (alive) {
            setOauthReturnError(
              authErrorMessage(
                error,
                "Google/Apple sign-in failed after redirect. Email login still works."
              )
            );
          }
        }

        unsub = onAuthStateChanged(
          auth,
          (next) => {
            if (!alive) return;
            setUser(next);
            markReady();
            if (next) {
              safeSessionStorage.remove(OAUTH_PENDING_KEY);
              void ensureUserProfile(next).catch(() => {});
            }
          },
          () => {
            if (!alive) return;
            setUser(null);
            markReady();
          }
        );
      } catch {
        setUser(null);
        markReady();
      }
    }

    void boot();

    return () => {
      alive = false;
      window.clearTimeout(readyTimeout);
      unsub?.();
    };
  }, []);

  const signInEmail = useCallback(async (email: string, password: string) => {
    const result = await signInWithEmailAndPassword(
      getFirebaseAuth(),
      email,
      password
    );
    void ensureUserProfile(result.user).catch(() => {});
  }, []);

  const signUpEmail = useCallback(
    async (name: string, email: string, password: string) => {
      const result = await createUserWithEmailAndPassword(
        getFirebaseAuth(),
        email,
        password
      );
      if (name.trim()) {
        await updateProfile(result.user, { displayName: name.trim() });
      }
      void ensureUserProfile(result.user, name).catch(() => {});
    },
    []
  );

  const signInGoogle = useCallback(async () => {
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      await signInWithProvider(provider);
    } catch (error) {
      safeSessionStorage.remove(OAUTH_PENDING_KEY);
      throw new Error(
        authErrorMessage(
          error,
          "Google sign-in failed. Add this site in Firebase Authorized domains."
        )
      );
    }
  }, []);

  const signInApple = useCallback(async () => {
    try {
      const provider = new OAuthProvider("apple.com");
      provider.addScope("email");
      provider.addScope("name");
      await signInWithProvider(provider);
    } catch (error) {
      safeSessionStorage.remove(OAUTH_PENDING_KEY);
      throw new Error(
        authErrorMessage(
          error,
          "Apple sign-in failed. Enable Apple in Firebase (and Apple Developer keys)."
        )
      );
    }
  }, []);

  const signOut = useCallback(async () => {
    await firebaseSignOut(getFirebaseAuth());
  }, []);

  const value = useMemo(
    () => ({
      user,
      ready,
      oauthReturnError,
      clearOauthReturnError,
      signInEmail,
      signUpEmail,
      signInGoogle,
      signInApple,
      signOut,
    }),
    [
      user,
      ready,
      oauthReturnError,
      clearOauthReturnError,
      signInEmail,
      signUpEmail,
      signInGoogle,
      signInApple,
      signOut,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
