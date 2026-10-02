"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  createUserWithEmailAndPassword,
  getRedirectResult,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  type User,
} from "firebase/auth";
import { LogOut, Truck } from "lucide-react";

import { AdminOrdersPanel } from "@/components/admin-orders-panel";
import { BrandSplash } from "@/components/brand-splash";
import { GoogleGIcon } from "@/components/google-g-icon";
import { OpsBootProvider } from "@/components/ops-boot";
import { Button } from "@/components/ui/button";
import {
  canAccessDriverPortal,
  ensureStaffProfile,
  isStaffBannedError,
  setStaffLoginNotice,
  staffAccessGateKind,
  staffApprovedLoginMessage,
  staffDeniedLoginMessage,
  staffPendingLoginMessage,
  subscribeStaffBan,
  subscribeStaffProfile,
  takeStaffLoginNotice,
  type StaffProfile,
  type StaffStatus,
} from "@/lib/staff-access";
import {
  bindStaffFirebaseBackend,
  getFirebaseAuth,
  readyFirebaseAuth,
  unbindStaffFirebaseBackend,
} from "@/lib/firebase";
import {
  googleSignInErrorMessage,
  signInWithGoogle,
} from "@/lib/google-sign-in";
import { isAdminEmail } from "@/lib/site-config";
import { useQueryReplace } from "@/lib/use-query-replace";
import { cn } from "@/lib/utils";

// Isolate Driver Auth from the public site — staff signOut must not clear /account.
bindStaffFirebaseBackend();

type MobileView = "list" | "detail";
type AuthMode = "signin" | "signup";

function FoamMark({
  compact = false,
  rail = false,
}: {
  compact?: boolean;
  rail?: boolean;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className={cn(
        "ops-foam-mark",
        compact && "is-compact",
        rail && "is-rail"
      )}
      src={
        rail
          ? "/foam-ops-logo-on-dark.png"
          : encodeURI("/ChatGPT Image Sep 23, 2026, 03_30_38 PM.png")
      }
      alt="FOAM"
      width={217}
      height={72}
    />
  );
}

