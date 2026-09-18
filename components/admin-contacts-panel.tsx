"use client";

import { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  type Timestamp,
} from "firebase/firestore";
import { Mail, Phone } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getFirebaseDb } from "@/lib/firebase";
import { cn } from "@/lib/utils";

type ContactRow = {
  id: string;
  name: string;
  email: string;
  phone: string;
  topic: string;
  message: string;
  status: "new" | "done";
  read: boolean;
  csNotes: string;
  createdAt: Timestamp | null;
};

type InboxFilter = "open" | "done" | "cs" | "all";

function formatDate(value: Timestamp | null) {
  if (!value) return "Just now";
  return value.toDate().toLocaleString();
}

function isCsTopic(topic: string) {
  const t = topic.toLowerCase();
  return (
    t.includes("cancel") ||
    t.includes("refund") ||
    t.includes("billing") ||
    t.includes("complaint") ||
    t.includes("change pickup") ||
    t.includes("quality")
  );
}

export function AdminContactsPanel() {
  const [rows, setRows] = useState<ContactRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<InboxFilter>("open");
  const [csNotes, setCsNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [okMsg, setOkMsg] = useState("");
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
            csNotes: String(data.csNotes ?? ""),
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

  const counts = useMemo(
    () => ({
      open: rows.filter((r) => r.status !== "done").length,
      done: rows.filter((r) => r.status === "done").length,
      cs: rows.filter((r) => isCsTopic(r.topic)).length,
      all: rows.length,
    }),
    [rows]
  );

  const filtered = useMemo(() => {
    return rows.filter((row) => {
      if (filter === "open" && row.status === "done") return false;
      if (filter === "done" && row.status !== "done") return false;
      if (filter === "cs" && !isCsTopic(row.topic)) return false;
      return true;
    });
  }, [rows, filter]);

  const selected = rows.find((row) => row.id === selectedId) ?? null;

  useEffect(() => {
    if (!selected) {
      setCsNotes("");
      return;
    }
    setCsNotes(selected.csNotes ?? "");
    setOkMsg("");
  }, [selected?.id]); // eslint-disable-line react-hooks/exhaustive-deps

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

  async function saveCsNotes() {
    if (!selected) return;
    setSaving(true);
    setError("");
    setOkMsg("");
    try {
      await updateDoc(doc(getFirebaseDb(), "contactMessages", selected.id), {
        csNotes: csNotes.trim(),
        read: true,
      });
      setOkMsg("Saved.");
    } catch {
      setError("Could not save notes.");
    } finally {
      setSaving(false);
    }
  }

  function replyMailto(row: ContactRow) {
    const subject = encodeURIComponent(`Re: FOAM — ${row.topic}`);
    const body = encodeURIComponent(
      `Hi ${row.name.split(" ")[0] || "there"},\n\nThanks for reaching out about "${row.topic}".\n\n\n\n— FOAM Laundry\n`
    );
    return `mailto:${row.email}?subject=${subject}&body=${body}`;
  }

  return (
    <div className="admin-layout">
      <aside className="admin-list">
        <div className="admin-list-tools">
          <select
            className="admin-filter-select"
            value={filter}
            onChange={(e) => setFilter(e.target.value as InboxFilter)}
            aria-label="Filter inbox"
          >
            <option value="open">Open ({counts.open})</option>
            <option value="cs">Cancel / refund ({counts.cs})</option>
            <option value="done">Done ({counts.done})</option>
            <option value="all">All ({counts.all})</option>
          </select>
        </div>

        {error ? <p className="admin-error">{error}</p> : null}

        {filtered.length === 0 ? (
          <p className="admin-muted">No messages.</p>
        ) : (
          filtered.map((row) => (
            <button
              key={row.id}
              type="button"
              className={cn(
                "admin-list-item",
                selectedId === row.id && "is-active",
                !row.read && "is-unread",
                isCsTopic(row.topic) && row.status !== "done" && "has-issue"
              )}
              onClick={() => void selectRow(row)}
            >
              <span className="admin-list-name">{row.name}</span>
              <span className="admin-list-meta">{row.topic}</span>
              <span
                className={cn(
                  "admin-pill",
                  row.status === "done" && "is-done"
                )}
              >
                {row.status === "done" ? "Done" : "Open"}
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
            <div className="admin-detail-head">
              <div>
                <h2>{selected.name}</h2>
                <p className="admin-detail-sub">
                  {selected.topic} · {formatDate(selected.createdAt)}
                </p>
              </div>
              <div className="admin-icon-row">
                <a
                  className="admin-icon-btn"
                  href={replyMailto(selected)}
                  aria-label="Reply by email"
                >
                  <Mail size={16} />
                </a>
                {selected.phone ? (
                  <a
                    className="admin-icon-btn"
                    href={`tel:${selected.phone}`}
                    aria-label="Call"
                  >
                    <Phone size={16} />
                  </a>
                ) : null}
                <Button
                  type="button"
                  size="sm"
                  variant={selected.status === "done" ? "outline" : "default"}
                  onClick={() => void toggleDone(selected)}
                >
                  {selected.status === "done" ? "Reopen" : "Done"}
                </Button>
              </div>
            </div>

            {(okMsg || error) && (
              <p className={error ? "admin-error" : "admin-ok"}>
                {error || okMsg}
              </p>
            )}

            <div className="admin-pane">
              <p className="admin-message-body">{selected.message}</p>

              <dl className="admin-kv">
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
              </dl>

              <label className="admin-field">
                Notes
                <textarea
                  rows={3}
                  value={csNotes}
                  onChange={(e) => setCsNotes(e.target.value)}
                  placeholder="Reply summary, linked order…"
                />
              </label>
              <Button
                type="button"
                variant="outline"
                disabled={saving}
                onClick={() => void saveCsNotes()}
              >
                Save notes
              </Button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
