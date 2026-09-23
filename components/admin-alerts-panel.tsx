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
  ArrowLeft,
  CalendarDays,
  Check,
  Clock,
  MapPin,
  MoreHorizontal,
  Search,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  buildReminderMessage,
  isInPickupReminderWindow,
  reminderSortKey,
  type PickupReminderAlert,
} from "@/lib/admin-alerts";
import { getFirebaseDb } from "@/lib/firebase";
import { normalizeOrderStatus, orderDisplayId } from "@/lib/orders";
import { BUSINESS_WHATSAPP } from "@/lib/site-config";
import { useQueryReplace } from "@/lib/use-query-replace";
import { cn } from "@/lib/utils";
import { cancelFutureWeeklyOrders } from "@/lib/weekly-automation";

type MobileView = "list" | "detail";
type AlertFilter = "todo" | "done" | "all";

const FILTERS: { id: AlertFilter; label: string }[] = [
  { id: "todo", label: "To contact" },
  { id: "done", label: "Confirmed" },
  { id: "all", label: "All" },
];

function formatSlotShort(slot: string) {
  if (!slot) return "—";
  return slot
    .replace(/\s*-\s*/g, " – ")
    .replace(/\bam\b/gi, "am")
    .replace(/\bpm\b/gi, "pm");
}

function formatAlertDate(date: string, withYear = false) {
  if (!date) return "—";
  const d = new Date(`${date}T12:00:00`);
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(withYear ? { year: "numeric" as const } : {}),
  });
}

function waUrl(phone: string, body: string) {
  const digits = phone.replace(/\D/g, "");
  const to = digits || BUSINESS_WHATSAPP;
  return `https://wa.me/${to}?text=${encodeURIComponent(body)}`;
}

