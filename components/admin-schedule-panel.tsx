"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { collection, onSnapshot } from "firebase/firestore";
import { createPortal } from "react-dom";

import {
  bookingTodayIso,
  earliestPickupDate,
  latestPickupDate,
  toIsoDate,
} from "@/lib/booking";
import { getFirebaseDb } from "@/lib/firebase";
import {
  isCancelledOrder,
  normalizeOrderStatus,
  type OrderStatus,
} from "@/lib/orders";
import {
  subscribePickupSlotCounts,
  type SlotCounts,
} from "@/lib/pickup-availability";
import {
  DEFAULT_SCHEDULE_SLOTS,
  minutesToClock,
  newScheduleSlotId,
  saveDayOverride,
  savePickupSchedule,
  subscribeDayOverride,
  subscribePickupSchedule,
  windowLabel,
  type DayOverride,
  type ScheduleSlot,
} from "@/lib/pickup-schedule";
import { cn } from "@/lib/utils";

type MobileView = "list" | "detail";

function minutesFromTimeInput(value: string) {
  if (!value) return 0;
  const [h, m] = value.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
  return h * 60 + m;
}

function timeInputFromMinutes(total: number) {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function formatDayLabel(iso: string) {
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function activePickupOrdersByDate(rows: Array<{ date: string; slot: string }>) {
  const byDate: Record<string, number> = {};
  const byDateSlot: Record<string, SlotCounts> = {};
  for (const row of rows) {
    if (!row.date) continue;
    byDate[row.date] = (byDate[row.date] ?? 0) + 1;
    if (!byDateSlot[row.date]) byDateSlot[row.date] = {};
    const slot = row.slot || "Unassigned";
    byDateSlot[row.date][slot] = (byDateSlot[row.date][slot] ?? 0) + 1;
  }
  return { byDate, byDateSlot };
}

export function AdminSchedulePanel({
  adminEmail,
  onMobileViewChange,
}: {
  adminEmail: string;
  mobileView: MobileView;
  onMobileViewChange: (view: MobileView) => void;
}) {
  const today = bookingTodayIso();
  const [slots, setSlots] = useState<ScheduleSlot[]>(DEFAULT_SCHEDULE_SLOTS);
  const [dayIso, setDayIso] = useState(today);
  const [showCalendar, setShowCalendar] = useState(false);
  const [dayOverride, setDayOverride] = useState<DayOverride>({
    closed: false,
    slots: {},
  });
  const [availability, setAvailability] = useState<SlotCounts>({});
  const [orderPickups, setOrderPickups] = useState<
    Array<{ date: string; slot: string }>
  >([]);
  const [savingSlots, setSavingSlots] = useState(false);
  const [savingDay, setSavingDay] = useState(false);
  const [error, setError] = useState("");
  const [okMsg, setOkMsg] = useState("");

  useEffect(() => {
    onMobileViewChange("detail");
  }, [onMobileViewChange]);

  useEffect(
    () =>
      subscribePickupSchedule((schedule) => {
        setSlots(schedule.slots.map((s) => ({ ...s })));
      }),
    []
  );

  useEffect(() => subscribeDayOverride(dayIso, setDayOverride), [dayIso]);

  useEffect(() => {
    const labels = slots.map((s) => s.label);
    return subscribePickupSlotCounts(dayIso, setAvailability, labels);
  }, [dayIso, slots]);

  useEffect(() => {
    return onSnapshot(collection(getFirebaseDb(), "orders"), (snap) => {
      const next: Array<{ date: string; slot: string }> = [];
      snap.forEach((docSnap) => {
        const data = docSnap.data() as Record<string, unknown>;
        const status = normalizeOrderStatus(data.status) as OrderStatus;
        if (isCancelledOrder(status)) return;
        const pickup =
          data.pickup && typeof data.pickup === "object"
            ? (data.pickup as Record<string, unknown>)
            : null;
        const date = typeof pickup?.date === "string" ? pickup.date : "";
        if (!date) return;
        const slot = typeof pickup?.slot === "string" ? pickup.slot.trim() : "";
        next.push({ date, slot });
      });
      setOrderPickups(next);
    });
  }, []);

  const { byDate: ordersByDate, byDateSlot: ordersByDateSlot } = useMemo(
    () => activePickupOrdersByDate(orderPickups),
    [orderPickups]
  );

  const sortedSlots = useMemo(
    () => [...slots].sort((a, b) => a.startMinutes - b.startMinutes),
    [slots]
  );

  const dayOrderCounts = ordersByDateSlot[dayIso] ?? {};
  const dayOrderTotal = ordersByDate[dayIso] ?? 0;

  const daySlotRows = useMemo(() => {
    const known = new Set(sortedSlots.map((s) => s.label));
    const rows = sortedSlots.map((slot) => ({
      id: slot.id,
      label: slot.label,
      capacity: slot.capacity,
      enabled: slot.enabled,
      booked: Math.max(
        dayOrderCounts[slot.label] ?? 0,
        availability[slot.label] ?? 0
      ),
      orphan: false as boolean,
    }));
    for (const [label, count] of Object.entries(dayOrderCounts)) {
      if (known.has(label) || !(count > 0)) continue;
      rows.push({
        id: `orphan-${label}`,
        label,
        capacity: 0,
        enabled: false,
        booked: count,
        orphan: true,
      });
    }
    for (const [label, count] of Object.entries(availability)) {
      if (known.has(label) || dayOrderCounts[label] || !(count > 0)) continue;
      rows.push({
        id: `avail-${label}`,
        label,
        capacity: 0,
        enabled: false,
        booked: count,
        orphan: true,
      });
    }
    return rows;
  }, [sortedSlots, dayOrderCounts, availability]);

  const dayHasOverride =
    dayOverride.closed ||
    Object.values(dayOverride.slots).some((row) => row.closed);

  function patchSlot(id: string, patch: Partial<ScheduleSlot>) {
    setSlots((current) =>
      current.map((slot) => {
        if (slot.id !== id) return slot;
        const next = { ...slot, ...patch };
        if (patch.label === undefined) {
          next.label = windowLabel(next.startMinutes, next.endMinutes);
        }
        return next;
      })
    );
    setOkMsg("");
  }

  function addSlot() {
    const last = sortedSlots[sortedSlots.length - 1];
    const start = last ? Math.min(22 * 60, last.endMinutes) : 7 * 60;
    const end = Math.min(24 * 60, start + 3 * 60);
    setSlots((current) => [
      ...current,
      {
        id: newScheduleSlotId(),
        label: windowLabel(start, end),
        startMinutes: start,
        endMinutes: end,
        capacity: 5,
        enabled: true,
      },
    ]);
  }

  function removeSlot(id: string) {
    setSlots((current) => {
      if (current.length <= 1) {
        setError("Keep at least one time window.");
        return current;
      }
      return current.filter((s) => s.id !== id);
    });
  }

  async function saveWindows() {
    setSavingSlots(true);
    setError("");
    setOkMsg("");
    try {
      const saved = await savePickupSchedule(slots, adminEmail);
      setSlots(saved.map((s) => ({ ...s })));
      setOkMsg("Time windows saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save windows.");
    } finally {
      setSavingSlots(false);
    }
  }

  async function saveDay() {
    const closingDay = dayOverride.closed;
    const closingWindows = Object.values(dayOverride.slots).some(
      (row) => row.closed
    );
    if ((closingDay || closingWindows) && dayOrderTotal > 0) {
      const ok = window.confirm(
        `${dayOrderTotal} pickup${dayOrderTotal === 1 ? "" : "s"} already booked on ${formatDayLabel(dayIso)}. Close anyway?`
      );
      if (!ok) return;
    }

    setSavingDay(true);
    setError("");
    setOkMsg("");
    try {
      const cleaned: DayOverride = {
        closed: dayOverride.closed,
        slots: Object.fromEntries(
          Object.entries(dayOverride.slots)
            .filter(([, row]) => row.closed)
            .map(([label]) => [label, { closed: true }])
        ),
      };
      await saveDayOverride(dayIso, cleaned, adminEmail);
      setDayOverride(cleaned);
      setOkMsg(`Saved ${formatDayLabel(dayIso)}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save day.");
    } finally {
      setSavingDay(false);
    }
  }

  function setDaySlotClosed(label: string, closed: boolean) {
    setDayOverride((current) => {
      const slotsMap = { ...current.slots };
      if (closed) {
        slotsMap[label] = { closed: true };
      } else {
        delete slotsMap[label];
      }
      return { ...current, slots: slotsMap };
    });
  }

  return (
    <section className="ops-catalog-plane ops-schedule-plane">
      <header className="ops-catalog-plane-head">
        <div>
          <h1 className="ops-list-title">Schedule</h1>
        </div>
        <div className="ops-catalog-plane-chip" aria-current="page">
          <span className="ops-catalog-plane-chip-icon" aria-hidden>
            <Clock3 size={16} />
          </span>
          <span className="ops-catalog-plane-chip-copy">
            <strong>Pickup windows</strong>
            <small>
              {slots.filter((s) => s.enabled).length} open · {slots.length} total
            </small>
          </span>
        </div>
      </header>

      {(okMsg || error) && (
        <p className={cn("ops-flash", error ? "is-error" : "is-ok")}>
          {error || okMsg}
        </p>
      )}

      <div className="ops-schedule-layout">
        <section className="ops-schedule-card">
          <div className="ops-schedule-card-head">
            <h2>Time windows (all days)</h2>
            <button type="button" className="ops-promos-link" onClick={addSlot}>
              <Plus size={14} aria-hidden />
              Add window
            </button>
          </div>

          <div className="ops-schedule-windows">
            {sortedSlots.map((slot) => (
              <div key={slot.id} className="ops-schedule-window">
                <label className="ops-schedule-toggle">
                  <input
                    type="checkbox"
                    checked={slot.enabled}
                    onChange={(e) =>
                      patchSlot(slot.id, { enabled: e.target.checked })
                    }
                  />
                  <span>{slot.enabled ? "Open" : "Closed"}</span>
                </label>
                <label className="ops-promos-field">
                  <span>Start</span>
                  <input
                    type="time"
                    value={timeInputFromMinutes(slot.startMinutes)}
                    onChange={(e) =>
                      patchSlot(slot.id, {
                        startMinutes: minutesFromTimeInput(e.target.value),
                      })
                    }
                  />
                </label>
                <label className="ops-promos-field">
                  <span>End</span>
                  <input
                    type="time"
                    value={timeInputFromMinutes(slot.endMinutes)}
                    onChange={(e) =>
                      patchSlot(slot.id, {
                        endMinutes: minutesFromTimeInput(e.target.value),
                      })
                    }
                  />
                </label>
                <label className="ops-promos-field">
                  <span>Capacity</span>
                  <input
                    type="number"
                    min={1}
                    max={200}
                    value={slot.capacity}
                    onChange={(e) =>
                      patchSlot(slot.id, {
                        capacity: Math.max(1, Number(e.target.value) || 1),
                      })
                    }
                  />
                </label>
                <div className="ops-schedule-window-label">
                  <strong>{slot.label}</strong>
                </div>
                <button
                  type="button"
                  className="ops-promos-link is-danger"
                  aria-label={`Remove ${slot.label}`}
                  onClick={() => removeSlot(slot.id)}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>

          <button
            type="button"
            className="ops-catalog-editor-btn"
            disabled={savingSlots}
            onClick={() => void saveWindows()}
          >
            {savingSlots ? "Saving…" : "Save time windows"}
          </button>
        </section>

        <section className="ops-schedule-card">
          <div className="ops-schedule-card-head">
            <h2>Close a day</h2>
            <button
              type="button"
              className={cn(
                "ops-schedule-cal-btn",
                showCalendar && "is-open",
                dayHasOverride && "has-override",
                dayOrderTotal > 0 && "has-bookings"
              )}
              aria-expanded={showCalendar}
              aria-label={`Pick date, currently ${formatDayLabel(dayIso)}`}
              onClick={() => setShowCalendar((v) => !v)}
            >
              <CalendarDays size={18} aria-hidden />
              <span>{formatDayLabel(dayIso)}</span>
            </button>
          </div>

          {dayOrderTotal > 0 ? (
            <div className="ops-schedule-booked" role="status">
              <AlertTriangle size={16} aria-hidden />
              <strong>
                {dayOrderTotal} order{dayOrderTotal === 1 ? "" : "s"} already
                booked on {formatDayLabel(dayIso)}
              </strong>
            </div>
          ) : null}

          <label className="ops-schedule-toggle is-day">
            <input
              type="checkbox"
              checked={!dayOverride.closed}
              onChange={(e) =>
                setDayOverride((current) => ({
                  ...current,
                  closed: !e.target.checked,
                }))
              }
            />
            <span>
              {dayOverride.closed ? "Whole day closed" : "Day open"}
            </span>
          </label>

          <div
            className={cn(
              "ops-schedule-day-slots",
              dayOverride.closed && "is-disabled"
            )}
          >
            {daySlotRows.map((row) => {
              const closed =
                dayOverride.slots[row.label]?.closed === true ||
                (!row.orphan && !row.enabled);
              return (
                <div
                  key={row.id}
                  className={cn(
                    "ops-schedule-day-row is-simple",
                    row.booked > 0 && "has-bookings"
                  )}
                >
                  <div className="ops-schedule-day-copy">
                    <strong>{row.label}</strong>
                    <span className={cn(row.booked > 0 && "is-booked")}>
                      {row.booked > 0
                        ? `${row.booked} booked`
                        : "0 booked"}
                      {!row.orphan ? ` · capacity ${row.capacity}` : ""}
                      {row.orphan ? " · previous window" : ""}
                      {!row.orphan && !row.enabled ? " · off globally" : ""}
                    </span>
                  </div>
                  {!row.orphan ? (
                    <label className="ops-schedule-toggle">
                      <input
                        type="checkbox"
                        checked={!closed && row.enabled}
                        disabled={dayOverride.closed || !row.enabled}
                        onChange={(e) =>
                          setDaySlotClosed(row.label, !e.target.checked)
                        }
                      />
                      <span>{closed ? "Closed" : "Open"}</span>
                    </label>
                  ) : (
                    <span className="ops-schedule-orphan-tag">Booked</span>
                  )}
                </div>
              );
            })}
          </div>

          <button
            type="button"
            className="ops-catalog-editor-btn"
            disabled={savingDay}
            onClick={() => void saveDay()}
          >
            {savingDay ? "Saving…" : "Save day override"}
          </button>
        </section>
      </div>

      {showCalendar
        ? createPortal(
            <div className="ops-history-cal-overlay" role="presentation">
              <button
                type="button"
                className="ops-history-cal-backdrop"
                aria-label="Close calendar"
                onClick={() => setShowCalendar(false)}
              />
              <div
                className="ops-history-cal-popover"
                role="dialog"
                aria-label="Pick a schedule date"
              >
                <div className="ops-history-cal-popover-head">
                  <strong>Pick a date</strong>
                  <button
                    type="button"
                    className="ops-history-cal-close"
                    aria-label="Close"
                    onClick={() => setShowCalendar(false)}
                  >
                    <X size={16} />
                  </button>
                </div>
                <ScheduleCalendar
                  value={dayIso}
                  ordersByDate={ordersByDate}
                  onChange={(iso) => {
                    setDayIso(iso);
                    setShowCalendar(false);
                  }}
                />
              </div>
            </div>,
            document.querySelector(".admin-page") ?? document.body
          )
        : null}
    </section>
  );
}

function ScheduleCalendar({
  value,
  onChange,
  ordersByDate,
}: {
  value: string;
  onChange: (iso: string) => void;
  ordersByDate: Record<string, number>;
}) {
  const min = useMemo(() => earliestPickupDate(), []);
  const max = useMemo(() => latestPickupDate(), []);
  const minIso = toIsoDate(min);
  const maxIso = toIsoDate(max);
  const [cursor, setCursor] = useState(() => {
    const base = value ? new Date(`${value}T12:00:00`) : min;
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });

  const monthLabel = cursor.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  const cells = useMemo(() => {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const first = new Date(year, month, 1);
    const startPad = first.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const list: Array<{ iso: string; day: number } | null> = [];
    for (let i = 0; i < startPad; i += 1) list.push(null);
    for (let day = 1; day <= daysInMonth; day += 1) {
      list.push({ iso: toIsoDate(new Date(year, month, day)), day });
    }
    while (list.length % 7 !== 0) list.push(null);
    return list;
  }, [cursor]);

  const canPrev =
    new Date(cursor.getFullYear(), cursor.getMonth(), 1) >
    new Date(min.getFullYear(), min.getMonth(), 1);
  const canNext =
    new Date(cursor.getFullYear(), cursor.getMonth(), 1) <
    new Date(max.getFullYear(), max.getMonth(), 1);

  return (
    <div className="book-cal ops-history-cal">
      <div className="book-cal-head">
        <button
          type="button"
          className="book-cal-nav"
          disabled={!canPrev}
          onClick={() =>
            setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))
          }
          aria-label="Previous month"
        >
          <ChevronLeft size={18} />
        </button>
        <strong>{monthLabel}</strong>
        <button
          type="button"
          className="book-cal-nav"
          disabled={!canNext}
          onClick={() =>
            setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))
          }
          aria-label="Next month"
        >
          <ChevronRight size={18} />
        </button>
      </div>
      <div className="book-cal-week">
        {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div className="book-cal-grid">
        {cells.map((cell, i) => {
          if (!cell) return <span key={`e-${i}`} className="book-cal-empty" />;
          const open = cell.iso >= minIso && cell.iso <= maxIso;
          const booked = open && (ordersByDate[cell.iso] ?? 0) > 0;
          return (
            <button
              key={cell.iso}
              type="button"
              disabled={!open}
              className={cn(
                "book-cal-day",
                value === cell.iso && "is-active",
                !open && "is-disabled",
                booked && "has-orders"
              )}
              onClick={() => onChange(cell.iso)}
            >
              {cell.day}
              {booked ? <i className="ops-schedule-cal-dot" aria-hidden /> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
