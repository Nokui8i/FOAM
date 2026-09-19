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
import { LogOut, MessageCircle, Package } from "lucide-react";

import { AdminContactsPanel } from "@/components/admin-contacts-panel";
import { AdminOrdersPanel } from "@/components/admin-orders-panel";
import { Button } from "@/components/ui/button";
import { getFirebaseAuth, getFirebaseDb } from "@/lib/firebase";
import { isAdminEmail } from "@/lib/site-config";
import { cn } from "@/lib/utils";

type AdminTab = "orders" | "contacts";

export function AdminApp() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);
  const [tab, setTab] = useState<AdminTab>("orders");
  const [openInquiriesCount, setOpenInquiriesCount] = useState(0);

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
    return onSnapshot(collection(db, "contactMessages"), (snap) => {
      const open = snap.docs.filter((d) => d.data().status !== "done").length;
      setOpenInquiriesCount(open);
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

  if (!authReady) {
    return <p className="admin-muted">Loading...</p>;
  }

  if (!user) {
    return (
      <div className="admin-login">
        <h1 className="admin-title">FOAM Ops</h1>
        <p className="admin-muted">Sign in to manage orders and inbox.</p>

        <Button
          type="button"
          size="lg"
          variant="outline"
          disabled={loggingIn}
          onClick={() => void handleGoogleLogin()}
        >
          Continue with Google
        </Button>

        <div className="admin-login-divider">
          <span>or email</span>
        </div>

        <form className="admin-login-form" onSubmit={handleLogin}>
          <label>
            Email
            <input name="email" type="email" required autoComplete="username" />
          </label>
          <label>
            Password
            <input
              name="password"
              type="password"
              required
              autoComplete="current-password"
            />
          </label>
          {loginError ? <p className="admin-error">{loginError}</p> : null}
          <Button type="submit" size="lg" disabled={loggingIn}>
            {loggingIn ? "Signing in..." : "Sign in"}
          </Button>
        </form>
      </div>
    );
  }

  if (!allowed) {
    return (
      <div className="admin-login">
        <h1 className="admin-title">Access denied</h1>
        <p className="admin-muted">
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
    );
  }

  return (
    <div className="admin-shell">
      <header className="admin-bar">
        <div className="admin-bar-brand">
          <span className="admin-bar-mark">FOAM</span>
        </div>
        <div className="admin-bar-end">
          <span className="admin-bar-email">{user.email}</span>
          <button
            type="button"
            className="admin-bar-icon"
            aria-label="Sign out"
            onClick={() => void signOut(getFirebaseAuth())}
          >
            <LogOut size={16} />
          </button>
        </div>
      </header>

      <div className="admin-shell-body">
        <nav className="admin-rail" aria-label="Ops sections">
          <button
            type="button"
            className={cn("admin-rail-btn", tab === "orders" && "is-active")}
            onClick={() => setTab("orders")}
          >
            <Package size={18} aria-hidden />
            Orders
          </button>
          <button
            type="button"
            className={cn("admin-rail-btn", tab === "contacts" && "is-active")}
            onClick={() => setTab("contacts")}
          >
            <MessageCircle size={18} aria-hidden />
            Inquiries
            {openInquiriesCount > 0 ? (
              <span className="admin-rail-badge">{openInquiriesCount}</span>
            ) : null}
          </button>
        </nav>

        <div className="admin-main">
          {tab === "orders" ? (
            <AdminOrdersPanel adminEmail={user.email ?? ""} />
          ) : (
            <AdminContactsPanel />
          )}
        </div>
      </div>
    </div>
  );
}