function mapsUrl(address: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    address
  )}`;
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
    uid: typeof data.uid === "string" ? data.uid : undefined,
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
}: {
  adminEmail: string;
  mobileView: MobileView;
  onMobileViewChange: (view: MobileView) => void;
  onTodoCountChange?: (count: number) => void;
}) {
  const { searchParams, replaceQuery } = useQueryReplace();
  const [rows, setRows] = useState<PickupReminderAlert[]>([]);
  const [error, setError] = useState("");
  const [okMsg, setOkMsg] = useState("");
  const [queryText, setQueryText] = useState("");
  const [expandedAddressId, setExpandedAddressId] = useState<string | null>(
    null
  );
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

  function selectAlert(id: string) {
    replaceQuery({ id, view: "detail" });
  }

  async function markContacted(orderId: string, contacted: boolean) {
    setError("");
    setOkMsg("");
    try {
      await updateDoc(doc(getFirebaseDb(), "orders", orderId), {
        opsReminder: contacted
          ? {
              contacted: true,
              contactedAt: serverTimestamp(),
              contactedBy: adminEmail || "admin",
              outcome: "confirmed",
            }
          : {
              contacted: false,
              contactedAt: null,
              contactedBy: null,
              outcome: null,
            },
      });
      if (contacted) {
        setOkMsg(
          "Confirmed — pickup stays on the schedule in Future / Orders by date."
        );
        replaceQuery({
          filter: "done",
          id: orderId,
          view: "detail",
        });
      } else {
        setOkMsg("Confirmation cleared.");
      }
    } catch {
      setError("Could not update reminder status.");
    }
  }

  async function cancelAlertOrder(alert: PickupReminderAlert) {
    const weeklyNote = alert.weekly
      ? "\n\nThis also turns OFF weekly automation for this customer — future auto pickups and the 10% weekly discount will stop."
      : "";
    const ok = window.confirm(
      `Cancel this pickup for ${alert.name || "the customer"}?\n\n${formatAlertDate(alert.pickupDate)} · ${formatSlotShort(alert.pickupSlot)}${weeklyNote}\n\nOnly continue if you spoke with the customer and they asked to cancel.`
    );
    if (!ok) return;

    setError("");
    setOkMsg("");
    try {
      const db = getFirebaseDb();
      await updateDoc(doc(db, "orders", alert.orderId), {
        status: "cancelled",
        cancelReason:
          "Cancelled after reminder call — customer requested cancel",
        statusUpdatedAt: serverTimestamp(),
        opsReminder: {
          contacted: true,
          contactedAt: serverTimestamp(),
          contactedBy: adminEmail || "admin",
          outcome: "cancelled",
        },
      });
      if (alert.trackKey) {
        try {
          await updateDoc(doc(db, "orderTracks", alert.trackKey), {
            status: "cancelled",
            updatedAt: serverTimestamp(),
          });
        } catch {
          /* track update best-effort */
        }
      }

      let weeklyStopped = false;
      let futureCancelled = 0;
      if (alert.weekly && alert.uid) {
        try {
          await updateDoc(doc(db, "users", alert.uid), {
            weeklyRepeatEnabled: false,
            updatedAt: serverTimestamp(),
          });
          weeklyStopped = true;
        } catch {
          /* profile update best-effort; still try future cancels */
        }
        try {
          const result = await cancelFutureWeeklyOrders(alert.uid, {
            cancelReason:
              "Admin cancelled after reminder call — weekly automation stopped",
          });
          futureCancelled = result.cancelled;
        } catch {
          /* future cancel best-effort after this order already cancelled */
        }
      }

      setOkMsg(
        weeklyStopped
          ? futureCancelled > 1
            ? `Order cancelled · weekly automation off · ${futureCancelled} future pickups removed · 10% off stopped.`
            : "Order cancelled · weekly automation and 10% off stopped."
          : "Order cancelled."
      );
      replaceQuery({ id: null, view: null });
      onMobileViewChange("list");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not cancel this order."
      );
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
          <div className="ops-list-head-row queue-heading">
            <div>
              <span>CUSTOMER CARE</span>
              <h1 className="ops-list-title">Alerts</h1>
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

          <div
            className="ops-filter-row is-alerts"
            role="group"
            aria-label="Alert filters"
          >
            {FILTERS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={cn(
                  "ops-filter-chip",
                  safeFilter === item.id && "is-active"
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
              <p className="ops-empty">
                No pickups in the 3–4 day reminder window.
              </p>
            ) : (
              filtered.map((row) => {
                const addressOpen = expandedAddressId === row.orderId;
                return (
                  <div
                    key={row.orderId}
                    role="button"
                    tabIndex={0}
                    className={cn(
                      "ops-row",
                      selectedId === row.orderId && "is-active"
                    )}
                    onClick={() => selectAlert(row.orderId)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        selectAlert(row.orderId);
                      }
                    }}
                  >
                    <span className="ops-row-top">
                      <span className="ops-row-name">
                        {row.name || "Customer"}
                      </span>
                      <span
                        className={cn(
                          "ops-status-pill",
                          row.contacted ? "is-ready" : "is-open"
                        )}
                      >
                        {row.contacted ? "Confirmed" : "Call needed"}
                      </span>
                    </span>
                    <span className="ops-row-when">
                      {formatAlertDate(row.pickupDate)},{" "}
                      {formatSlotShort(row.pickupSlot)}
                      {" · "}
                      in {row.daysUntil} day{row.daysUntil === 1 ? "" : "s"}
                    </span>
                    <span
                      className="ops-row-address-line"
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                    >
                      <span
                        className={cn(
                          "ops-row-address",
                          addressOpen && "is-expanded"
                        )}
                      >
                        {row.address || "No address on file"}
                      </span>
                      {row.address ? (
                        <button
                          type="button"
                          className={cn(
                            "ops-row-expand",
                            addressOpen && "is-open"
                          )}
                          aria-label={
                            addressOpen ? "Collapse address" : "Expand address"
                          }
                          aria-expanded={addressOpen}
                          title={
                            addressOpen ? "Collapse address" : "Expand address"
                          }
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpandedAddressId(
                              addressOpen ? null : row.orderId
                            );
                          }}
                        >
                          <MoreHorizontal size={16} aria-hidden />
                        </button>
                      ) : null}
                    </span>
                    <span className="ops-row-foot">
                      <span className="ops-row-ref">
                        {orderDisplayId(row.orderId)}
                      </span>
                      <span className="ops-row-price">
                        {row.weekly
                          ? row.hasDiscount
                            ? "Weekly · 10% off"
                            : "Weekly"
                          : "Pickup"}
                      </span>
                    </span>
                  </div>
                );
              })
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
          <p className="ops-empty ops-pad">
            Select an alert to view details.
          </p>
        ) : (
          <article className="ops-detail">
            <div className="ops-detail-head">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="ops-back ops-back-labeled"
                onClick={() => {
                  replaceQuery({ id: null, view: null });
                  onMobileViewChange("list");
                }}
              >
                <ArrowLeft size={16} />
                Back
              </Button>

              <div className="ops-detail-top">
                <div className="ops-detail-top-main">
                  <p className="ops-breadcrumb">
                    <span>Alerts</span>
                    <span aria-hidden>›</span>
                    <span>{orderDisplayId(selected.orderId)}</span>
                  </p>
                  <h2 className="ops-detail-title">
                    {selected.name || "Customer"}
                  </h2>
                  <p className="ops-detail-address">
                    <MapPin size={16} aria-hidden />
                    <span>{selected.address || "No address on file"}</span>
                  </p>
                  <div className="ops-detail-meta">
                    <span>
                      <CalendarDays size={14} aria-hidden />
                      {formatAlertDate(selected.pickupDate, true)}
                    </span>
                    <span>
                      <Clock size={14} aria-hidden />
                      {formatSlotShort(selected.pickupSlot)}
                    </span>
                    <span>
                      In {selected.daysUntil} day
                      {selected.daysUntil === 1 ? "" : "s"}
                    </span>
                    {selected.weekly ? (
                      <span>
                        Weekly
                        {selected.hasDiscount ? " · 10% off" : ""}
                      </span>
                    ) : null}
                  </div>
                </div>

                <div className="ops-icon-row">
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
                  <a
                    className="ops-action-btn"
                    href={mapsUrl(selected.address)}
                    target="_blank"
                    rel="noreferrer"
                    aria-label="Maps"
                    title="Maps"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src="/ops-icon-maps.png"
                      alt=""
                      width={22}
                      height={22}
                    />
                  </a>
                </div>
              </div>
            </div>

            {(okMsg || error) && (
              <p className={cn("ops-flash", error ? "is-error" : "is-ok")}>
                {error || okMsg}
              </p>
            )}

            <div className="ops-detail-stack">
              <section className="ops-stage-card">
                <div className="ops-soft-section-head">
                  <h3>After the call</h3>
                </div>
                {selected.contacted ? (
                  <p className="ops-call-note">
                    Confirmed
                    {selected.contactedBy ? ` by ${selected.contactedBy}` : ""}
                    {selected.contactedAt ? ` · ${selected.contactedAt}` : ""}
                  </p>
                ) : (
                  <p className="ops-call-note">
                    {selected.weekly || selected.automatedWeekly
                      ? "This pickup was created by weekly automation. Call the customer — make sure they know the date & time and are ready. Confirm if yes. Cancel stops this pickup, future weekly orders, and the 10% off."
                      : "Call the customer — make sure they know the date & time and are ready. Confirm if yes. Cancel only if they asked to cancel."}
                  </p>
                )}
                <div className="ops-action-row is-pair" style={{ marginTop: 12 }}>
                  {!selected.contacted ? (
                    <button
                      type="button"
                      className="ops-soft-btn is-primary"
                      onClick={() => void markContacted(selected.orderId, true)}
                    >
                      <Check size={15} aria-hidden />
                      Confirm
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="ops-soft-btn"
                      onClick={() =>
                        void markContacted(selected.orderId, false)
                      }
                    >
                      Undo
                    </button>
                  )}
                  <button
                    type="button"
                    className="ops-soft-btn is-danger"
                    onClick={() => void cancelAlertOrder(selected)}
                  >
                    <X size={15} aria-hidden />
                    Cancel
                  </button>
                </div>
              </section>
            </div>
          </article>
        )}
      </section>
    </>
  );
}