function DriverAppInner() {
  const { searchParams, replaceQuery } = useQueryReplace();
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [profile, setProfile] = useState<StaffProfile | null>(null);
  const [profileReady, setProfileReady] = useState(false);
  const bootstrappingAccess = useRef(false);
  const announceGateRef = useRef(false);
  const lastStatusRef = useRef<StaffStatus | null>(null);
  const [banned, setBanned] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [loginNotice, setLoginNotice] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>("signin");
  const [showLoginBrand, setShowLoginBrand] = useState(false);
  const mobileView: MobileView =
    searchParams.get("view") === "detail" ? "detail" : "list";

  useEffect(() => {
    bindStaffFirebaseBackend();
    return () => unbindStaffFirebaseBackend();
  }, []);

  const isAdmin = isAdminEmail(user?.email);
  const approved = canAccessDriverPortal(profile, user?.email);

  useEffect(() => {
    // Only surface approved/denied notices that outlive a live sign-out.
    // Pending notices stay in React state only (never after a bare refresh).
    const notice = takeStaffLoginNotice();
    if (notice && !notice.startsWith("Request sent.")) {
      setLoginNotice(notice);
    }
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 821px)");
    const sync = () => setShowLoginBrand(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  async function releaseToLogin(message: string, announce: boolean) {
    // Pending stays in memory only so a refresh does not fake a new request.
    if (announce) {
      if (message.startsWith("Request sent.")) {
        setLoginNotice(message);
      } else {
        setStaffLoginNotice(message);
        setLoginNotice(message);
      }
    }
    setProfile(null);
    setProfileReady(false);
    setBanned(false);
    lastStatusRef.current = null;
    bootstrappingAccess.current = true;
    try {
      await signOut(getFirebaseAuth());
    } finally {
      window.setTimeout(() => {
        bootstrappingAccess.current = false;
      }, 1500);
      if (announce && message.startsWith("Request sent.")) {
        window.setTimeout(() => {
          window.location.reload();
        }, 2000);
      }
    }
  }

  async function gateLoadedProfile(
    loaded: StaffProfile | null,
    email?: string | null,
    announce = false
  ): Promise<boolean> {
    const gate = staffAccessGateKind(loaded, email);
    if (gate === "pending") {
      await releaseToLogin(staffPendingLoginMessage("driver"), announce);
      return false;
    }
    if (gate === "denied") {
      await releaseToLogin(staffDeniedLoginMessage("driver"), announce);
      return false;
    }
    return true;
  }

  useEffect(() => {
    let alive = true;
    let unsub = () => {};

    void readyFirebaseAuth().then(async (auth) => {
      if (!alive) return;
      try {
        const redirectResult = await getRedirectResult(auth);
        if (redirectResult?.user) {
          bootstrappingAccess.current = true;
          try {
            if (!isAdminEmail(redirectResult.user.email)) {
              const created = await ensureStaffProfile(
                redirectResult.user,
                "driver",
                { createIfMissing: true }
              );
              if (!alive) return;
              if (created) {
                const allowed = await gateLoadedProfile(
                  created,
                  redirectResult.user.email,
                  true
                );
                if (!alive || !allowed) return;
                setProfile(created);
                setBanned(false);
                setProfileReady(true);
              }
            }
          } catch (error) {
            if (!alive) return;
            if (isStaffBannedError(error)) {
              setBanned(true);
              setProfile(null);
              setProfileReady(true);
            }
          } finally {
            window.setTimeout(() => {
              bootstrappingAccess.current = false;
            }, 4000);
          }
        }
      } catch {
        /* ignore */
      }
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
      setBanned(false);
      lastStatusRef.current = null;
      return;
    }

    if (isAdminEmail(user.email)) {
      setProfile(null);
      setProfileReady(true);
      setBanned(false);
      return;
    }

    let alive = true;
    let syncing = false;
    let sawStaffDoc = false;
    const activeUser = user;
    const userEmail = activeUser.email;
    setProfileReady(false);
    setBanned(false);

    function kickToLogin() {
      if (bootstrappingAccess.current) return;
      void signOut(getFirebaseAuth());
    }

    async function applyProfile(loaded: StaffProfile) {
      if (!alive) return;
      // Login/signup handlers own create + gate + messaging.
      if (bootstrappingAccess.current) {
        sawStaffDoc = true;
        lastStatusRef.current = loaded.status;
        setProfile(loaded);
        setBanned(false);
        setProfileReady(true);
        return;
      }
      const prev = lastStatusRef.current;
      lastStatusRef.current = loaded.status;
      if (prev === "pending" && loaded.status === "approved") {
        await releaseToLogin(staffApprovedLoginMessage("driver"), true);
        return;
      }
      const allowed = await gateLoadedProfile(loaded, userEmail, false);
      if (!alive || !allowed) return;
      sawStaffDoc = true;
      setProfile(loaded);
      setBanned(false);
      setProfileReady(true);
    }

    async function syncProfile() {
      if (!alive || syncing) return;
      syncing = true;
      try {
        const loaded = await ensureStaffProfile(activeUser, "driver", {
          createIfMissing: true,
        });
        if (!alive) return;
        if (!loaded) {
          setProfile(null);
          setProfileReady(true);
          return;
        }
        await applyProfile(loaded);
      } catch (error) {
        if (!alive) return;
        setProfile(null);
        if (isStaffBannedError(error)) {
          setBanned(true);
          setProfileReady(true);
          return;
        }
        try {
          const retry = await ensureStaffProfile(activeUser, "driver", {
            createIfMissing: true,
          });
          if (!alive) return;
          if (retry) {
            await applyProfile(retry);
            return;
          }
        } catch (retryError) {
          if (!alive) return;
          if (isStaffBannedError(retryError)) {
            setBanned(true);
            setProfileReady(true);
            return;
          }
        }
        setProfileReady(true);
      } finally {
        syncing = false;
      }
    }

    void syncProfile();

    const unsubProfile = subscribeStaffProfile(activeUser.uid, (next) => {
      if (!alive) return;
      if (next) {
        void applyProfile(next);
        return;
      }
      setProfile(null);
      if (sawStaffDoc) {
        sawStaffDoc = false;
        kickToLogin();
      }
    });

    const unsubBan = subscribeStaffBan(userEmail ?? "", (isBanned) => {
      if (!alive) return;
      if (isBanned) {
        setBanned(true);
        setProfile(null);
        setProfileReady(true);
        return;
      }
      setBanned(false);
      void syncProfile();
    });

    return () => {
      alive = false;
      unsubProfile();
      unsubBan();
    };
  }, [user]);

  const setMobileView = useCallback(
    (view: MobileView) => {
      replaceQuery({
        view: view === "list" ? null : view,
        id: view === "list" ? null : undefined,
      });
    },
    [replaceQuery]
  );

  async function handleEmailAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoggingIn(true);
    setLoginError("");
    setLoginNotice("");
    const data = new FormData(event.currentTarget);
    const email = String(data.get("email") ?? "").trim();
    const password = String(data.get("password") ?? "");
    const name = String(data.get("name") ?? "").trim();

    try {
      const auth = await readyFirebaseAuth();
      bootstrappingAccess.current = true;
      announceGateRef.current = true;
      if (authMode === "signup") {
        const result = await createUserWithEmailAndPassword(
          auth,
          email,
          password
        );
        if (name) {
          await updateProfile(result.user, { displayName: name });
        }
        const created = await ensureStaffProfile(result.user, "driver", {
          createIfMissing: true,
          refreshPending: true,
        });
        const allowed = await gateLoadedProfile(
          created,
          result.user.email,
          true
        );
        if (!allowed) return;
        setProfile(created);
        setBanned(false);
        setProfileReady(true);
      } else {
        const result = await signInWithEmailAndPassword(auth, email, password);
        const created = await ensureStaffProfile(result.user, "driver", {
          createIfMissing: true,
          refreshPending: true,
        });
        const allowed = await gateLoadedProfile(
          created,
          result.user.email,
          true
        );
        if (!allowed) return;
        setProfile(created);
        setBanned(false);
        setProfileReady(true);
      }
    } catch (err) {
      announceGateRef.current = false;
      if (isStaffBannedError(err)) {
        setLoginError("This email is banned from Driver and OPS access.");
      } else {
      const code =
        err && typeof err === "object" && "code" in err
          ? String((err as { code: string }).code)
          : "";
      if (code === "auth/email-already-in-use") {
        setLoginError("Account already exists. Sign in instead.");
      } else if (code === "auth/weak-password") {
        setLoginError("Password must be at least 6 characters.");
      } else if (code === "auth/invalid-credential" || code === "auth/wrong-password") {
        setLoginError("Wrong email or password.");
      } else {
        setLoginError(
          authMode === "signup"
            ? "Could not create account. Try again."
            : "Login failed. Check email and password."
        );
      }
      }
    } finally {
      window.setTimeout(() => {
        bootstrappingAccess.current = false;
      }, 4000);
      setLoggingIn(false);
    }
  }

  async function handleGoogleLogin() {
    setLoggingIn(true);
    setLoginError("");
    setLoginNotice("");
    try {
      bootstrappingAccess.current = true;
      announceGateRef.current = true;
      const auth = await readyFirebaseAuth();
      if (auth.currentUser) {
        try {
          await signOut(auth);
          await new Promise((r) => window.setTimeout(r, 400));
        } catch {
          /* continue */
        }
      }
      const googleUser = await signInWithGoogle();
      try {
        const created = await ensureStaffProfile(googleUser, "driver", {
          createIfMissing: true,
          refreshPending: true,
        });
        if (!created) {
          setLoginError("Could not create your access request. Try again.");
          void signOut(getFirebaseAuth());
          return;
        }
        const allowed = await gateLoadedProfile(
          created,
          googleUser.email,
          true
        );
        if (!allowed) return;
        setProfile(created);
        setBanned(false);
        setProfileReady(true);
      } catch (error) {
        announceGateRef.current = false;
        if (isStaffBannedError(error)) {
          setLoginError("This email is banned from Driver and OPS access.");
          void signOut(getFirebaseAuth());
          return;
        }
        const recovered = await ensureStaffProfile(googleUser, "driver", {
          createIfMissing: true,
          refreshPending: true,
        }).catch(() => null);
        if (recovered) {
          const allowed = await gateLoadedProfile(
            recovered,
            googleUser.email,
            true
          );
          if (!allowed) return;
          setProfile(recovered);
          setBanned(false);
          setProfileReady(true);
          return;
        }
        const detail =
          error instanceof Error && error.message
            ? error.message
            : "Could not create your access request. Try again.";
        setLoginError(detail);
        void signOut(getFirebaseAuth());
      }
    } catch (error) {
      announceGateRef.current = false;
      setLoginError(
        googleSignInErrorMessage(
          error,
          "Google sign-in failed. Try again, or use email + password."
        )
      );
    } finally {
      window.setTimeout(() => {
        bootstrappingAccess.current = false;
      }, 4000);
      setLoggingIn(false);
    }
  }

  const consoleReady = Boolean(user && approved && (isAdmin || profileReady));
  const gateReady = !user || isAdmin || profileReady;

  return (
    <OpsBootProvider
      authReady={authReady}
      gateReady={gateReady}
      consoleReady={consoleReady}
    >
      {!authReady ? null : !user ? (
        <main className="ops-login">
          <section className="ops-login-form-pane">
            <div className="ops-login-card">
              <FoamMark />
              <p className="ops-eyebrow">Driver</p>
              <div className="ops-login-intro">
                <h1 className="ops-login-title">
                  {authMode === "signup" ? "Join the team." : "Ready for the route."}
                </h1>
              </div>

              {loginNotice ? (
                <p className="ops-flash is-ok" role="status">
                  {loginNotice}
                </p>
              ) : null}

              <Button
                type="button"
                size="lg"
                variant="outline"
                className="ops-login-google"
                disabled={loggingIn}
                onClick={() => void handleGoogleLogin()}
              >
                <GoogleGIcon size={20} className="ops-google-icon" />
                Continue with Google
              </Button>

              <div className="ops-login-divider">
                <span>or use email</span>
              </div>

              <form className="ops-login-fields" onSubmit={handleEmailAuth}>
                {authMode === "signup" ? (
                  <label>
                    Full name
                    <input
                      name="name"
                      type="text"
                      autoComplete="name"
                      placeholder="Your name"
                    />
                  </label>
                ) : null}
                <label>
                  Email address
                  <input
                    name="email"
                    type="email"
                    required
                    autoComplete="username"
                    placeholder="driver@foam.co"
                  />
                </label>
                <label>
                  Password
                  <input
                    name="password"
                    type="password"
                    required
                    autoComplete={
                      authMode === "signup"
                        ? "new-password"
                        : "current-password"
                    }
                    placeholder={
                      authMode === "signup"
                        ? "Create a password"
                        : "Enter your password"
                    }
                    minLength={6}
                  />
                </label>
                {loginError ? <p className="ops-error">{loginError}</p> : null}
                <Button type="submit" size="lg" disabled={loggingIn}>
                  {loggingIn
                    ? authMode === "signup"
                      ? "Creating…"
                      : "Signing in…"
                    : authMode === "signup"
                      ? "Create account"
                      : "Sign in"}
                </Button>
              </form>

              <p className="ops-login-foot">
                {authMode === "signup" ? (
                  <>
                    Already have an account?{" "}
                    <button
                      type="button"
                      className="ops-login-switch"
                      onClick={() => {
                        setAuthMode("signin");
                        setLoginError("");
                      }}
                    >
                      Sign in
                    </button>
                  </>
                ) : (
                  <>
                    New driver?{" "}
                    <button
                      type="button"
                      className="ops-login-switch"
                      onClick={() => {
                        setAuthMode("signup");
                        setLoginError("");
                      }}
                    >
                      Create account
                    </button>
                  </>
                )}
              </p>
              <p className="ops-login-foot is-soft">
                Apple Sign-In coming later.
              </p>
            </div>
          </section>

          {showLoginBrand ? (
            <section className="ops-login-brand">
              <div className="ops-login-brand-pattern" aria-hidden />
              <div className="ops-login-brand-top">
                <FoamMark rail />
                <small>DRIVER · LAS VEGAS</small>
              </div>
              <div className="ops-login-brand-art" aria-hidden>
                <span className="ops-login-brand-glow" />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  className="ops-login-koala"
                  src="/foam-koala.png"
                  alt=""
                  width={720}
                  height={720}
                />
              </div>
              <div className="ops-login-brand-copy">
                <p className="ops-login-brand-title">
                  Pickups.
                  <br />
                  Deliveries.
                  <br />
                  On the road.
                </p>
                <p className="ops-login-brand-sub">
                  Only the orders you need for today’s route.
                </p>
              </div>
            </section>
          ) : null}
        </main>
      ) : !profileReady && !isAdmin ? (
        null
      ) : banned ? (
        <main className="ops-login">
          <section className="ops-login-form-pane">
            <div className="ops-login-card">
              <FoamMark />
              <div className="ops-driver-status-icon is-banned" aria-hidden>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/ops-banned-icon.png"
                  alt=""
                  width={88}
                  height={88}
                />
              </div>
              <h1 className="ops-login-title">Access banned</h1>
              <p className="ops-muted">
                <strong>{user.email}</strong> is blocked from Driver and OPS.
                Contact FOAM ops if this is a mistake.
              </p>
              <Button
                type="button"
                variant="outline"
                onClick={() => void signOut(getFirebaseAuth())}
              >
                Sign out
              </Button>
            </div>
          </section>
        </main>
      ) : !approved ? (
        null
      ) : (
        <div className="ops-shell is-driver">
          <header className="ops-driver-bar">
            <div className="ops-driver-bar-brand">
              <FoamMark compact />
              <span className="ops-driver-bar-chip">
                <Truck size={14} aria-hidden />
                Driver
              </span>
            </div>
            <div className="ops-driver-bar-actions">
              <span className="ops-driver-bar-email">{user.email}</span>
              <button
                type="button"
                className="ops-driver-signout"
                onClick={() => {
                  if (!window.confirm("Sign out?")) return;
                  void signOut(getFirebaseAuth());
                }}
              >
                <LogOut size={16} aria-hidden />
                Sign out
              </button>
            </div>
          </header>
          <div className="ops-frame is-driver">
            <div
              className={cn(
                "ops-panel",
                mobileView === "detail" && "is-detail-open"
              )}
            >
              <AdminOrdersPanel
                mode="today"
                adminEmail={user.email ?? ""}
                mobileView={mobileView}
                onMobileViewChange={setMobileView}
                viewer="driver"
              />
            </div>
          </div>
        </div>
      )}
    </OpsBootProvider>
  );
}

export function DriverApp() {
  return (
    <Suspense fallback={<BrandSplash label="Loading driver…" />}>
      <DriverAppInner />
    </Suspense>
  );
}
