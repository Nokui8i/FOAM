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
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  type Timestamp,
} from "firebase/firestore";
import { LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getFirebaseAuth, getFirebaseDb } from "@/lib/firebase";
import { isAdminEmail } from "@/lib/site-config";

type ContactRow = {
  id: string;
  name: string;
  email: string;
  phone: string;
  topic: string;
  message: string;
  status: "new" | "done";
  read: boolean;
  createdAt: Timestamp | null;
};

function formatDate(value: Timestamp | null) {
  if (!value) return "Just now";
  return value.toDate().toLocaleString();
}

export function AdminContactsApp() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [rows, setRows] = useState<ContactRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loginError, setLoginError] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);

  const allowed = isAdminEmail(user?.email);

  useEffect(() => {
    const auth = getFirebaseAuth();
    return onAuthStateChanged(auth, (next) => {
      setUser(next);
      setAuthReady(true);
    });
  }, []);

  useEffect(() => {
    if (!user || !isAdminEmail(user.email)) {
      setRows([]);
      setSelectedId(null);
      return;
    }

    const db = getFirebaseDb();
    const q = query(
      collection(db, "contactMessages"),
      orderBy("createdAt", "desc")
    );

    return onSnapshot(
      q,
      (snap) => {
        const next = snap.docs.map((item) => {
          const data = item.data();
          return {
            id: item.id,
            name: String(data.name ?? ""),
            email: String(data.email ?? ""),
            phone: String(data.phone ?? ""),
            topic: String(data.topic ?? ""),
            message: String(data.message ?? ""),
            status: data.status === "done" ? "done" : "new",
            read: Boolean(data.read),
            createdAt: (data.createdAt as Timestamp | null) ?? null,
          } satisfies ContactRow;
        });
        setRows(next);
        setSelectedId((current) => current ?? next[0]?.id ?? null);
      },
      () => {
        setLoginError("Could not load messages. Check admin permissions.");
      }
    );
  }, [user]);

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

  async function markRead(id: string) {
    await updateDoc(doc(getFirebaseDb(), "contactMessages", id), {
      read: true,
    });
  }

  async function toggleDone(row: ContactRow) {
    await updateDoc(doc(getFirebaseDb(), "contactMessages", row.id), {
      status: row.status === "done" ? "new" : "done",
      read: true,
    });
  }

  async function selectRow(row: ContactRow) {
    setSelectedId(row.id);
    if (!row.read) {
      await markRead(row.id);
    }
  }

  if (!authReady) {
    return <p className="admin-muted">Loading...</p>;
  }

  if (!user) {
    return (
      <div className="admin-login">
        <h1 className="admin-title">FOAM Admin</h1>
        <p className="admin-muted">Sign in to view Contact Us messages.</p>

        <Button
          type="button"
          size="lg"
          variant="outline"
          disabled={loggingIn}
          onClick={handleGoogleLogin}
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
        <Button type="button" variant="outline" onClick={() => signOut(getFirebaseAuth())}>
          Sign out
        </Button>
      </div>
    );
  }

  const selected = rows.find((row) => row.id === selectedId) ?? null;

  return (
    <div className="admin-shell">
      <header className="admin-top">
        <div>
          <p className="admin-eyebrow">Admin</p>
          <h1 className="admin-title">Contact Us</h1>
          <p className="admin-muted">{user.email}</p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => signOut(getFirebaseAuth())}
        >
          <LogOut /> Sign out
        </Button>
      </header>

      <div className="admin-layout">
        <aside className="admin-list">
          {rows.length === 0 ? (
            <p className="admin-muted">No messages yet.</p>
          ) : (
            rows.map((row) => (
              <button
                key={row.id}
                type="button"
                className={`admin-list-item${selectedId === row.id ? " is-active" : ""}${!row.read ? " is-unread" : ""}`}
                onClick={() => selectRow(row)}
              >
                <span className="admin-list-name">{row.name}</span>
                <span className="admin-list-meta">
                  {row.topic} · {formatDate(row.createdAt)}
                </span>
                <span className={`admin-pill${row.status === "done" ? " is-done" : ""}`}>
                  {row.status === "done" ? "Done" : "New"}
                </span>
              </button>
            ))
          )}
        </aside>

        <section className="admin-detail">
          {!selected ? (
            <p className="admin-muted">Select a message.</p>
          ) : (
            <>
              <div className="admin-detail-top">
                <div>
                  <h2>{selected.name}</h2>
                  <p className="admin-muted">{formatDate(selected.createdAt)}</p>
                </div>
                <Button
                  type="button"
                  variant={selected.status === "done" ? "outline" : "default"}
                  onClick={() => toggleDone(selected)}
                >
                  {selected.status === "done" ? "Mark as new" : "Mark as done"}
                </Button>
              </div>

              <dl className="admin-fields">
                <div>
                  <dt>Email</dt>
                  <dd>
                    <a href={`mailto:${selected.email}`}>{selected.email}</a>
                  </dd>
                </div>
                {selected.phone ? (
                  <div>
                    <dt>Phone</dt>
                    <dd>
                      <a href={`tel:${selected.phone}`}>{selected.phone}</a>
                    </dd>
                  </div>
                ) : null}
                <div>
                  <dt>Topic</dt>
                  <dd>{selected.topic}</dd>
                </div>
              </dl>

              <div className="admin-message">
                <p className="admin-message-label">Message</p>
                <p>{selected.message}</p>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
