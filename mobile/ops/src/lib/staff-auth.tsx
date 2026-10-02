import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import {
  canAccessDriverPortal,
  canAccessOps,
  isAdminEmail,
  isStaffBannedError,
  staffAccessGateKind,
  staffApprovedLoginMessage,
  staffBannedLoginMessage,
  staffDeniedLoginMessage,
  staffOpsDriverOnlyMessage,
  staffPendingLoginMessage,
  staffRemovedLoginMessage,
  type StaffPortal,
  type StaffProfile,
  type StaffStatus,
} from "@foam/staff-core";

import { assertStaffPortalMatchesApp } from "@/lib/app-identity";
import { getAdminEmails } from "@/lib/admin-emails";
import { readyFirebaseAuth } from "@/lib/firebase";
import {
  configureGoogleSignIn,
  googleSignInErrorMessage,
  logGoogleSignInFailure,
  signInWithGoogle,
  signOutStaff,
} from "@/lib/google-signin";
import {
  ensureStaffProfile,
  subscribeStaffBan,
  subscribeStaffProfile,
} from "@/lib/staff";

export type StaffAuthPhase =
  | "booting"
  | "signedOut"
  | "loadingProfile"
  | "pending"
  | "denied"
  | "banned"
  | "unauthorized"
  | "ready";

type StaffAuthContextValue = {
  portal: StaffPortal;
  phase: StaffAuthPhase;
  user: User | null;
  profile: StaffProfile | null;
  notice: string;
  error: string;
  loggingIn: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  clearMessages: () => void;
};

const StaffAuthContext = createContext<StaffAuthContextValue | null>(null);

function portalAccessAllowed(
  portal: StaffPortal,
  profile: StaffProfile | null,
  email: string | null | undefined
) {
  const admins = getAdminEmails();
  return portal === "driver"
    ? canAccessDriverPortal(profile, email, admins)
    : canAccessOps(profile, email, admins);
}

/** Match web: one soft retry on transient Firestore failures (not bans). */
async function ensureStaffProfileWithRetry(
  user: User,
  portal: StaffPortal,
  options?: { createIfMissing?: boolean; refreshPending?: boolean }
) {
  try {
    return await ensureStaffProfile(user, portal, options);
  } catch (err) {
    if (isStaffBannedError(err)) throw err;
    return await ensureStaffProfile(user, portal, options);
  }
}

function wrongPortalMessage(portal: StaffPortal) {
  return portal === "ops"
    ? staffOpsDriverOnlyMessage()
    : "This account does not have Driver access.";
}

