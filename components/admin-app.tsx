"use client";

import { useCallback, useEffect, useRef, useState, Suspense, type FormEvent, type RefObject } from "react";
import {
  createUserWithEmailAndPassword,
  getRedirectResult,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  type User,
} from "firebase/auth";
import { collection, onSnapshot } from "firebase/firestore";
import {
  Bell,
  CalendarDays,
  ChevronDown,
  CircleDollarSign,
  Clock3,
  Headphones,
  History,
  LogOut,
  Menu,
  Shirt,
  Ticket,
  Truck,
  Users,
  X,
} from "lucide-react";

import { AdminAlertsPanel } from "@/components/admin-alerts-panel";
import { AdminCatalogPanel } from "@/components/admin-catalog-panel";
import { AdminContactsPanel } from "@/components/admin-contacts-panel";
import { AdminOrdersPanel } from "@/components/admin-orders-panel";
import { AdminPricingPanel } from "@/components/admin-pricing-panel";
import { AdminPromosPanel } from "@/components/admin-promos-panel";
import { AdminSchedulePanel } from "@/components/admin-schedule-panel";
import { AdminStaffPanel } from "@/components/admin-staff-panel";
import { BrandSplash } from "@/components/brand-splash";
import { GoogleGIcon } from "@/components/google-g-icon";
import { OpsBootProvider } from "@/components/ops-boot";
import { Button } from "@/components/ui/button";
import {
  bindStaffFirebaseBackend,
  getFirebaseAuth,
  getFirebaseDb,
  readyFirebaseAuth,
  unbindStaffFirebaseBackend,
} from "@/lib/firebase";
import {
  googleSignInErrorMessage,
  signInWithGoogle,
} from "@/lib/google-sign-in";
import { purgeExpiredOpsDataOncePerSession } from "@/lib/data-retention";
import {
  isFuturePickupOrder,
  isHistoryOrder,
  isReadyForDelivery,
  isWaitingTodayOrder,
  isWashingOrder,
  normalizeOrderStatus,
  type FoamOrder,
} from "@/lib/orders";
import { useQueryReplace } from "@/lib/use-query-replace";
import { cn } from "@/lib/utils";
import {
  isInPickupReminderWindow,
} from "@/lib/admin-alerts";
import {
  canAccessOps,
  canManageStaffPage,
  ensureStaffProfile,
  isCompanyOwner,
  isStaffBannedError,
  setStaffLoginNotice,
  staffAccessGateKind,
  staffApprovedLoginMessage,
  staffDeniedLoginMessage,
  staffPendingLoginMessage,
  subscribePendingStaff,
  subscribeStaffBan,
  subscribeStaffProfile,
  takeStaffLoginNotice,
  type StaffProfile,
  type StaffStatus,
} from "@/lib/staff-access";
import { reconcileWeeklyQueues } from "@/lib/weekly-automation";

// Isolate OPS Auth from the public site — staff signOut must not clear /account.
bindStaffFirebaseBackend();

type AdminTab =
  | "orders"
  | "future"
  | "history"
  | "support"
  | "alerts"
  | "staff"
  | "catalog"
  | "promos"
  | "pricing"
  | "schedule";
type MobileView = "list" | "detail";
type AuthMode = "signin" | "signup";

const TAB_FROM_PARAM: Record<string, AdminTab> = {
  orders: "orders",
  future: "future",
  history: "history",
  support: "support",
  contacts: "support",
  alerts: "alerts",
  staff: "staff",
  catalog: "catalog",
  promos: "promos",
  pricing: "pricing",
  schedule: "schedule",
};

function parseAdminTab(raw: string | null): AdminTab {
  if (!raw) return "orders";
  return TAB_FROM_PARAM[raw] ?? "orders";
}

function orderStubFromDoc(data: Record<string, unknown>): FoamOrder {
  const pickup = (data.pickup ?? {}) as Record<string, unknown>;
  return {
    id: "",
    status: normalizeOrderStatus(data.status),
    guest: false,
    uid: null,
    services: { laundry: true, dryCleaning: false, bagCount: 1 },
    contact: { name: "", email: "", phone: "" },
    pickup: {
      address: "",
      unit: "",
      city: "",
      zip: "",
      notes: "",
      date: String(pickup.date ?? ""),
      slot: String(pickup.slot ?? ""),
      repeat: false,
    },
  };
}

