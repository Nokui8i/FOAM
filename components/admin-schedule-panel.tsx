"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Clock3, Plus, Trash2 } from "lucide-react";

import { bookingTodayIso, toIsoDate } from "@/lib/booking";
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
  const [dayOverride, setDayOverride] = useState<DayOverride>({
    closed: false,
    slots: {},
  });
  const [booked, setBooked] = useState<SlotCounts>({});
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
    return subscribePickupSlotCounts(dayIso, setBooked, labels);
  }, [dayIso, slots]);

  const sortedSlots = useMemo(
    () => [...slots].sort((a, b) => a.startMinutes - b.startMinutes),
    [slots]
  );

  function patchSlot(id: string, patch: Partial<ScheduleSlot>) {
    setSlots((current) =>
      current.map((slot) => {
        if (slot.id !== id) return slot;
        const next = { ...slot, ...patch };
        if (
          patch.startMinutes != null ||
          patch.endMinutes != null ||
          patch.label == null
        ) {
          // Keep label in sync with times unless explicitly set.
          if (patch.label === undefined) {
            next.label = windowLabel(next.startMinutes, next.endMinutes);
          }
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
    setSavingDay(true);
    setError("");
    setOkMsg("");
    try {
      await saveDayOverride(dayIso, dayOverride, adminEmail);
      setOkMsg(`Schedule updated for ${dayIso}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save day.");
    } finally {
      setSavingDay(false);
    }
  }

  function setDaySlot(
    label: string,
    patch: { closed?: boolean; capacity?: number | null }
  ) {
    setDayOverride((current) => {
      const prev = current.slots[label] ?? {};
      const next = { ...prev };
      if (patch.closed !== undefined) next.closed = patch.closed;
      if (patch.capacity === null) delete next.capacity;
      else if (patch.capacity !== undefined) next.capacity = patch.capacity;
      return {
        ...current,
        slots: {
          ...current.slots,
          [label]: next,
        },
      };
    });
  }

  return (
    <section className="ops-catalog-plane ops-schedule-plane">
      <header className="ops-catalog-plane-head">
        <div>
          <h1 className="ops-list-title">Schedule</h1>
          <p className="ops-catalog-plane-lead">
            Open or close pickup days and hours, set capacity per window, and
            add or edit time ranges customers can book.
          </p>
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
            <h2>Default time windows</h2>
            <button type="button" className="ops-promos-link" onClick={addSlot}>
              <Plus size={14} aria-hidden />
              Add window
            </button>
          </div>
          <p className="ops-schedule-hint">
            These apply every day unless you override a specific date on the
            right. Capacity is max pickups per window.
          </p>

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
                  <small>
                    {minutesToClock(slot.startMinutes)} →{" "}
                    {minutesToClock(slot.endMinutes)}
                  </small>
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
            <h2>Day controls</h2>
            <span className="ops-schedule-day-chip">
              <CalendarDays size={14} aria-hidden />
              {dayIso}
            </span>
          </div>

          <label className="ops-promos-field">
            <span>Date</span>
            <input
              type="date"
              min={today}
              value={dayIso}
              onChange={(e) =>
                setDayIso(e.target.value || toIsoDate(new Date()))
              }
            />
          </label>

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
              {dayOverride.closed
                ? "Day closed — no bookings"
                : "Day open for bookings"}
            </span>
          </label>

          <div
            className={cn(
              "ops-schedule-day-slots",
              dayOverride.closed && "is-disabled"
            )}
          >
            {sortedSlots.map((slot) => {
              const override = dayOverride.slots[slot.label] ?? {};
              const closed = override.closed === true || !slot.enabled;
              const capacity = override.capacity ?? slot.capacity;
              const used = booked[slot.label] ?? 0;
              return (
                <div key={slot.id} className="ops-schedule-day-row">
                  <div className="ops-schedule-day-copy">
                    <strong>{slot.label}</strong>
                    <small>
                      {used} booked · default capacity {slot.capacity}
                      {!slot.enabled ? " · window off by default" : ""}
                    </small>
                  </div>
                  <label className="ops-schedule-toggle">
                    <input
                      type="checkbox"
                      checked={!closed && slot.enabled}
                      disabled={dayOverride.closed || !slot.enabled}
                      onChange={(e) =>
                        setDaySlot(slot.label, { closed: !e.target.checked })
                      }
                    />
                    <span>{closed ? "Closed" : "Open"}</span>
                  </label>
                  <label className="ops-promos-field is-compact">
                    <span>Capacity</span>
                    <input
                      type="number"
                      min={Math.max(1, used)}
                      max={200}
                      value={capacity}
                      disabled={dayOverride.closed || closed}
                      onChange={(e) => {
                        const n = Math.max(1, Number(e.target.value) || 1);
                        setDaySlot(slot.label, {
                          capacity: n === slot.capacity ? null : n,
                        });
                      }}
                    />
                  </label>
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
            {savingDay ? "Saving…" : "Save day"}
          </button>
        </section>
      </div>
    </section>
  );
}