export function StaffAuthProvider({
  portal,
  children,
}: {
  portal: StaffPortal;
  children: ReactNode;
}) {
  assertStaffPortalMatchesApp(portal);

  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [profile, setProfile] = useState<StaffProfile | null>(null);
  const [profileReady, setProfileReady] = useState(false);
  const [banned, setBanned] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);
  const releasingRef = useRef(false);
  const signInInFlightRef = useRef(false);
  /** Match web: sign-in owns create/gate; profile effect must not race it. */
  const bootstrappingAccessRef = useRef(false);
  const pendingLoginRefreshRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );

  useEffect(() => {
    configureGoogleSignIn();
  }, []);

  useEffect(() => {
    return () => {
      if (pendingLoginRefreshRef.current) {
        clearTimeout(pendingLoginRefreshRef.current);
      }
    };
  }, []);

  const releaseToLogin = useCallback(async (message: string) => {
    if (releasingRef.current) return;
    releasingRef.current = true;
    if (pendingLoginRefreshRef.current) {
      clearTimeout(pendingLoginRefreshRef.current);
      pendingLoginRefreshRef.current = null;
    }
    setLoggingIn(false);
    setNotice(message);
    setProfile(null);
    setProfileReady(false);
    setBanned(false);
    try {
      await signOutStaff();
    } finally {
      releasingRef.current = false;
      bootstrappingAccessRef.current = false;
      // Soft-refresh login after pending request confirmation.
      if (message.startsWith("Request sent.")) {
        pendingLoginRefreshRef.current = setTimeout(() => {
          pendingLoginRefreshRef.current = null;
          setNotice("");
          setError("");
        }, 2000);
      }
    }
  }, []);

  /** Live ban — match web: keep Auth session, show banned shell + Sign out. */
  const holdBannedSession = useCallback((message?: string) => {
    setBanned(true);
    setProfile(null);
    setProfileReady(true);
    setNotice(message ?? staffBannedLoginMessage());
    setError("");
  }, []);

  useEffect(() => {
    let alive = true;
    let unsub = () => {};

    void readyFirebaseAuth().then((auth) => {
      if (!alive) return;
      unsub = onAuthStateChanged(auth, (next) => {
        if (!alive) return;
        setUser(next);
        setAuthReady(true);
      });
    });

    return () => {
      alive = false;
      unsub();
    };
  }, []);

  useEffect(() => {
    if (!user) {
      setProfile(null);
      setProfileReady(false);
      // Keep banned/notice after sign-out so login can show the reason.
      return;
    }

    const admins = getAdminEmails();
    if (isAdminEmail(user.email, admins)) {
      setProfile(null);
      setProfileReady(true);
      setBanned(false);
      return;
    }

    let alive = true;
    // Match web: if staff/{uid} disappears after we had a row, force logout.
    let sawStaffDoc = false;
    // Match web pending → approved forced re-login notice.
    let lastStatus: StaffStatus | null = null;
    setProfileReady(false);
    setBanned(false);

    async function applyLiveProfile(next: StaffProfile) {
      if (!alive || releasingRef.current) return;
      // Sign-in flow owns messaging while bootstrapping.
      if (bootstrappingAccessRef.current) {
        sawStaffDoc = true;
        lastStatus = next.status;
        setProfile(next);
        setBanned(false);
        setProfileReady(true);
        return;
      }

      const prev = lastStatus;
      lastStatus = next.status;

      if (prev === "pending" && next.status === "approved") {
        await releaseToLogin(staffApprovedLoginMessage(portal));
        return;
      }

      const gate = staffAccessGateKind(next, user!.email, getAdminEmails());
      if (gate === "pending") {
        await releaseToLogin(staffPendingLoginMessage(portal));
        return;
      }
      if (gate === "denied") {
        await releaseToLogin(staffDeniedLoginMessage(portal));
        return;
      }

      if (!portalAccessAllowed(portal, next, user!.email)) {
        // Match web OPS driver-only: stay signed in on unauthorized shell.
        if (
          portal === "ops" &&
          next.status === "approved" &&
          next.role === "driver"
        ) {
          sawStaffDoc = true;
          setProfile(next);
          setBanned(false);
          setNotice(staffOpsDriverOnlyMessage());
          setProfileReady(true);
          return;
        }
        await releaseToLogin(wrongPortalMessage(portal));
        return;
      }

      sawStaffDoc = true;
      setProfile(next);
      setBanned(false);
      setNotice("");
      setProfileReady(true);
    }

    void (async () => {
      try {
        // Ensure Auth token is attached before Firestore rules evaluate create/get.
        await user.getIdToken();
        const loaded = await ensureStaffProfileWithRetry(user, portal, {
          createIfMissing: !bootstrappingAccessRef.current,
        });
        if (!alive) return;
        if (!loaded) {
          setProfile(null);
          setProfileReady(true);
          return;
        }
        await applyLiveProfile(loaded);
      } catch (err) {
        if (!alive) return;
        if (bootstrappingAccessRef.current) {
          // Sign-in handler surfaces the error.
          return;
        }
        if (isStaffBannedError(err)) {
          holdBannedSession();
          return;
        }
        setError(
          err instanceof Error ? err.message : "Could not load staff access."
        );
        setProfile(null);
        setProfileReady(true);
        void signOutStaff();
      }
    })();

    const unsubProfile = subscribeStaffProfile(user.uid, (next) => {
      if (!alive || releasingRef.current) return;
      if (!next) {
        setProfile(null);
        if (sawStaffDoc) {
          sawStaffDoc = false;
          lastStatus = null;
          void releaseToLogin(staffRemovedLoginMessage(portal));
        }
        return;
      }
      void applyLiveProfile(next);
    });

    const unsubBan = subscribeStaffBan(user.email ?? "", (isBanned) => {
      if (!alive || isAdminEmail(user.email, getAdminEmails())) {
        return;
      }
      if (isBanned) {
        // Match web: do not auto sign-out; show banned shell.
        holdBannedSession();
        return;
      }
      // Ban lifted — match web: clear banned shell and re-sync staff access.
      setBanned(false);
      setNotice("");
      void (async () => {
        try {
          const loaded = await ensureStaffProfileWithRetry(user, portal, {
            createIfMissing: true,
          });
          if (!alive || releasingRef.current) return;
          if (!loaded) {
            setProfile(null);
            setProfileReady(true);
            return;
          }
          await applyLiveProfile(loaded);
        } catch (err) {
          if (!alive) return;
          if (isStaffBannedError(err)) {
            holdBannedSession();
            return;
          }
          setError(
            err instanceof Error
              ? err.message
              : "Could not restore staff access after unban."
          );
        }
      })();
    });

    return () => {
      alive = false;
      unsubProfile();
      unsubBan();
    };
  }, [user, portal, releaseToLogin, holdBannedSession]);

  const signIn = useCallback(async () => {
    if (signInInFlightRef.current || releasingRef.current) return;
    signInInFlightRef.current = true;
    bootstrappingAccessRef.current = true;
    setError("");
    setNotice("");
    setBanned(false);

    // Android: do not setState / remount UI before GoogleSignin.signIn() presents
    // SignInHubActivity — that can abort the activity result (~200–400ms close).
    let googleUser: User;
    try {
      googleUser = await signInWithGoogle();
    } catch (err) {
      bootstrappingAccessRef.current = false;
      const message = googleSignInErrorMessage(
        err,
        "Google sign-in failed. Try again."
      );
      const cancelled = /cancel/i.test(message);
      if (!cancelled) {
        logGoogleSignInFailure("StaffAuth.signIn.google", err);
        setError(message);
      }
      signInInFlightRef.current = false;
      return;
    }

    setLoggingIn(true);
    try {
      try {
        // Force a fresh Auth token so Firestore rules see request.auth on create.
        await googleUser.getIdToken(true);
        const created = await ensureStaffProfileWithRetry(googleUser, portal, {
          createIfMissing: true,
          refreshPending: true,
        });
        if (!created && !isAdminEmail(googleUser.email, getAdminEmails())) {
          setError("Could not create your access request. Try again.");
          await signOutStaff();
          return;
        }
        if (created?.status === "pending") {
          // Only announce pending after a real profile object with pending status.
          setLoggingIn(false);
          await releaseToLogin(staffPendingLoginMessage(portal));
          return;
        }

        const gate = staffAccessGateKind(
          created,
          googleUser.email,
          getAdminEmails()
        );
        if (gate === "pending") {
          setLoggingIn(false);
          await releaseToLogin(staffPendingLoginMessage(portal));
          return;
        }
        if (gate === "denied") {
          setLoggingIn(false);
          await releaseToLogin(staffDeniedLoginMessage(portal));
          return;
        }
        if (!portalAccessAllowed(portal, created, googleUser.email)) {
          if (
            portal === "ops" &&
            created?.status === "approved" &&
            created.role === "driver"
          ) {
            setProfile(created);
            setBanned(false);
            setNotice(staffOpsDriverOnlyMessage());
            setProfileReady(true);
            bootstrappingAccessRef.current = false;
            return;
          }
          setLoggingIn(false);
          await releaseToLogin(wrongPortalMessage(portal));
          return;
        }

        setProfile(created);
        setBanned(false);
        setProfileReady(true);
        bootstrappingAccessRef.current = false;
      } catch (err) {
        logGoogleSignInFailure("StaffAuth.signIn.profile", err);
        bootstrappingAccessRef.current = false;
        if (isStaffBannedError(err)) {
          // Match web banned screen: stay signed in until explicit Sign out.
          holdBannedSession();
          return;
        }
        setError(
          err instanceof Error
            ? err.message
            : "Could not create your access request. Try again."
        );
        await signOutStaff();
      }
    } finally {
      setLoggingIn(false);
      signInInFlightRef.current = false;
    }
  }, [portal, releaseToLogin, holdBannedSession]);

  const signOut = useCallback(async () => {
    setError("");
    setNotice("");
    setBanned(false);
    await signOutStaff();
  }, []);

  const clearMessages = useCallback(() => {
    setError("");
    setNotice("");
  }, []);

  const phase: StaffAuthPhase = useMemo(() => {
    if (!authReady) return "booting";
    if (user && banned) return "banned";
    if (!user) {
      if (banned) return "banned";
      if (notice.startsWith("Request sent.")) return "pending";
      if (notice.startsWith("You're approved.")) return "signedOut";
      if (
        notice.includes("not approved") ||
        notice.includes("access was removed") ||
        notice.includes("does not have")
      ) {
        return "denied";
      }
      if (notice.includes("banned")) return "banned";
      return "signedOut";
    }
    if (isAdminEmail(user.email, getAdminEmails())) return "ready";
    if (!profileReady) return "loadingProfile";
    if (banned) return "banned";
    if (portalAccessAllowed(portal, profile, user.email)) return "ready";
    return "unauthorized";
  }, [authReady, user, profileReady, profile, portal, banned, notice]);

  const value = useMemo(
    () => ({
      portal,
      phase,
      user,
      profile,
      notice,
      error,
      loggingIn,
      signIn,
      signOut,
      clearMessages,
    }),
    [
      portal,
      phase,
      user,
      profile,
      notice,
      error,
      loggingIn,
      signIn,
      signOut,
      clearMessages,
    ]
  );

  return (
    <StaffAuthContext.Provider value={value}>
      {children}
    </StaffAuthContext.Provider>
  );
}

export function useStaffAuth() {
  const ctx = useContext(StaffAuthContext);
  if (!ctx) {
    throw new Error("useStaffAuth must be used within StaffAuthProvider");
  }
  return ctx;
}
