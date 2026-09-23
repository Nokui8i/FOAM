"use client";

import { useEffect, useRef, useState, Suspense, type FormEvent } from "react";
import {
  GoogleAuthProvider,
  getRedirectResult,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type User,
} from "firebase/auth";
import { collection, onSnapshot } from "firebase/firestore";
import {
  CalendarDays,
  ChevronDown,
  Headphones,
  LogOut,
  Truck,
} from "lucide-react";

import { AdminContactsPanel } from "@/components/admin-contacts-panel";
import { AdminOrdersPanel } from "@/components/admin-orders-panel";
import { Button } from "@/components/ui/button";
import { getFirebaseAuth, getFirebaseDb } from "@/lib/firebase";
import { purgeExpiredOpsDataOncePerSession } from "@/lib/data-retention";
import {
  isFuturePickupOrder,
  isReadyForDelivery,
  isWaitingTodayOrder,
  isWashingOrder,
  normalizeOrderStatus,
  type FoamOrder,
} from "@/lib/orders";
import { isAdminEmail } from "@/lib/site-config";
import { useQueryReplace } from "@/lib/use-query-replace";
import { cn } from "@/lib/utils";

type AdminTab = "orders" | "future" | "support";
type MobileView = "list" | "detail";

const TAB_FROM_PARAM: Record<string, AdminTab> = {
  orders: "orders",
  future: "future",
  support: "support",
  contacts: "support",
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
  if (rail) {
    return (
      <div className="ops-rail-mark" aria-label="FOAM">
        FOAM<span className="ops-rail-mark-dot" aria-hidden="true" />
      </div>
    );
  }

  return (
    <div
      className={cn("ops-wordmark", compact && "is-compact")}
      aria-label="FOAM"
    >
      F
      <span className="ops-wordmark-o" aria-hidden="true">
        <span className="ops-wordmark-bubbles">
          <i />
          <i />
          <i />
        </span>
        O
      </span>
      AM.
    </div>
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
    <Suspense fallback={<p className="ops-muted ops-loading">Loading…</p>}>
      <AdminAppInner />
    </Suspense>
  );
}

