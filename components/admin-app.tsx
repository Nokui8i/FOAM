"use client";

import { useEffect, useState, type FormEvent } from "react";
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
import { Inbox, LogOut, Truck } from "lucide-react";

import { AdminContactsPanel } from "@/components/admin-contacts-panel";
import { AdminOrdersPanel } from "@/components/admin-orders-panel";
import { Button } from "@/components/ui/button";
import { getFirebaseAuth, getFirebaseDb } from "@/lib/firebase";
import { purgeExpiredOpsDataOncePerSession } from "@/lib/data-retention";
import { isAdminEmail } from "@/lib/site-config";
import { cn } from "@/lib/utils";

type AdminTab = "orders" | "contacts";
type MobileView = "list" | "detail";

function FoamMark({ compact = false }: { compact?: boolean }) {
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
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);
  const [tab, setTab] = useState<AdminTab>("orders");
  const [mobileView, setMobileView] = useState<MobileView>("list");
  const [openInquiriesCount, setOpenInquiriesCount] = useState(0);
  const [ordersCount, setOrdersCount] = useState(0);

  const allowed = isAdminEmail(user?.email);

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
      setOrdersCount(
        snap.docs.filter((d) => d.data().status !== "cancelled").length
      );
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
    setTab(next);
    setMobileView("list");
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
                customer inquiries.
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
      <aside className="ops-nav" aria-label="Ops sections">
        <div className="ops-nav-brand">
          <FoamMark compact />
        </div>

        <nav className="ops-nav-links">
          <button
            type="button"
            className={cn("ops-nav-btn", tab === "orders" && "is-active")}
            onClick={() => setDestination("orders")}
          >
            <Truck size={20} aria-hidden />
            <span>Orders</span>
            {ordersCount > 0 ? (
              <span className="ops-nav-badge">{ordersCount}</span>
            ) : null}
          </button>
          <button
            type="button"
            className={cn("ops-nav-btn", tab === "contacts" && "is-active")}
            onClick={() => setDestination("contacts")}
          >
            <Inbox size={20} aria-hidden />
            <span>Inquiries</span>
            {openInquiriesCount > 0 ? (
              <span className="ops-nav-badge">{openInquiriesCount}</span>
            ) : null}
          </button>
        </nav>

        <div className="ops-nav-foot">
          <button
            type="button"
            className="ops-nav-avatar"
            title={`Sign out · ${user.email ?? ""}`}
            aria-label="Sign out"
            onClick={() => void signOut(getFirebaseAuth())}
          >
            {avatar}
          </button>
        </div>
      </aside>

      <div className="ops-workspace">
        <header className="ops-topbar">
          <div className="ops-topbar-mobile-brand">
            <FoamMark compact />
          </div>
          <div className="ops-topbar-end">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="ops-topbar-signout-mobile"
              onClick={() => void signOut(getFirebaseAuth())}
            >
              <LogOut size={16} />
            </Button>
            <span className="ops-avatar" aria-hidden>
              {avatar}
            </span>
          </div>
        </header>

        <main className="ops-main">
          <div
            className={cn(
              "ops-panel",
              mobileView === "detail" && "is-detail-open"
            )}
          >
            {tab === "orders" ? (
              <AdminOrdersPanel
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
        </main>
      </div>
    </div>
  );
}