function FoamMark({
  compact = false,
  rail = false,
}: {
  compact?: boolean;
  rail?: boolean;
}) {
  /* Exact FOAM logo asset for ops rail + login. */
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

function initialsFromEmail(email: string | null | undefined) {
  if (!email) return "FO";
  const local = email.split("@")[0] ?? "";
  const parts = local.split(/[._-]+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
  }
  return local.slice(0, 2).toUpperCase() || "FO";
}

export function AdminApp() {
  return (
    <Suspense fallback={<BrandSplash label="Loading OPS…" />}>
      <AdminAppInner />
    </Suspense>
  );
}

function AdminAppInner() {
  const { searchParams, replaceQuery } = useQueryReplace();
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [staffProfile, setStaffProfile] = useState<StaffProfile | null>(null);
  const [staffReady, setStaffReady] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [loginNotice, setLoginNotice] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>("signin");
  const tab = parseAdminTab(searchParams.get("tab"));
  const mobileView: MobileView =
    searchParams.get("view") === "detail" ? "detail" : "list";
  const [openInquiriesCount, setOpenInquiriesCount] = useState(0);
  const [alertsTodoCount, setAlertsTodoCount] = useState(0);
  const [reminderTodoCount, setReminderTodoCount] = useState(0);
  const [pendingStaffCount, setPendingStaffCount] = useState(0);
  const [ordersCount, setOrdersCount] = useState(0);
  const [futureCount, setFutureCount] = useState(0);
  const [historyCount, setHistoryCount] = useState(0);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bindStaffFirebaseBackend();
    return () => unbindStaffFirebaseBackend();
  }, []);
  const bootstrappingAccess = useRef(false);
  const lastStatusRef = useRef<StaffStatus | null>(null);
  const [showLoginBrand, setShowLoginBrand] = useState(false);
  const [bannedAccess, setBannedAccess] = useState(false);

  const allowed = canAccessOps(staffProfile, user?.email);
  const canManageStaff = canManageStaffPage(staffProfile, user?.email);
  const driverOnlyAccess =
    Boolean(user) &&
    staffReady &&
    !allowed &&
    !bannedAccess &&
    staffProfile?.status === "approved" &&
    staffProfile.role === "driver";

  useEffect(() => {
    const notice = takeStaffLoginNotice();
    if (notice) setLoginNotice(notice);
  }, []);

  async function releaseToLogin(message: string) {
    setStaffLoginNotice(message);
    setLoginNotice(message);
    setStaffProfile(null);
    setStaffReady(false);
    setBannedAccess(false);
    lastStatusRef.current = null;
    bootstrappingAccess.current = true;
    try {
      await signOut(getFirebaseAuth());
    } finally {
      window.setTimeout(() => {
        bootstrappingAccess.current = false;
      }, 1500);
    }
  }

  async function gateLoadedProfile(
    loaded: StaffProfile | null,
    email?: string | null
  ): Promise<boolean> {
    if (isCompanyOwner(email)) return true;
    const gate = staffAccessGateKind(loaded, email);
    if (gate === "pending") {
      await releaseToLogin(staffPendingLoginMessage("ops"));
      return false;
    }
    if (gate === "denied") {
      await releaseToLogin(staffDeniedLoginMessage("ops"));
      return false;
    }
    return true;
  }

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 821px)");
    const sync = () => setShowLoginBrand(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (!accountMenuOpen) return;

    function handlePointerDown(event: PointerEvent) {
      const root = accountMenuRef.current;
      if (!root) return;
      const target = event.target;
      if (target instanceof Node && root.contains(target)) return;
      setAccountMenuOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setAccountMenuOpen(false);
    }

    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [accountMenuOpen]);

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
            const created = await ensureStaffProfile(redirectResult.user, "ops", {
              createIfMissing: true,
            });
            if (!alive) return;
            if (created) {
              const allowedIn = await gateLoadedProfile(
                created,
                redirectResult.user.email
              );
              if (!alive || !allowedIn) return;
              setStaffProfile(created);
              setBannedAccess(false);
              setStaffReady(true);
            }
          } catch (error) {
            if (!alive) return;
            if (isStaffBannedError(error)) {
              setBannedAccess(true);
              setStaffProfile(null);
              setStaffReady(true);
            }
          } finally {
            window.setTimeout(() => {
              bootstrappingAccess.current = false;
            }, 4000);
          }
        }
      } catch {
        /* ignore stray redirect errors */
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
      setStaffProfile(null);
      setStaffReady(false);
      setBannedAccess(false);
      lastStatusRef.current = null;
      return;
    }

    let alive = true;
    let syncing = false;
    let sawStaffDoc = false;
    const activeUser = user;
    const userEmail = activeUser.email;
    setStaffReady(false);
    setBannedAccess(false);

    const isOwnerAccount = isCompanyOwner(userEmail);

    function kickToLogin() {
      if (bootstrappingAccess.current) return;
      if (isOwnerAccount) return;
      void signOut(getFirebaseAuth());
    }

    async function applyProfile(loaded: StaffProfile) {
      if (!alive) return;
      if (isOwnerAccount) {
        sawStaffDoc = true;
        lastStatusRef.current = loaded.status;
        setStaffProfile(loaded);
        setBannedAccess(false);
        setStaffReady(true);
        return;
      }
      const prev = lastStatusRef.current;
      lastStatusRef.current = loaded.status;
      if (prev === "pending" && loaded.status === "approved") {
        await releaseToLogin(staffApprovedLoginMessage("ops"));
        return;
      }
      const allowedIn = await gateLoadedProfile(loaded, userEmail);
      if (!alive || !allowedIn) return;
      // Approved drivers stay signed in only long enough for the driver-only screen.
      sawStaffDoc = true;
      setStaffProfile(loaded);
      setBannedAccess(false);
      setStaffReady(true);
    }

    async function syncProfile() {
      if (!alive || syncing) return;
      syncing = true;
      try {
        const loaded = await ensureStaffProfile(activeUser, "ops", {
          createIfMissing: true,
        });
        if (!alive) return;
        if (!loaded) {
          setStaffProfile(null);
          setStaffReady(true);
          return;
        }
        await applyProfile(loaded);
      } catch (error) {
        if (!alive) return;
        setStaffProfile(null);
        if (isStaffBannedError(error)) {
          setBannedAccess(true);
          setStaffReady(true);
          return;
        }
        try {
          const retry = await ensureStaffProfile(activeUser, "ops", {
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
            setBannedAccess(true);
            setStaffReady(true);
            return;
          }
        }
        setStaffReady(true);
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
      setStaffProfile(null);
      if (sawStaffDoc) {
        sawStaffDoc = false;
        kickToLogin();
      }
    });

    const unsubBan = subscribeStaffBan(userEmail ?? "", (isBanned) => {
      if (!alive) return;
      if (isBanned) {
        setBannedAccess(true);
        setStaffProfile(null);
        setStaffReady(true);
        return;
      }
      setBannedAccess(false);
      void syncProfile();
    });

    return () => {
      alive = false;
      unsubProfile();
      unsubBan();
    };
  }, [user]);

  useEffect(() => {
    if (!allowed) return;
    const db = getFirebaseDb();
    const unsubContacts = onSnapshot(
      collection(db, "contactMessages"),
      (snap) => {
        const open = snap.docs.filter((d) => d.data().status !== "done").length;
        setOpenInquiriesCount(open);
      },
      () => {
        /* permission/network blip — keep last counts */
      }
    );
    const unsubOrders = onSnapshot(
      collection(db, "orders"),
      (snap) => {
        let todayActive = 0;
        let future = 0;
        let history = 0;
        let alertsTodo = 0;
        for (const docSnap of snap.docs) {
          const data = docSnap.data() as Record<string, unknown>;
          const order = orderStubFromDoc(data);
          const status = order.status;
          if (isHistoryOrder(status)) {
            history += 1;
          }
          if (status !== "cancelled" && status !== "delivered") {
            const pickupDate = order.pickup.date;
            const window = isInPickupReminderWindow(pickupDate);
            const reminder = (data.opsReminder ?? {}) as { contacted?: boolean };
            if (window.match && !reminder.contacted) alertsTodo += 1;
          }
          if (isFuturePickupOrder(order)) {
            future += 1;
            continue;
          }
          if (
            isWaitingTodayOrder(order) ||
            isWashingOrder(order.status) ||
            isReadyForDelivery(order.status)
          ) {
            todayActive += 1;
          }
        }
        setOrdersCount(todayActive);
        setFutureCount(future);
        setHistoryCount(history);
        setReminderTodoCount(alertsTodo);
      },
      () => {
        /* permission/network blip — keep last counts */
      }
    );
    const unsubStaff = canManageStaff
      ? subscribePendingStaff((rows) => {
          setPendingStaffCount(rows.length);
        })
      : () => {
          setPendingStaffCount(0);
        };
    return () => {
      unsubContacts();
      unsubOrders();
      unsubStaff();
    };
  }, [allowed, canManageStaff]);

  useEffect(() => {
    setAlertsTodoCount(reminderTodoCount);
  }, [reminderTodoCount]);

  useEffect(() => {
    if (!allowed) return;
    void purgeExpiredOpsDataOncePerSession().catch(() => {
      /* retention is best-effort; do not block ops */
    });
    // Money-critical: heal any missing +7 weekly queues whenever ops opens.
    const key = "foam-weekly-reconcile-v1";
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {
      /* private mode */
    }
    void reconcileWeeklyQueues().catch(() => {
      /* reconcile is best-effort on boot; charge/deliver still retry */
    });
  }, [allowed]);

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
      if (authMode === "signup") {
        const result = await createUserWithEmailAndPassword(
          auth,
          email,
          password
        );
        if (name) {
          await updateProfile(result.user, { displayName: name });
        }
        const created = await ensureStaffProfile(result.user, "ops", {
          createIfMissing: true,
        });
        const allowedIn = await gateLoadedProfile(created, result.user.email);
        if (!allowedIn) return;
        setStaffProfile(created);
        setBannedAccess(false);
        setStaffReady(true);
      } else {
        const result = await signInWithEmailAndPassword(auth, email, password);
        const created = await ensureStaffProfile(result.user, "ops", {
          createIfMissing: true,
        });
        const allowedIn = await gateLoadedProfile(created, result.user.email);
        if (!allowedIn) return;
        setStaffProfile(created);
        setBannedAccess(false);
        setStaffReady(true);
      }
    } catch (err) {
      if (isStaffBannedError(err)) {
        setLoginError("This email is banned from OPS and Driver access.");
      } else {
      const code =
        err && typeof err === "object" && "code" in err
          ? String((err as { code: string }).code)
          : "";
      if (code === "auth/email-already-in-use") {
        setLoginError("Account already exists. Sign in instead.");
      } else if (code === "auth/weak-password") {
        setLoginError("Password must be at least 6 characters.");
      } else if (
        code === "auth/invalid-credential" ||
        code === "auth/wrong-password"
      ) {
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
      const googleUser = await signInWithGoogle();
      try {
        const created = await ensureStaffProfile(googleUser, "ops", {
          createIfMissing: true,
        });
        const allowedIn = await gateLoadedProfile(created, googleUser.email);
        if (!allowedIn) return;
        setStaffProfile(created);
        setBannedAccess(false);
        setStaffReady(true);
      } catch (error) {
        if (isStaffBannedError(error)) {
          setLoginError("This email is banned from OPS and Driver access.");
          void signOut(getFirebaseAuth());
          return;
        }
        // Parallel create may have already written the row — recover before giving up.
        const recovered = await ensureStaffProfile(googleUser, "ops", {
          createIfMissing: false,
        }).catch(() => null);
        if (recovered) {
          const allowedIn = await gateLoadedProfile(recovered, googleUser.email);
          if (!allowedIn) return;
          setStaffProfile(recovered);
          setBannedAccess(false);
          setStaffReady(true);
          return;
        }
        setLoginError(
          "Signed in, but could not create your access request. Try again."
        );
      }
    } catch (error) {
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

  function setDestination(next: AdminTab) {
    replaceQuery({
      tab: next === "orders" ? null : next,
      view: null,
      id: null,
      filter: null,
      section: null,
      day: null,
    });
  }

  const setMobileView = useCallback(
    (view: MobileView) => {
      if (view === "detail") {
        replaceQuery({ view: "detail" });
        return;
      }
      replaceQuery({ view: null, id: null });
    },
    [replaceQuery]
  );

  const consoleReady = Boolean(user && allowed && staffReady);
  const gateReady = !user || staffReady;

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
            <div className="ops-login-intro">
              <p className="ops-eyebrow">Staff operations</p>
              <h1 className="ops-login-title">
                {authMode === "signup" ? "Join the team." : "Good to see you."}
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
                  placeholder="name@foam.co"
                />
              </label>
              <label>
                Password
                <input
                  name="password"
                  type="password"
                  required
                  autoComplete={
                    authMode === "signup" ? "new-password" : "current-password"
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
                  New staff?{" "}
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
          </div>
        </section>

        {showLoginBrand ? (
          <section className="ops-login-brand">
            <div className="ops-login-brand-pattern" aria-hidden />
            <div className="ops-login-brand-top">
              <FoamMark rail />
              <small>OPS · LAS VEGAS</small>
            </div>
            <div className="ops-login-brand-art" aria-hidden>
              <span className="ops-login-brand-glow" />
              <span className="ops-login-bubble ops-login-bubble-a" />
              <span className="ops-login-bubble ops-login-bubble-b" />
              <span className="ops-login-bubble ops-login-bubble-c" />
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
                Every pickup.
                <br />
                Every detail.
                <br />
                Right on time.
              </p>
              <p className="ops-login-brand-sub">
                The calm, focused workspace behind FOAM’s Las Vegas service.
              </p>
            </div>
          </section>
        ) : null}
      </main>
      ) : !staffReady ? null : bannedAccess ? (
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
              <strong>{user.email}</strong> is blocked from OPS and Driver.
              Contact a FOAM admin if this is a mistake.
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
      ) : driverOnlyAccess ? (
      <main className="ops-login">
        <section className="ops-login-form-pane">
          <div className="ops-login-card">
            <FoamMark />
            <h1 className="ops-login-title">Driver access only</h1>
            <p className="ops-muted">
              This account is approved as a driver. Use the driver portal
              instead of OPS.
            </p>
            <Button
              type="button"
              size="lg"
              onClick={() => {
                window.location.href = "/driver";
              }}
            >
              Open driver portal
            </Button>
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
      ) : !allowed ? (
      null
      ) : (
      <OpsConsole
        user={user}
        tab={tab}
        mobileView={mobileView}
        setMobileView={setMobileView}
        setDestination={setDestination}
        openInquiriesCount={openInquiriesCount}
        alertsTodoCount={alertsTodoCount}
        pendingStaffCount={pendingStaffCount}
        setPendingStaffCount={setPendingStaffCount}
        canManageStaff={canManageStaff}
        setReminderTodoCount={setReminderTodoCount}
        ordersCount={ordersCount}
        futureCount={futureCount}
        historyCount={historyCount}
        accountMenuOpen={accountMenuOpen}
        setAccountMenuOpen={setAccountMenuOpen}
        accountMenuRef={accountMenuRef}
      />
      )}
    </OpsBootProvider>
  );
}

