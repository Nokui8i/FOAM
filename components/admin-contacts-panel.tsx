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
  Mail,
  MessageCircle,
  Phone,
  Repeat2,
  Search,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { getFirebaseDb } from "@/lib/firebase";
import { BUSINESS_WHATSAPP } from "@/lib/site-config";
import { useQueryReplace } from "@/lib/use-query-replace";
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

const FILTER_IDS = new Set<string>(FILTERS.map((f) => f.id));

function parseInboxFilter(raw: string | null): InboxFilter {
  if (raw && FILTER_IDS.has(raw)) return raw as InboxFilter;
  return "open";
}

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
  const { searchParams, replaceQuery } = useQueryReplace();
  const [rows, setRows] = useState<ContactRow[]>([]);
  const selectedId = searchParams.get("id");
  const filter = parseInboxFilter(searchParams.get("filter"));
  const [queryText, setQueryText] = useState("");
  const [error, setError] = useState("");

  function setFilter(next: InboxFilter) {
    replaceQuery({
      filter: next === "open" ? null : next,
      id: null,
      view: null,
    });
  }

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

  const selected =
    filtered.find((row) => row.id === selectedId) ?? filtered[0] ?? null;

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
    replaceQuery({ id: row.id, view: "detail" });
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
          "ops-list-pane queue-plane",
          mobileView === "detail" && "is-hidden-mobile"
        )}
      >
        <div className="ops-list-head">
          <div className="queue-heading">
            <h1 className="ops-list-title">Support</h1>
          </div>

          <label className="ops-search">
            <Search size={16} aria-hidden />
            <input
              value={queryText}
              onChange={(e) => setQueryText(e.target.value)}
              placeholder="Search name, phone, or message"
            />
          </label>

          <div
            className="ops-filter-row is-alerts"
            role="group"
            aria-label="Support filters"
          >
            {FILTERS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={cn(
                  "ops-filter-chip",
                  filter === item.id && "is-active"
                )}
                onClick={() => setFilter(item.id)}
              >
                {item.label}
                <span className="ops-radio-count">{counts[item.id]}</span>
              </button>
            ))}
          </div>
        </div>

        {error ? <p className="ops-error ops-pad">{error}</p> : null}

        <div className="ops-list-scroll">
          <div className="ops-list-card">
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
        </div>
      </section>

      <section
        className={cn(
          "ops-detail-pane task-plane",
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
              className="ops-back ops-back-labeled"
              onClick={() => onMobileViewChange("list")}
            >
              <ArrowLeft size={16} />
              Back to support
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
                    {formatDate(selected.createdAt)}
                  </p>
                </div>
                <div className="ops-icon-row">
                  {selected.phone ? (
                    <a
                      className="ops-text-btn"
                      href={`tel:${selected.phone}`}
                    >
                      <Phone size={16} aria-hidden />
                      Call
                    </a>
                  ) : null}
                  {selected.phone ? (
                    <a
                      className="ops-text-btn"
                      href={waUrl(selected.phone, replyBody)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <MessageCircle size={16} aria-hidden />
                      WhatsApp
                    </a>
                  ) : null}
                  <a
                    className="ops-text-btn"
                    href={`mailto:${selected.email}?subject=${encodeURIComponent(`Re: FOAM — ${selected.topic}`)}`}
                  >
                    <Mail size={16} aria-hidden />
                    Email
                  </a>
                </div>
              </div>

              <section className="ops-support-block">
                <h3 className="ops-support-block-title">Customer</h3>
                <div className="ops-fields">
                  <div>
                    <p className="ops-field-label">Name</p>
                    <p>{selected.name}</p>
                  </div>
                  <div>
                    <p className="ops-field-label">Topic</p>
                    <p>{selected.topic || "—"}</p>
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
              </section>

              <section className="ops-support-block">
                <h3 className="ops-support-block-title">Message</h3>
                <div className="ops-message-body">{selected.message}</div>
              </section>

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
            </div>
          </article>
        )}
      </section>
    </>
  );
}
