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
import { Mail, MessageCircle, Phone } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getFirebaseDb } from "@/lib/firebase";
import { BUSINESS_WHATSAPP } from "@/lib/site-config";
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
  createdAt: Timestamp | null;
};

type InboxFilter = "open" | "done" | "all";

function formatDate(value: Timestamp | null) {
  if (!value) return "Just now";
  return value.toDate().toLocaleString();
}

function waUrl(phone: string, body: string) {
  const digits = phone.replace(/\D/g, "");
  const to = digits || BUSINESS_WHATSAPP;
  return `https://wa.me/${to}?text=${encodeURIComponent(body)}`;
}

export function AdminContactsPanel() {
  const [rows, setRows] = useState<ContactRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<InboxFilter>("open");
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

  const counts = useMemo(
    () => ({
      open: rows.filter((r) => r.status !== "done").length,
      done: rows.filter((r) => r.status === "done").length,
      all: rows.length,
    }),
    [rows]
  );

  const filtered = useMemo(() => {
    return rows.filter((row) => {
      if (filter === "open" && row.status === "done") return false;
      if (filter === "done" && row.status !== "done") return false;
      return true;
    });
  }, [rows, filter]);

  const selected = rows.find((row) => row.id === selectedId) ?? null;

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

  const replyBody = selected
    ? `Hi ${selected.name.split(" ")[0] || "there"}, thanks for reaching out about "${selected.topic}".`
    : "";

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
                !row.read && "is-unread"
              )}
              onClick={() => void selectRow(row)}
            >
              <span className="admin-list-name">{row.name}</span>
              <span className="admin-list-meta">{row.topic}</span>
              <span
                className={cn("admin-pill", row.status === "done" && "is-done")}
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
                {selected.phone ? (
                  <a
                    className="admin-icon-btn"
                    href={`tel:${selected.phone}`}
                    aria-label="Call"
                  >
                    <Phone size={16} />
                  </a>
                ) : null}
                {selected.phone ? (
                  <a
                    className="admin-icon-btn"
                    href={waUrl(selected.phone, replyBody)}
                    target="_blank"
                    rel="noreferrer"
                    aria-label="WhatsApp"
                  >
                    <MessageCircle size={16} />
                  </a>
                ) : null}
                <a
                  className="admin-icon-btn"
                  href={`mailto:${selected.email}?subject=${encodeURIComponent(`Re: FOAM — ${selected.topic}`)}`}
                  aria-label="Email"
                >
                  <Mail size={16} />
                </a>
              </div>
            </div>

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

              <Button
                type="button"
                variant={selected.status === "done" ? "outline" : "default"}
                onClick={() => void toggleDone(selected)}
              >
                {selected.status === "done" ? "Reopen" : "Mark done"}
              </Button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
