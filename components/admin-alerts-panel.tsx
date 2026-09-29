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
  Search,
  X,
} from "lucide-react";

import { useOpsPageReadyWhen } from "@/components/ops-boot";
import { Button } from "@/components/ui/button";
import {
  buildReminderMessage,
  buildNotificationSummary,
  buildStaffNotificationNote,
  isInPickupReminderWindow,
  reminderSortKey,
  type PickupReminderAlert,
} from "@/lib/admin-alerts";
import { getFirebaseDb } from "@/lib/firebase";
import { deleteOrderCompletely } from "@/lib/data-retention";
import { normalizeOrderStatus, orderDisplayId } from "@/lib/orders";
import { BUSINESS_WHATSAPP } from "@/lib/site-config";
import { useQueryReplace } from "@/lib/use-query-replace";
import { cn } from "@/lib/utils";
import { cancelFutureWeeklyOrders } from "@/lib/weekly-automation";
import { releasePickupSlot } from "@/lib/pickup-availability";

type MobileView = "list" | "detail";

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
  const [listReady, setListReady] = useState(false);
  useOpsPageReadyWhen(listReady);
  const [error, setError] = useState("");
  const [okMsg, setOkMsg] = useState("");
  const [queryText, setQueryText] = useState("");
  const selectedId = searchParams.get("id");

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
        setListReady(true);
        setError("");
      },
      () => {
        setListReady(true);
        setError("Could not load notifications.");
      }
    );
    return () => {
      unsub();
    };
  }, []);

  const reminderTodoCount = useMemo(
    () => rows.filter((row) => !row.contacted).length,
    [rows]
  );

  useEffect(() => {
    onTodoCountChange?.(reminderTodoCount);
  }, [reminderTodoCount, onTodoCountChange]);

  // Only pickups still waiting for staff confirm — confirmed ones live in Future.
  const filtered = useMemo(() => {
    const q = queryText.trim().toLowerCase();
    return rows.filter((row) => {
      if (row.contacted) return false;
      if (!q) return true;
      return (
        row.name.toLowerCase().includes(q) ||
        row.phone.includes(q) ||
        row.email.toLowerCase().includes(q) ||
        row.address.toLowerCase().includes(q) ||
        row.pickupDate.includes(q)
      );
    });
  }, [rows, queryText]);

  const selected =
    filtered.find((row) => row.orderId === selectedId) ?? null;

  useEffect(() => {
    if (selectedId && selected) onMobileViewChange("detail");
  }, [selectedId, selected, onMobileViewChange]);

  // Stale detail URL after confirm / cancel — drop back to the list.
  useEffect(() => {
    if (selectedId && listReady && !selected) {
      replaceQuery({ id: null, view: null, filter: null });
    }
  }, [selectedId, selected, listReady, replaceQuery]);

  function selectAlert(id: string) {
    replaceQuery({ id, view: "detail", filter: null });
  }

  async function markContacted(orderId: string) {
    setError("");
    setOkMsg("");
    try {
      await updateDoc(doc(getFirebaseDb(), "orders", orderId), {
        opsReminder: {
          contacted: true,
          contactedAt: serverTimestamp(),
          contactedBy: adminEmail || "admin",
          outcome: "confirmed",
        },
      });
      setOkMsg(
        "Confirmed — pickup stays on the schedule in Future / Orders by date."
      );
      replaceQuery({ id: null, view: null, filter: null });
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
      await releasePickupSlot(alert.pickupDate, alert.pickupSlot);

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
          /* future cancel best-effort */
        }
      }

      // Remove this pickup from the system (not kept in History).
      await deleteOrderCompletely(alert.orderId);

      setOkMsg(
        weeklyStopped
          ? futureCancelled > 0
            ? `Order cancelled · weekly automation off · ${futureCancelled} future pickups removed · 10% off stopped.`
            : "Order cancelled · weekly automation and 10% off stopped."
          : "Order cancelled."
      );
      replaceQuery({ id: null, view: null });
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
          <div className="queue-heading">
            <h1 className="ops-list-title">Notifications</h1>
          </div>

          <label className="ops-search">
            <Search size={16} aria-hidden />
            <input
              value={queryText}
              onChange={(e) => setQueryText(e.target.value)}
              placeholder="Search name, phone, or date"
            />
          </label>
        </div>

        {error ? <p className="ops-error ops-pad">{error}</p> : null}

        <div className="ops-list-scroll">
          <div className="ops-list-card">
            {!listReady ? (
              <div className="ops-list-skeleton" aria-busy="true" aria-label="Loading notifications">
                {[0, 1, 2].map((key) => (
                  <div key={key} className="ops-row-skeleton">
                    <span className="ops-skel ops-skel-title" />
                    <span className="ops-skel ops-skel-line" />
                    <span className="ops-skel ops-skel-line is-short" />
                  </div>
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <p className="ops-empty">
                No automated pickups waiting for confirmation.
              </p>
            ) : (
              filtered.map((row) => (
                <div
                  key={row.orderId}
                  className={cn(
                    "ops-row",
                    selectedId === row.orderId && "is-active"
                  )}
                >
                  <button
                    type="button"
                    className="ops-row-main"
                    onClick={() => selectAlert(row.orderId)}
                  >
                    <span className="ops-row-top">
                      <span className="ops-row-name">
                        {row.name || "Customer"}
                      </span>
                      <span className="ops-status-pill is-open">
                        Needs confirm
                      </span>
                    </span>
                    <span className="ops-row-when">
                      {buildNotificationSummary(row)}
                    </span>
                    <span className="ops-row-address">
                      {row.address || "No address on file"}
                    </span>
                    <span className="ops-row-foot">
                      <span className="ops-row-ref">
                        {formatAlertDate(row.pickupDate)},{" "}
                        {formatSlotShort(row.pickupSlot)}
                      </span>
                      <span className="ops-row-price">
                        {row.weekly
                          ? row.hasDiscount
                            ? "Weekly · 10% off"
                            : "Weekly auto"
                          : "Pickup"}
                      </span>
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
          <p className="ops-empty ops-pad">
            Select a notification to view details.
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
                }}
              >
                <ArrowLeft size={16} />
                Back
              </Button>

              <div className="ops-detail-top">
                <div className="ops-detail-top-main">
                  <p className="ops-breadcrumb">
                    <span>Notifications</span>
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
                    {selected.weekly || selected.automatedWeekly ? (
                      <span>
                        Weekly auto
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
                  <h3>Staff note</h3>
                </div>
                <p className="ops-call-note is-multiline">
                  {buildStaffNotificationNote(selected)}
                </p>
                <div className="ops-action-row is-pair is-centered" style={{ marginTop: 12 }}>
                  <button
                    type="button"
                    className="ops-soft-btn is-primary"
                    onClick={() => void markContacted(selected.orderId)}
                  >
                    <Check size={17} aria-hidden />
                    Confirm for schedule
                  </button>
                  <button
                    type="button"
                    className="ops-soft-btn is-danger"
                    onClick={() => void cancelAlertOrder(selected)}
                  >
                    <X size={17} aria-hidden />
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