function OpsConsole({
  user,
  tab,
  mobileView,
  setMobileView,
  setDestination,
  openInquiriesCount,
  alertsTodoCount,
  pendingStaffCount,
  setPendingStaffCount,
  canManageStaff,
  setReminderTodoCount,
  ordersCount,
  futureCount,
  historyCount,
  accountMenuOpen,
  setAccountMenuOpen,
  accountMenuRef,
}: {
  user: User;
  tab: AdminTab;
  mobileView: MobileView;
  setMobileView: (view: MobileView) => void;
  setDestination: (next: AdminTab) => void;
  openInquiriesCount: number;
  alertsTodoCount: number;
  pendingStaffCount: number;
  setPendingStaffCount: (count: number) => void;
  canManageStaff: boolean;
  setReminderTodoCount: (count: number) => void;
  ordersCount: number;
  futureCount: number;
  historyCount: number;
  accountMenuOpen: boolean;
  setAccountMenuOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  accountMenuRef: RefObject<HTMLDivElement | null>;
}) {
  const avatar = initialsFromEmail(user.email);
  const [signOutConfirm, setSignOutConfirm] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (tab === "staff" && !canManageStaff) {
      setDestination("orders");
    }
  }, [tab, canManageStaff, setDestination]);

  useEffect(() => {
    if (!accountMenuOpen && !moreMenuOpen) setSignOutConfirm(false);
  }, [accountMenuOpen, moreMenuOpen]);

  useEffect(() => {
    if (!moreMenuOpen) return;

    let remove: (() => void) | undefined;
    const attachId = window.setTimeout(() => {
      function onPointerDown(event: PointerEvent) {
        const root = moreMenuRef.current;
        if (!root) return;
        const target = event.target;
        if (target instanceof Node && root.contains(target)) return;
        setMoreMenuOpen(false);
      }
      function onKey(event: KeyboardEvent) {
        if (event.key === "Escape") setMoreMenuOpen(false);
      }
      document.addEventListener("pointerdown", onPointerDown, true);
      document.addEventListener("keydown", onKey);
      remove = () => {
        document.removeEventListener("pointerdown", onPointerDown, true);
        document.removeEventListener("keydown", onKey);
      };
    }, 0);

    return () => {
      window.clearTimeout(attachId);
      remove?.();
    };
  }, [moreMenuOpen]);

  function goMore(next: AdminTab) {
    setMoreMenuOpen(false);
    setDestination(next);
  }

  const moreActive =
    tab === "history" ||
    (canManageStaff && tab === "staff") ||
    tab === "catalog" ||
    tab === "promos" ||
    tab === "pricing" ||
    tab === "schedule";

  return (
    <div className="ops-shell">
      <div className="ops-frame">
        <aside className="command-rail" aria-label="Ops sections">
          <div className="brand">
            <FoamMark rail />
            <small>OPS · LAS VEGAS</small>
          </div>

          <nav className="primary-nav">
            <button
              type="button"
              className={cn("nav-button", tab === "orders" && "active")}
              onClick={() => setDestination("orders")}
            >
              <Truck size={18} aria-hidden />
              <span>Orders</span>
              <b>{ordersCount}</b>
            </button>
            <button
              type="button"
              className={cn("nav-button", tab === "future" && "active")}
              onClick={() => setDestination("future")}
            >
              <CalendarDays size={18} aria-hidden />
              <span>Future</span>
              <b>{futureCount}</b>
            </button>
            <button
              type="button"
              className={cn(
                "nav-button",
                "is-rail-more",
                tab === "history" && "active"
              )}
              onClick={() => setDestination("history")}
            >
              <History size={18} aria-hidden />
              <span>History</span>
              <b>{historyCount}</b>
            </button>
            <button
              type="button"
              className={cn("nav-button", tab === "support" && "active")}
              onClick={() => setDestination("support")}
            >
              <Headphones size={18} aria-hidden />
              <span>Contact</span>
              <b>{openInquiriesCount}</b>
            </button>
            <button
              type="button"
              className={cn("nav-button", tab === "alerts" && "active")}
              onClick={() => setDestination("alerts")}
            >
              <Bell size={18} aria-hidden />
              <span>Notifications</span>
              <b>{alertsTodoCount}</b>
            </button>
            {canManageStaff ? (
              <button
                type="button"
                className={cn(
                  "nav-button",
                  "is-rail-more",
                  tab === "staff" && "active"
                )}
                onClick={() => setDestination("staff")}
              >
                <Users size={18} aria-hidden />
                <span>Staff</span>
                <b>{pendingStaffCount}</b>
              </button>
            ) : null}
            <button
              type="button"
              className={cn(
                "nav-button",
                "is-rail-more",
                tab === "catalog" && "active"
              )}
              onClick={() => setDestination("catalog")}
            >
              <Shirt size={18} aria-hidden />
              <span>Catalog</span>
            </button>
            <button
              type="button"
              className={cn(
                "nav-button",
                "is-rail-more",
                tab === "promos" && "active"
              )}
              onClick={() => setDestination("promos")}
            >
              <Ticket size={18} aria-hidden />
              <span>Promos</span>
            </button>
            <button
              type="button"
              className={cn(
                "nav-button",
                "is-rail-more",
                tab === "pricing" && "active"
              )}
              onClick={() => setDestination("pricing")}
            >
              <CircleDollarSign size={18} aria-hidden />
              <span>Pricing</span>
            </button>
            <button
              type="button"
              className={cn(
                "nav-button",
                "is-rail-more",
                tab === "schedule" && "active"
              )}
              onClick={() => setDestination("schedule")}
            >
              <Clock3 size={18} aria-hidden />
              <span>Schedule</span>
            </button>
          </nav>

          <div className="ops-more-wrap" ref={moreMenuRef}>
            <button
              type="button"
              className={cn("ops-more-trigger", moreActive && "is-active")}
              aria-label={moreMenuOpen ? "Close menu" : "Open menu"}
              aria-expanded={moreMenuOpen}
              onPointerDown={(event) => {
                event.stopPropagation();
              }}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setAccountMenuOpen(false);
                setMoreMenuOpen((open) => !open);
              }}
            >
              {moreMenuOpen ? (
                <X size={22} strokeWidth={2.25} aria-hidden />
              ) : (
                <Menu size={22} strokeWidth={2.25} aria-hidden />
              )}
            </button>

            {moreMenuOpen ? (
              <div className="ops-more-panel" role="menu">
                <button
                  type="button"
                  role="menuitem"
                  className={cn(
                    "ops-more-item",
                    tab === "history" && "is-active"
                  )}
                  onClick={() => goMore("history")}
                >
                  <History size={18} aria-hidden />
                  <span>History</span>
                  <b>{historyCount}</b>
                </button>
                {canManageStaff ? (
                  <button
                    type="button"
                    role="menuitem"
                    className={cn(
                      "ops-more-item",
                      tab === "staff" && "is-active"
                    )}
                    onClick={() => goMore("staff")}
                  >
                    <Users size={18} aria-hidden />
                    <span>Staff</span>
                    <b>{pendingStaffCount}</b>
                  </button>
                ) : null}
                <button
                  type="button"
                  role="menuitem"
                  className={cn(
                    "ops-more-item",
                    tab === "catalog" && "is-active"
                  )}
                  onClick={() => goMore("catalog")}
                >
                  <Shirt size={18} aria-hidden />
                  <span>Catalog</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className={cn(
                    "ops-more-item",
                    tab === "promos" && "is-active"
                  )}
                  onClick={() => goMore("promos")}
                >
                  <Ticket size={18} aria-hidden />
                  <span>Promos</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className={cn(
                    "ops-more-item",
                    tab === "pricing" && "is-active"
                  )}
                  onClick={() => goMore("pricing")}
                >
                  <CircleDollarSign size={18} aria-hidden />
                  <span>Pricing</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className={cn(
                    "ops-more-item",
                    tab === "schedule" && "is-active"
                  )}
                  onClick={() => goMore("schedule")}
                >
                  <Clock3 size={18} aria-hidden />
                  <span>Schedule</span>
                </button>

                <div className="ops-more-sep" role="separator" />

                <div className="ops-more-account">
                  <strong>Operations</strong>
                  <span>{user.email}</span>
                </div>
                {signOutConfirm ? (
                  <div className="ops-more-signout-confirm">
                    <strong>Are you sure?</strong>
                    <div className="ops-more-signout-actions">
                      <button
                        type="button"
                        className="ops-more-signout-btn is-cancel"
                        onClick={() => setSignOutConfirm(false)}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="ops-more-signout-btn is-confirm"
                        onClick={() => {
                          setMoreMenuOpen(false);
                          void signOut(getFirebaseAuth());
                        }}
                      >
                        <LogOut size={14} aria-hidden />
                        Sign out
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    role="menuitem"
                    className="ops-more-item is-danger"
                    onClick={() => setSignOutConfirm(true)}
                  >
                    <LogOut size={18} aria-hidden />
                    <span>Sign out</span>
                  </button>
                )}
              </div>
            ) : null}
          </div>

          <div className="rail-status">
            <span className="status-light" />
            <div>
              <strong>FOAM Ops</strong>
              <small>Las Vegas workspace</small>
            </div>
          </div>

          <div className="account-wrap" ref={accountMenuRef}>
            {accountMenuOpen ? (
              <div className="account-menu" role="menu">
                {signOutConfirm ? (
                  <div className="account-menu-confirm">
                    <strong>Are you sure?</strong>
                    <div className="account-menu-actions">
                      <button
                        type="button"
                        className="account-menu-action-btn is-cancel"
                        role="menuitem"
                        onClick={() => setSignOutConfirm(false)}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="account-menu-action-btn is-confirm"
                        role="menuitem"
                        onClick={() => {
                          setAccountMenuOpen(false);
                          void signOut(getFirebaseAuth());
                        }}
                      >
                        <LogOut size={14} aria-hidden />
                        Sign out
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="account-menu-home">
                    <strong>Operations</strong>
                    <span>{user.email}</span>
                    <button
                      type="button"
                      className="account-menu-action-btn is-confirm"
                      role="menuitem"
                      onClick={() => setSignOutConfirm(true)}
                    >
                      <LogOut size={14} aria-hidden />
                      Sign out
                    </button>
                  </div>
                )}
              </div>
            ) : null}
            <button
              type="button"
              className="account-button"
              aria-label="Account menu"
              aria-expanded={accountMenuOpen}
              aria-haspopup="menu"
              onClick={() => {
                setMoreMenuOpen(false);
                setAccountMenuOpen((open) => !open);
              }}
            >
              <span className="avatar">{avatar}</span>
              <span className="account-copy">
                <strong>Operations</strong>
                <small>Admin team</small>
              </span>
              <ChevronDown size={15} />
            </button>
          </div>
        </aside>

        <div
          className={cn(
            "ops-panel",
            mobileView === "detail" && "is-detail-open"
          )}
        >
            {tab === "orders" || tab === "future" || tab === "history" ? (
              <AdminOrdersPanel
                key={tab}
                mode={
                  tab === "future"
                    ? "future"
                    : tab === "history"
                      ? "history"
                      : "today"
                }
                adminEmail={user.email ?? ""}
                mobileView={mobileView}
                onMobileViewChange={setMobileView}
              />
            ) : tab === "alerts" ? (
              <AdminAlertsPanel
                adminEmail={user.email ?? ""}
                mobileView={mobileView}
                onMobileViewChange={setMobileView}
                onTodoCountChange={setReminderTodoCount}
              />
            ) : tab === "staff" && canManageStaff ? (
              <AdminStaffPanel
                adminEmail={user.email ?? ""}
                onPendingCountChange={setPendingStaffCount}
              />
            ) : tab === "catalog" ? (
              <AdminCatalogPanel
                adminEmail={user.email ?? ""}
                mobileView={mobileView}
                onMobileViewChange={setMobileView}
              />
            ) : tab === "promos" ? (
              <AdminPromosPanel
                adminEmail={user.email ?? ""}
                mobileView={mobileView}
                onMobileViewChange={setMobileView}
              />
            ) : tab === "pricing" ? (
              <AdminPricingPanel
                adminEmail={user.email ?? ""}
                mobileView={mobileView}
                onMobileViewChange={setMobileView}
              />
            ) : tab === "schedule" ? (
              <AdminSchedulePanel
                adminEmail={user.email ?? ""}
                mobileView={mobileView}
                onMobileViewChange={setMobileView}
              />
            ) : (
              <AdminContactsPanel
                adminEmail={user.email ?? ""}
                mobileView={mobileView}
                onMobileViewChange={setMobileView}
              />
            )}
        </div>
      </div>
    </div>
  );
}
