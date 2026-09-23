"use client";

import { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import {
  Bell,
  Check,
  Mail,
  MessageCircle,
  Phone,
  Search,
} from "lucide-react";

import {
  buildReminderMessage,
  isInPickupReminderWindow,
  reminderSortKey,
  type PickupReminderAlert,
} from "@/lib/admin-alerts";
import { formatPickupDate } from "@/lib/booking";
import { getFirebaseDb } from "@/lib/firebase";
import { normalizeOrderStatus, ORDER_STATUS_LABELS } from "@/lib/orders";
import { orderRefFromId } from "@/lib/order-tracking";
import { BUSINESS_WHATSAPP } from "@/lib/site-config";
import { useQueryReplace } from "@/lib/use-query-replace";
import { cn } from "@/lib/utils";
import { SupportSectionNav } from "@/components/support-section-nav";

type MobileView = "list" | "detail";
type AlertFilter = "todo" | "done" | "all";

const FILTERS: { id: AlertFilter; label: string }[] = [
  { id: "todo", label: "To contact" },
  { id: "done", label: "Contacted" },
  { id: "all", label: "All" },
];

function waUrl(phone: string, body: string) {
  const digits = phone.replace(/\D/g, "");
  const to = digits || BUSINESS_WHATSAPP;
  return `https://wa.me/${to}?text=${encodeURIComponent(body)}`;
}

function mapAlert(
  id: string,
  data: Record<string, unknown>
): PickupReminderAlert | null {
  const status = normalizeOrderStatus(data.status);
  if (status === "cancelled" || status === "delivered") return null;

  const pickup = (data.pickup ?? {}) as Record<string, unknown>;
  const contact = (data.contact ?? {}) as Record<string, unknown>;
  const pricing = (data.pricing ?? {}) as Record<string, unknown>;
  const reminder = (data.opsReminder ?? {}) as Record<string, unknown>;
  const pickupDate = String(pickup.date ?? "");
  const window = isInPickupReminderWindow(pickupDate);
  if (!window.match || window.daysUntil == null) return null;

  return {
    orderId: id,
    trackKey: typeof data.trackKey === "string" ? data.trackKey : undefined,
    name: String(contact.name ?? ""),
    phone: String(contact.phone ?? ""),
    email: String(contact.email ?? ""),
    address: [pickup.address, pickup.unit, pickup.city, pickup.zip]
      .map((part) => String(part ?? "").trim())
      .filter(Boolean)
      .join(", "),
    pickupDate,
    pickupSlot: String(pickup.slot ?? ""),
    daysUntil: window.daysUntil,
    weekly: Boolean(pickup.repeat),
    automatedWeekly: Boolean(data.automatedWeekly),
    hasDiscount: Boolean(pricing.repeatDiscountEligible),
    status,
    contacted: Boolean(reminder.contacted),
    contactedAt:
      reminder.contactedAt &&
      typeof (reminder.contactedAt as { toDate?: () => Date }).toDate ===
        "function"
        ? (reminder.contactedAt as { toDate: () => Date })
            .toDate()
            .toLocaleString()
        : null,
    contactedBy:
      typeof reminder.contactedBy === "string" ? reminder.contactedBy : null,
  };
}

export function AdminAlertsPanel({
  adminEmail,
  mobileView,
  onMobileViewChange,
  onTodoCountChange,
  alertCount = 0,
}: {
  adminEmail: string;
  mobileView: MobileView;
  onMobileViewChange: (view: MobileView) => void;
  onTodoCountChange?: (count: number) => void;
  alertCount?: number;
}) {
  const { searchParams, replaceQuery } = useQueryReplace();
  const [rows, setRows] = useState<PickupReminderAlert[]>([]);
  const [error, setError] = useState("");
  const [queryText, setQueryText] = useState("");
  const selectedId = searchParams.get("id");
  const filter = (searchParams.get("filter") as AlertFilter) || "todo";
  const safeFilter: AlertFilter = ["todo", "done", "all"].includes(filter)
    ? filter
    : "todo";

  useEffect(() => {
    const unsub = onSnapshot(
      collection(getFirebaseDb(), "orders"),
      (snap) => {
        const next: PickupReminderAlert[] = [];
        for (const item of snap.docs) {
          const mapped = mapAlert(
            item.id,
            item.data() as Record<string, unknown>
          );
          if (mapped) next.push(mapped);
        }
        next.sort(reminderSortKey);
        setRows(next);
        setError("");
      },
      () => setError("Could not load pickup alerts.")
    );
    return () => unsub();
  }, []);

  const counts = useMemo(
    () => ({
      todo: rows.filter((row) => !row.contacted).length,
      done: rows.filter((row) => row.contacted).length,
      all: rows.length,
    }),
    [rows]
  );

  useEffect(() => {
    onTodoCountChange?.(counts.todo);
  }, [counts.todo, onTodoCountChange]);

  const filtered = useMemo(() => {
    const q = queryText.trim().toLowerCase();
    return rows.filter((row) => {
      if (safeFilter === "todo" && row.contacted) return false;
      if (safeFilter === "done" && !row.contacted) return false;
      if (!q) return true;
      return (
        row.name.toLowerCase().includes(q) ||
        row.phone.includes(q) ||
        row.email.toLowerCase().includes(q) ||
        row.address.toLowerCase().includes(q) ||
        row.pickupDate.includes(q)
      );
    });
  }, [rows, safeFilter, queryText]);

  const selected =
    filtered.find((row) => row.orderId === selectedId) ??
    rows.find((row) => row.orderId === selectedId) ??
    null;

  useEffect(() => {
    if (selectedId) onMobileViewChange("detail");
  }, [selectedId, onMobileViewChange]);

  function setFilter(next: AlertFilter) {
    replaceQuery({
      filter: next === "todo" ? null : next,
      id: null,
      view: null,
    });
  }

  async function markContacted(orderId: string, contacted: boolean) {
    setError("");
    try {
      await updateDoc(doc(getFirebaseDb(), "orders", orderId), {
        opsReminder: contacted
          ? {
              contacted: true,
              contactedAt: serverTimestamp(),
              contactedBy: adminEmail || "admin",
            }
          : {
              contacted: false,
              contactedAt: null,
              contactedBy: null,
            },
      });
    } catch {
      setError("Could not update reminder status.");
    }
  }

  const replyBody = selected ? buildReminderMessage(selected) : "";

  return (
    <>
      <section
        className={cn(
          "ops-list-pane queue-plane",
          mobileView === "detail" && "is-hidden-mobile"
        )}
      >
        <div className="ops-list-head">
          <SupportSectionNav alertCount={alertCount || counts.todo} />
          <div className="ops-list-head-row queue-heading">
            <div>
              <span>CUSTOMER CARE</span>
              <h1 className="ops-list-title">Pickup alerts</h1>
              <p className="ops-muted" style={{ margin: "6px 0 0", fontSize: 12 }}>
                Contact customers 3–4 days before pickup.
              </p>
            </div>
            <b>{counts[safeFilter]}</b>
          </div>

          <label className="ops-search">
            <Search size={16} aria-hidden />
            <input
              value={queryText}
              onChange={(e) => setQueryText(e.target.value)}
              placeholder="Search name, phone, or date"
            />
          </label>

          <fieldset className="ops-radio-filters">
            <legend>Status</legend>
            <div className="ops-radio-filters-row">
              {FILTERS.map((item) => (
                <label
                  key={item.id}
                  className={cn(
                    "ops-radio-label",
                    safeFilter === item.id && "is-active"
                  )}
                >
                  <input
                    type="radio"
                    name="alerts-status"
                    value={item.id}
                    checked={safeFilter === item.id}
                    onChange={() => setFilter(item.id)}
                  />
                  <span>
                    {item.label}
                    <span className="ops-radio-count">{counts[item.id]}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        </div>

        {error ? <p className="ops-error ops-pad">{error}</p> : null}

        <div className="ops-list-scroll">
          <div className="ops-list-card">
            {filtered.length === 0 ? (
              <p className="ops-empty">
                No pickups in the 3–4 day reminder window.
              </p>
            ) : (
              filtered.map((row) => (
                <button
                  key={row.orderId}
                  type="button"
                  className={cn(
                    "ops-row",
                    selectedId === row.orderId && "is-active",
                    !row.contacted && "is-unread"
                  )}
                  onClick={() =>
                    replaceQuery({ id: row.orderId, view: "detail" })
                  }
                >
                  <span className="ops-row-main">
                    <strong>{row.name || "Customer"}</strong>
                    <span>
                      {formatPickupDate(row.pickupDate)}
                      {row.pickupSlot ? ` · ${row.pickupSlot}` : ""}
                      {" · "}
                      in {row.daysUntil} day{row.daysUntil === 1 ? "" : "s"}
                    </span>
                  </span>
                  <span className="ops-row-meta">
                    {row.weekly ? (
                      <em className="ops-alert-chip">Weekly</em>
                    ) : null}
                    {row.contacted ? (
                      <em>Contacted</em>
                    ) : (
                      <em className="ops-alert-chip is-warn">Call needed</em>
                    )}
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
          <div className="ops-empty-detail">
            <Bell size={28} aria-hidden />
            <h2>Pickup alerts</h2>
            <p>Select a reminder to call or WhatsApp the customer.</p>
          </div>
        ) : (
          <div className="ops-detail-scroll">
            <button
              type="button"
              className="ops-back-mobile"
              onClick={() => {
                replaceQuery({ id: null, view: null });
                onMobileViewChange("list");
              }}
            >
              Back to alerts
            </button>

            <header className="ops-detail-head">
              <div>
                <h2>{selected.name || "Customer"}</h2>
                <p>
                  Ref {orderRefFromId(selected.orderId)} ·{" "}
                  {ORDER_STATUS_LABELS[normalizeOrderStatus(selected.status)]}
                </p>
              </div>
            </header>

            <div className="ops-support-block">
              <h3 className="ops-support-block-title">Pickup</h3>
              <p>
                <strong>
                  {formatPickupDate(selected.pickupDate)}
                  {selected.pickupSlot ? ` · ${selected.pickupSlot}` : ""}
                </strong>
              </p>
              <p>
                Reminder window: <strong>{selected.daysUntil} days</strong> out
              </p>
              <p>{selected.address || "No address on file"}</p>
              {selected.weekly ? (
                <p>
                  Weekly
                  {selected.automatedWeekly ? " auto" : ""}
                  {selected.hasDiscount ? " · 10% off laundry" : ""}
                </p>
              ) : null}
            </div>

            <div className="ops-support-block">
              <h3 className="ops-support-block-title">Contact customer</h3>
              <div className="ops-action-row">
                <a
                  className="ops-soft-btn"
                  href={`tel:${selected.phone.replace(/\D/g, "")}`}
                >
                  <Phone size={15} aria-hidden />
                  Call
                </a>
                <a
                  className="ops-soft-btn"
                  href={waUrl(selected.phone, replyBody)}
                  target="_blank"
                  rel="noreferrer"
                >
                  <MessageCircle size={15} aria-hidden />
                  WhatsApp
                </a>
                {selected.email ? (
                  <a
                    className="ops-soft-btn"
                    href={`mailto:${selected.email}?subject=${encodeURIComponent(
                      "FOAM pickup reminder"
                    )}&body=${encodeURIComponent(replyBody)}`}
                  >
                    <Mail size={15} aria-hidden />
                    Email
                  </a>
                ) : null}
              </div>
              <p className="ops-muted" style={{ marginTop: 10, fontSize: 13 }}>
                {replyBody}
              </p>
            </div>

            <div className="ops-support-block">
              <h3 className="ops-support-block-title">Admin status</h3>
              {selected.contacted ? (
                <p>
                  Contacted
                  {selected.contactedBy ? ` by ${selected.contactedBy}` : ""}
                  {selected.contactedAt ? ` · ${selected.contactedAt}` : ""}
                </p>
              ) : (
                <p>Not contacted yet — call the customer 3–4 days before pickup.</p>
              )}
              <div className="ops-action-row" style={{ marginTop: 10 }}>
                {!selected.contacted ? (
                  <button
                    type="button"
                    className="ops-soft-btn is-primary"
                    onClick={() => void markContacted(selected.orderId, true)}
                  >
                    <Check size={15} aria-hidden />
                    Mark contacted
                  </button>
                ) : (
                  <button
                    type="button"
                    className="ops-soft-btn"
                    onClick={() => void markContacted(selected.orderId, false)}
                  >
                    Undo contacted
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </section>
    </>
  );
}
