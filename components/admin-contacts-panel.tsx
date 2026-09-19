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
import {
  ArrowLeft,
  Check,
  Inbox,
  Mail,
  MessageCircle,
  Phone,
  Repeat2,
  Search,
} from "lucide-react";

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
type MobileView = "list" | "detail";

const FILTERS: { id: InboxFilter; label: string }[] = [
  { id: "open", label: "Open" },
  { id: "done", label: "Done" },
  { id: "all", label: "All" },
];

function formatDate(value: Timestamp | null) {
  if (!value) return "Just now";
  return value.toDate().toLocaleString();
}

function waUrl(phone: string, body: string) {
  const digits = phone.replace(/\D/g, "");
  const to = digits || BUSINESS_WHATSAPP;
  return `https://wa.me/${to}?text=${encodeURIComponent(body)}`;
}

export function AdminContactsPanel({
  mobileView,
  onMobileViewChange,
}: {
  mobileView: MobileView;
  onMobileViewChange: (view: MobileView) => void;
}) {
  const [rows, setRows] = useState<ContactRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<InboxFilter>("open");
  const [queryText, setQueryText] = useState("");
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
    const q = queryText.trim().toLowerCase();
    return rows.filter((row) => {
      if (filter === "open" && row.status === "done") return false;
      if (filter === "done" && row.status !== "done") return false;
      if (!q) return true;
      const hay = [row.name, row.email, row.phone, row.topic, row.message]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [rows, filter, queryText]);

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
    onMobileViewChange("detail");
    if (!row.read) {
      await markRead(row.id);
    }
  }

  const replyBody = selected
    ? `Hi ${selected.name.split(" ")[0] || "there"}, thanks for reaching out about "${selected.topic}".`
    : "";

  return (
    <>
      <section
        className={cn(
          "ops-list-pane",
          mobileView === "detail" && "is-hidden-mobile"
        )}
      >
        <div className="ops-list-head">
          <div className="ops-list-head-row">
            <div>
              <p className="ops-eyebrow">Current queue</p>
              <h1 className="ops-list-title">Inquiries</h1>
            </div>
            <span className="ops-count-chip">{counts[filter]}</span>
          </div>

          <label className="ops-search">
            <Search size={16} aria-hidden />
            <input
              value={queryText}
              onChange={(e) => setQueryText(e.target.value)}
              placeholder="Search inquiries"
            />
          </label>

          <div
            className="ops-filter-row"
            role="tablist"
            aria-label="Filter inquiries"
          >
            {FILTERS.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={filter === item.id}
                className={cn(
                  "ops-filter-chip",
                  filter === item.id && "is-active"
                )}
                onClick={() => setFilter(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {error ? <p className="ops-error ops-pad">{error}</p> : null}

        <div className="ops-list-body">
          {filtered.length === 0 ? (
            <p className="ops-empty">Live messages will appear here.</p>
          ) : (
            filtered.map((row) => (
              <button
                key={row.id}
                type="button"
                className={cn(
                  "ops-row",
                  selectedId === row.id && "is-active",
                  !row.read && "is-unread"
                )}
                onClick={() => void selectRow(row)}
              >
                <span className="ops-row-icon">
                  <Mail size={16} />
                </span>
                <span className="ops-row-main">
                  <span className="ops-row-name">{row.name}</span>
                  <span className="ops-row-meta">{row.topic}</span>
                </span>
                <span
                  className={cn(
                    "ops-status-pill",
                    row.status === "done" ? "is-done" : "is-open"
                  )}
                >
                  {row.status === "done" ? "Done" : "Open"}
                </span>
              </button>
            ))
          )}
        </div>
      </section>

      <section
        className={cn(
          "ops-detail-pane",
          mobileView === "list" && "is-hidden-mobile"
        )}
      >
        {!selected ? (
          <p className="ops-empty ops-pad">Select a message.</p>
        ) : (
          <article className="ops-inquiry">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="ops-back"
              onClick={() => onMobileViewChange("list")}
            >
              <ArrowLeft size={16} />
              Back to inquiries
            </Button>

            <div className="ops-inquiry-inner">
              <div className="ops-inquiry-head">
                <div>
                  <span
                    className={cn(
                      "ops-status-pill is-lg",
                      selected.status === "done" ? "is-done" : "is-open"
                    )}
                  >
                    {selected.status === "done" ? "Done" : "Open"}
                  </span>
                  <h2>{selected.name}</h2>
                  <p className="ops-muted">
                    Contact inquiry · {formatDate(selected.createdAt)}
                  </p>
                </div>
                <div className="ops-icon-row">
                  {selected.phone ? (
                    <a
                      className="ops-icon-btn"
                      href={`tel:${selected.phone}`}
                      aria-label="Call"
                    >
                      <Phone size={18} />
                    </a>
                  ) : null}
                  {selected.phone ? (
                    <a
                      className="ops-icon-btn"
                      href={waUrl(selected.phone, replyBody)}
                      target="_blank"
                      rel="noreferrer"
                      aria-label="WhatsApp"
                    >
                      <MessageCircle size={18} />
                    </a>
                  ) : null}
                  <a
                    className="ops-icon-btn"
                    href={`mailto:${selected.email}?subject=${encodeURIComponent(`Re: FOAM — ${selected.topic}`)}`}
                    aria-label="Email"
                  >
                    <Mail size={18} />
                  </a>
                </div>
              </div>

              <section className="ops-card">
                <div className="ops-panel-title">
                  <span className="ops-panel-title-icon">
                    <Inbox className="size-4" />
                  </span>
                  <div>
                    <h3>Message</h3>
                  </div>
                </div>
                <div className="ops-fields">
                  <div>
                    <p className="ops-field-label">Name</p>
                    <p>{selected.name}</p>
                  </div>
                  <div>
                    <p className="ops-field-label">Topic</p>
                    <p>{selected.topic}</p>
                  </div>
                  <div>
                    <p className="ops-field-label">Email</p>
                    <p>
                      <a href={`mailto:${selected.email}`}>{selected.email}</a>
                    </p>
                  </div>
                  <div>
                    <p className="ops-field-label">Phone</p>
                    <p>
                      {selected.phone ? (
                        <a href={`tel:${selected.phone}`}>{selected.phone}</a>
                      ) : (
                        "—"
                      )}
                    </p>
                  </div>
                </div>
                <div className="ops-message-block">
                  <p className="ops-field-label">Full message</p>
                  <div className="ops-message-body">{selected.message}</div>
                </div>
                <Button
                  type="button"
                  className="ops-btn-lg"
                  variant={selected.status === "done" ? "outline" : "default"}
                  onClick={() => void toggleDone(selected)}
                >
                  {selected.status === "done" ? (
                    <Repeat2 size={16} />
                  ) : (
                    <Check size={16} />
                  )}
                  {selected.status === "done" ? "Reopen" : "Mark done"}
                </Button>
              </section>
            </div>
          </article>
        )}
      </section>
    </>
  );
}
