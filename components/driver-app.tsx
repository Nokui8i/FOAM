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
import { LogOut, ShieldAlert, Truck } from "lucide-react";

import { AdminOrdersPanel } from "@/components/admin-orders-panel";
import { BrandSplash } from "@/components/brand-splash";
import { GoogleGIcon } from "@/components/google-g-icon";
import { OpsBootProvider } from "@/components/ops-boot";
import { Button } from "@/components/ui/button";
import {
  canAccessDriverPortal,
  ensureStaffProfile,
  isStaffBannedError,
  subscribeStaffBan,
  subscribeStaffProfile,
  type StaffProfile,
} from "@/lib/staff-access";
import { getFirebaseAuth, readyFirebaseAuth } from "@/lib/firebase";
import {
  googleSignInErrorMessage,
  signInWithGoogle,
} from "@/lib/google-sign-in";
import { isAdminEmail } from "@/lib/site-config";
import { useQueryReplace } from "@/lib/use-query-replace";
import { cn } from "@/lib/utils";

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
  const [banned, setBanned] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>("signin");
  const [showLoginBrand, setShowLoginBrand] = useState(false);
  const mobileView: MobileView =
    searchParams.get("view") === "detail" ? "detail" : "list";

  const isAdmin = isAdminEmail(user?.email);
  const approved = canAccessDriverPortal(profile, user?.email);
  const pending = !isAdmin && !banned && profile?.status === "pending";
  const denied =
    !isAdmin &&
    !banned &&
    (profile?.status === "denied" || profile?.status === "revoked");

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 821px)");
    const sync = () => setShowLoginBrand(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    let alive = true;
    let unsub = () => {};

    void readyFirebaseAuth().then((auth) => {
      if (!alive) return;
      void getRedirectResult(auth).catch(() => {
        /* ignore */
      });
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
    setProfileReady(false);
    setBanned(false);

    async function syncProfile() {
      if (!alive || !user || syncing) return;
      syncing = true;
      try {
        const loaded = await ensureStaffProfile(user, "driver", {
          createIfMissing: false,
        });
        if (!alive) return;
        if (!loaded) {
          if (!bootstrappingAccess.current) {
            void signOut(getFirebaseAuth());
          }
          return;
        }
        setProfile(loaded);
        setBanned(false);
        setProfileReady(true);
      } catch (error) {
        if (!alive) return;
        setProfile(null);
        if (isStaffBannedError(error)) {
          setBanned(true);
          setProfileReady(true);
          return;
        }
        if (!bootstrappingAccess.current) {
          void signOut(getFirebaseAuth());
        }
      } finally {
        syncing = false;
      }
    }

    void syncProfile();

    const unsubProfile = subscribeStaffProfile(user.uid, (next) => {
      if (!alive) return;
      if (next) {
        setProfile(next);
        setBanned(false);
        setProfileReady(true);
        return;
      }
      setProfile(null);
      if (!bootstrappingAccess.current) {
        void signOut(getFirebaseAuth());
      }
    });

    const unsubBan = subscribeStaffBan(user.email ?? "", (isBanned) => {
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
    const data = new FormData(event.currentTarget);
    const email = String(data.get("email") ?? "").trim();
    const password = String(data.get("password") ?? "");
    const name = String(data.get("name") ?? "").trim();

    try {
      const auth = await readyFirebaseAuth();
      bootstrappingAccess.current = true;
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
        });
        setProfile(created);
        setBanned(false);
        setProfileReady(true);
      } else {
        const result = await signInWithEmailAndPassword(auth, email, password);
        const created = await ensureStaffProfile(result.user, "driver", {
          createIfMissing: true,
        });
        setProfile(created);
        setBanned(false);
        setProfileReady(true);
      }
    } catch (err) {
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
      bootstrappingAccess.current = false;
      setLoggingIn(false);
    }
  }

  async function handleGoogleLogin() {
    setLoggingIn(true);
    setLoginError("");
    try {
      bootstrappingAccess.current = true;
      const googleUser = await signInWithGoogle();
      try {
        const created = await ensureStaffProfile(googleUser, "driver", {
          createIfMissing: true,
        });
        setProfile(created);
        setBanned(false);
        setProfileReady(true);
      } catch (error) {
        if (isStaffBannedError(error)) {
          setLoginError("This email is banned from Driver and OPS access.");
        } else {
          setLoginError(
            "Signed in, but could not create your access request. Try again."
          );
          void signOut(getFirebaseAuth());
        }
      }
    } catch (error) {
      setLoginError(
        googleSignInErrorMessage(
          error,
          "Google sign-in failed. Try again, or use email + password."
        )
      );
    } finally {
      bootstrappingAccess.current = false;
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
                <p className="ops-muted">
                  {authMode === "signup"
                    ? "Create an account. An admin must approve you before you can see orders."
                    : "Sign in to see today’s pickups and deliveries."}
                </p>
              </div>

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
      ) : pending ? (
        <main className="ops-login">
          <section className="ops-login-form-pane">
            <div className="ops-login-card">
              <FoamMark />
              <div className="ops-driver-status-icon is-waiting" aria-hidden>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/ops-waiting-icon.png"
                  alt=""
                  width={88}
                  height={88}
                />
              </div>
              <h1 className="ops-login-title">Waiting for approval</h1>
              <p className="ops-muted">
                Signed in as <strong>{user.email}</strong>. An admin must
                approve your access on the OPS Staff page before you can see
                orders.
              </p>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  if (!window.confirm("Sign out?")) return;
                  void signOut(getFirebaseAuth());
                }}
              >
                Sign out
              </Button>
            </div>
          </section>
        </main>
      ) : denied ? (
        <main className="ops-login">
          <section className="ops-login-form-pane">
            <div className="ops-login-card">
              <FoamMark />
              <div className="ops-driver-status-icon is-danger" aria-hidden>
                <ShieldAlert size={28} />
              </div>
              <h1 className="ops-login-title">Access not approved</h1>
              <p className="ops-muted">
                This account was not approved for driver access. Contact FOAM
                ops if you think this is a mistake.
              </p>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  void signOut(getFirebaseAuth());
                }}
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
