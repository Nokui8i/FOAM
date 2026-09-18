"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type User,
} from "firebase/auth";
import { LogOut, MessageSquare, Package } from "lucide-react";

import { AdminContactsPanel } from "@/components/admin-contacts-panel";
import { AdminOrdersPanel } from "@/components/admin-orders-panel";
import { Button } from "@/components/ui/button";
import { getFirebaseAuth } from "@/lib/firebase";
import { isAdminEmail } from "@/lib/site-config";
import { cn } from "@/lib/utils";

type AdminTab = "orders" | "contacts";

export function AdminApp() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);
  const [tab, setTab] = useState<AdminTab>("orders");

  const allowed = isAdminEmail(user?.email);

  useEffect(() => {
    const auth = getFirebaseAuth();
    return onAuthStateChanged(auth, (next) => {
      setUser(next);
      setAuthReady(true);
    });
  }, []);

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
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(getFirebaseAuth(), provider);
      if (!isAdminEmail(result.user.email)) {
        await signOut(getFirebaseAuth());
        setLoginError("This Google account is not allowed to access admin.");
      }
    } catch {
      setLoginError(
        "Google sign-in failed. Enable Google in Firebase Authentication first."
      );
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
        <p className="admin-muted">
          Orders, weigh-ins, and Contact Us — sign in on phone or desktop.
        </p>

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
      <header className="admin-top">
        <div>
          <p className="admin-eyebrow">FOAM Ops</p>
          <h1 className="admin-title">
            {tab === "orders" ? "Orders" : "Contact Us"}
          </h1>
          <p className="admin-muted">{user.email}</p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => void signOut(getFirebaseAuth())}
        >
          <LogOut /> Sign out
        </Button>
      </header>

      <nav className="admin-tabs" aria-label="Admin sections">
        <button
          type="button"
          className={cn("admin-tab", tab === "orders" && "is-active")}
          onClick={() => setTab("orders")}
        >
          <Package size={16} aria-hidden />
          Orders
        </button>
        <button
          type="button"
          className={cn("admin-tab", tab === "contacts" && "is-active")}
          onClick={() => setTab("contacts")}
        >
          <MessageSquare size={16} aria-hidden />
          Contacts
        </button>
      </nav>

      {tab === "orders" ? (
        <AdminOrdersPanel adminEmail={user.email ?? ""} />
      ) : (
        <AdminContactsPanel />
      )}
    </div>
  );
}