function AdminAppInner() {
  const { searchParams, replaceQuery } = useQueryReplace();
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);
  const tab = parseAdminTab(searchParams.get("tab"));
  const mobileView: MobileView =
    searchParams.get("view") === "detail" ? "detail" : "list";
  const [openInquiriesCount, setOpenInquiriesCount] = useState(0);
  const [ordersCount, setOrdersCount] = useState(0);
  const [futureCount, setFutureCount] = useState(0);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement>(null);

  const allowed = isAdminEmail(user?.email);

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
    const auth = getFirebaseAuth();
    void getRedirectResult(auth)
      .then(async (result) => {
        if (!result) return;
        if (!isAdminEmail(result.user.email)) {
          await signOut(auth);
          setLoginError("This Google account is not allowed to access admin.");
        }
      })
      .catch(() => {
        /* ignore stray redirect errors */
      });

    return onAuthStateChanged(auth, (next) => {
      setUser(next);
      setAuthReady(true);
    });
  }, []);

  useEffect(() => {
    if (!allowed) return;
    const db = getFirebaseDb();
    const unsubContacts = onSnapshot(collection(db, "contactMessages"), (snap) => {
      const open = snap.docs.filter((d) => d.data().status !== "done").length;
      setOpenInquiriesCount(open);
    });
    const unsubOrders = onSnapshot(collection(db, "orders"), (snap) => {
      let todayActive = 0;
      let future = 0;
      for (const docSnap of snap.docs) {
        const order = orderStubFromDoc(docSnap.data() as Record<string, unknown>);
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
    });
    return () => {
      unsubContacts();
      unsubOrders();
    };
  }, [allowed]);

  useEffect(() => {
    if (!allowed) return;
    void purgeExpiredOpsDataOncePerSession().catch(() => {
      /* retention is best-effort; do not block ops */
    });
  }, [allowed]);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoggingIn(true);
    setLoginError("");
    const data = new FormData(event.currentTarget);
    const email = String(data.get("email") ?? "");
    const password = String(data.get("password") ?? "");

    try {
      const result = await signInWithEmailAndPassword(
        getFirebaseAuth(),
        email,
        password
      );
      if (!isAdminEmail(result.user.email)) {
        await signOut(getFirebaseAuth());
        setLoginError("This account is not allowed to access admin.");
      }
    } catch {
      setLoginError("Login failed. Check email and password.");
    } finally {
      setLoggingIn(false);
    }
  }

  async function handleGoogleLogin() {
    setLoggingIn(true);
    setLoginError("");
    const auth = getFirebaseAuth();
    const provider = new GoogleAuthProvider();
    try {
      const result = await signInWithPopup(auth, provider);
      if (!isAdminEmail(result.user.email)) {
        await signOut(auth);
        setLoginError("This Google account is not allowed to access admin.");
      }
    } catch {
      try {
        await signInWithRedirect(auth, provider);
        return;
      } catch {
        setLoginError(
          "Google sign-in failed. Enable Google in Firebase Authentication first."
        );
      }
    } finally {
      setLoggingIn(false);
    }
  }

  function setDestination(next: AdminTab) {
    replaceQuery({
      tab: next === "orders" ? null : next,
      view: null,
      id: null,
      filter: null,
    });
  }

  function setMobileView(view: MobileView) {
    replaceQuery({ view: view === "detail" ? "detail" : null });
  }

  if (!authReady) {
    return <p className="ops-muted ops-loading">Loading…</p>;
  }

  if (!user) {
    return (
      <main className="ops-login">
        <section className="ops-login-form-pane">
          <div className="ops-login-card">
            <FoamMark />
            <div className="ops-login-intro">
              <p className="ops-eyebrow">Staff operations</p>
              <h1 className="ops-login-title">Good to see you.</h1>
              <p className="ops-muted">
                Sign in to manage pickups, plant workflow, deliveries, and
                customer support.
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
              <span className="ops-google-badge" aria-hidden>
                G
              </span>
              Continue with Google
            </Button>

            <div className="ops-login-divider">
              <span>or use email</span>
            </div>

            <form className="ops-login-fields" onSubmit={handleLogin}>
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
                  autoComplete="current-password"
                  placeholder="Enter your password"
                />
              </label>
              {loginError ? <p className="ops-error">{loginError}</p> : null}
              <Button type="submit" size="lg" disabled={loggingIn}>
                {loggingIn ? "Signing in…" : "Sign in"}
              </Button>
            </form>

            <p className="ops-login-foot">
              Private console for authorized FOAM staff.
            </p>
          </div>
        </section>

        <section className="ops-login-brand" aria-hidden>
          <div className="ops-login-brand-pattern" />
          <div className="ops-login-brand-ring" />
          <div className="ops-login-brand-copy">
            <div className="ops-login-dots">
              <span />
              <span />
              <span />
            </div>
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
      </main>
    );
  }

  if (!allowed) {
    return (
      <main className="ops-login">
        <section className="ops-login-form-pane">
          <div className="ops-login-card">
            <FoamMark />
            <h1 className="ops-login-title">Access denied</h1>
            <p className="ops-muted">
              Signed in as {user.email}, but this account is not an admin.
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
    );
  }

  const avatar = initialsFromEmail(user.email);

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
              className={cn("nav-button", tab === "support" && "active")}
              onClick={() => setDestination("support")}
            >
              <Headphones size={18} aria-hidden />
              <span>Support</span>
              <b>{openInquiriesCount}</b>
            </button>
          </nav>

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
                <strong>Operations</strong>
                <span>{user.email}</span>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setAccountMenuOpen(false);
                    void signOut(getFirebaseAuth());
                  }}
                >
                  <LogOut size={15} aria-hidden />
                  Sign out
                </button>
              </div>
            ) : null}
            <button
              type="button"
              className="account-button"
              aria-label="Account menu"
              aria-expanded={accountMenuOpen}
              aria-haspopup="menu"
              onClick={() => setAccountMenuOpen((open) => !open)}
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
            {tab === "orders" || tab === "future" ? (
              <AdminOrdersPanel
                key={tab}
                mode={tab === "future" ? "future" : "today"}
                adminEmail={user.email ?? ""}
                mobileView={mobileView}
                onMobileViewChange={setMobileView}
              />
            ) : (
              <AdminContactsPanel
                mobileView={mobileView}
                onMobileViewChange={setMobileView}
              />
            )}
        </div>
      </div>
    </div>
  );
}
