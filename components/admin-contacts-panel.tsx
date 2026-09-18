"use client";

import { useEffect, useState } from "react";
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  type Timestamp,
} from "firebase/firestore";

import { Button } from "@/components/ui/button";
import { getFirebaseDb } from "@/lib/firebase";

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

export function AdminContactsPanel() {
  const [rows, setRows] = useState<ContactRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
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
        setError("");
      },
      () => {
        setError("Could not load messages. Check admin permissions.");
      }
    );
  }, []);

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

  const selected = rows.find((row) => row.id === selectedId) ?? null;
  const unread = rows.filter((r) => !r.read).length;

  return (
    <div className="admin-layout">
      <aside className="admin-list">
        {error ? <p className="admin-error">{error}</p> : null}
        {unread > 0 ? (
          <p className="admin-muted">{unread} unread</p>
        ) : null}
        {rows.length === 0 ? (
          <p className="admin-muted">No messages yet.</p>
        ) : (
          rows.map((row) => (
            <button
              key={row.id}
              type="button"
              className={`admin-list-item${selectedId === row.id ? " is-active" : ""}${!row.read ? " is-unread" : ""}`}
              onClick={() => void selectRow(row)}
            >
              <span className="admin-list-name">{row.name}</span>
              <span className="admin-list-meta">
                {row.topic} · {formatDate(row.createdAt)}
              </span>
              <span
                className={`admin-pill${row.status === "done" ? " is-done" : ""}`}
              >
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
                onClick={() => void toggleDone(selected)}
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
  );
}
