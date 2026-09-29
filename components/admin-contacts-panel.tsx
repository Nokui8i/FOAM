"use client";

import { useEffect, useMemo, useState } from "react";
import {
  arrayUnion,
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
  ClipboardList,
  Mail,
  Repeat2,
  Search,
  Send,
  Tag,
} from "lucide-react";

import { useOpsPageReadyWhen } from "@/components/ops-boot";
import { Button } from "@/components/ui/button";
import { getFirebaseDb } from "@/lib/firebase";
import { BUSINESS_WHATSAPP } from "@/lib/site-config";
import { useQueryReplace } from "@/lib/use-query-replace";
import { cn } from "@/lib/utils";

type ContactReply = {
  id: string;
  body: string;
  createdAt: string;
  createdBy: string;
  /** "internal" until company email is wired; then "email". */
  channel: "internal" | "email";
  emailStatus?: "pending" | "sent" | "failed" | null;
};

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
  replies: ContactReply[];
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

function formatReplyAt(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function mapReplies(raw: unknown): ContactReply[] {
  if (!Array.isArray(raw)) return [];
  const next: ContactReply[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const body = String(row.body ?? "").trim();
    if (!body) continue;
    const emailStatus =
      row.emailStatus === "pending" ||
      row.emailStatus === "sent" ||
      row.emailStatus === "failed"
        ? row.emailStatus
        : null;
    next.push({
      id: String(row.id ?? crypto.randomUUID()),
      body,
      createdAt: String(row.createdAt ?? ""),
      createdBy: String(row.createdBy ?? "staff"),
      channel: row.channel === "email" ? "email" : "internal",
      emailStatus,
    });
  }
  return next.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

function waUrl(phone: string, body: string) {
  const digits = phone.replace(/\D/g, "");
  const to = digits || BUSINESS_WHATSAPP;
  return `https://wa.me/${to}?text=${encodeURIComponent(body)}`;
}

export function AdminContactsPanel({
  adminEmail,
  mobileView,
  onMobileViewChange,
}: {
  adminEmail: string;
  mobileView: MobileView;
  onMobileViewChange: (view: MobileView) => void;
}) {
  const { searchParams, replaceQuery } = useQueryReplace();
  const [rows, setRows] = useState<ContactRow[]>([]);
  const [listReady, setListReady] = useState(false);
  useOpsPageReadyWhen(listReady);
  const selectedId = searchParams.get("id");
  const filter = parseInboxFilter(searchParams.get("filter"));
  const [queryText, setQueryText] = useState("");
  const [error, setError] = useState("");
  const [okMsg, setOkMsg] = useState("");
  const [replyDraft, setReplyDraft] = useState("");
  const [replySaving, setReplySaving] = useState(false);

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
            replies: mapReplies(data.replies),
          } satisfies ContactRow;
        });
        setRows(next);
        setListReady(true);
        setError("");
      },
      () => {
        setListReady(true);
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

  useEffect(() => {
    setReplyDraft("");
    setOkMsg("");
    setError("");
  }, [selected?.id]);

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

  async function saveReply(row: ContactRow) {
    const body = replyDraft.trim();
    if (!body) {
      setError("Write a reply before saving.");
      return;
    }

    const reply: ContactReply = {
      id:
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `reply-${Date.now()}`,
      body,
      createdAt: new Date().toISOString(),
      createdBy: adminEmail.trim() || "staff",
      channel: "internal",
      emailStatus: null,
    };

    setReplySaving(true);
    setError("");
    setOkMsg("");
    try {
      await updateDoc(doc(getFirebaseDb(), "contactMessages", row.id), {
        replies: arrayUnion(reply),
        read: true,
      });
      setReplyDraft("");
      setOkMsg("Reply saved. Company email sending will connect later.");
    } catch {
      setError("Could not save reply. Try again.");
    } finally {
      setReplySaving(false);
    }
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
            <h1 className="ops-list-title">Contact</h1>
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
            aria-label="Contact filters"
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
                <div
                  key={row.id}
                  className={cn(
                    "ops-row",
                    selectedId === row.id && "is-active",
                    !row.read && "is-unread"
                  )}
                >
                  <button
                    type="button"
                    className="ops-row-main"
                    onClick={() => void selectRow(row)}
                  >
                    <span className="ops-row-top">
                      <span className="ops-row-name">{row.name}</span>
                      <span
                        className={cn(
                          "ops-status-pill",
                          row.status === "done" ? "is-done" : "is-open"
                        )}
                      >
                        {row.status === "done" ? "Done" : "Open"}
                      </span>
                    </span>
                    <span className="ops-row-address">
                      {row.topic || "—"}
                    </span>
                  </button>
                </div>
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
          <article className="ops-detail">
            <div className="ops-detail-head">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="ops-back ops-back-labeled"
                onClick={() => onMobileViewChange("list")}
              >
                <ArrowLeft size={16} />
                Back
              </Button>

              <div className="ops-detail-top is-contact">
                <div className="ops-detail-top-main">
                  <p className="ops-breadcrumb">
                    <span>Contact</span>
                    <span aria-hidden>›</span>
                    <span>
                      {selected.status === "done" ? "Done" : "Open"}
                    </span>
                  </p>
                  <h2 className="ops-detail-title">{selected.name}</h2>
                  {selected.email ? (
                    <p className="ops-detail-email">
                      <Mail size={14} aria-hidden />
                      <a href={`mailto:${selected.email}`}>
                        {selected.email}
                      </a>
                    </p>
                  ) : null}
                  <div className="ops-detail-meta">
                    <span>
                      <ClipboardList size={14} aria-hidden />
                      {formatDate(selected.createdAt)}
                    </span>
                  </div>
                  <p className="ops-detail-address">
                    <Tag size={16} aria-hidden />
                    <span>{selected.topic || "No topic"}</span>
                  </p>
                </div>

                <div className="ops-icon-row">
                  {selected.phone ? (
                    <a
                      className="ops-action-btn"
                      href={`tel:${selected.phone}`}
                      aria-label="Call"
                      title="Call"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src="/ops-icon-call.png"
                        alt=""
                        width={22}
                        height={22}
                      />
                    </a>
                  ) : null}
                  {selected.phone ? (
                    <a
                      className="ops-action-btn"
                      href={waUrl(selected.phone, replyBody)}
                      target="_blank"
                      rel="noreferrer"
                      aria-label="WhatsApp"
                      title="WhatsApp"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src="/ops-icon-whatsapp.png"
                        alt=""
                        width={26}
                        height={26}
                      />
                    </a>
                  ) : null}
                  {selected.email ? (
                    <a
                      className="ops-action-btn"
                      href={`mailto:${selected.email}?subject=${encodeURIComponent(`Re: FOAM — ${selected.topic || "your message"}`)}`}
                      aria-label="Email"
                      title="Email"
                    >
                      <Mail size={18} aria-hidden />
                    </a>
                  ) : null}
                </div>
              </div>
            </div>

            {okMsg || error ? (
              <p className={cn("ops-flash", error ? "is-error" : "is-ok")}>
                {error || okMsg}
              </p>
            ) : null}

            <div className="ops-detail-stack">
              <section className="ops-contact-conversation">
                <div className="ops-contact-bubble is-customer">
                  <header>
                    <strong>{selected.name.split(" ")[0] || "Customer"}</strong>
                    <span>{formatDate(selected.createdAt)}</span>
                  </header>
                  <p>{selected.message}</p>
                </div>

                {selected.replies.map((reply) => (
                  <article
                    key={reply.id}
                    className="ops-contact-bubble is-staff"
                  >
                    <header>
                      <strong>FOAM</strong>
                      <span>
                        {reply.createdAt
                          ? formatReplyAt(reply.createdAt)
                          : "Just now"}
                      </span>
                    </header>
                    <p>{reply.body}</p>
                  </article>
                ))}

                <div className="ops-contact-compose">
                  <label className="ops-contact-reply-box">
                    <span className="sr-only">Reply to customer</span>
                    <textarea
                      value={replyDraft}
                      onChange={(e) => setReplyDraft(e.target.value)}
                      rows={5}
                      placeholder={`Hi ${selected.name.split(" ")[0] || "there"}, …`}
                      disabled={replySaving}
                    />
                  </label>
                  <div className="ops-contact-reply-actions">
                    <Button
                      type="button"
                      className="ops-btn-lg"
                      disabled={replySaving || !replyDraft.trim()}
                      onClick={() => void saveReply(selected)}
                    >
                      <Send size={16} aria-hidden />
                      {replySaving ? "Saving…" : "Save reply"}
                    </Button>
                    <Button
                      type="button"
                      className="ops-btn-lg"
                      variant={
                        selected.status === "done" ? "outline" : "default"
                      }
                      disabled={replySaving}
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
                </div>
              </section>
            </div>
          </article>
        )}
      </section>
    </>
  );
}
