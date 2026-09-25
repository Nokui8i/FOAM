"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { OptionSheet } from "@/components/option-sheet";
import { Button } from "@/components/ui/button";
import {
  DETERGENT_BOOKING_OPTIONS,
  DETERGENT_IMAGES,
  DRYER_HEAT_OPTIONS,
  FOLD_ITEM_OPTIONS,
  SOFTENER_BOOKING_OPTIONS,
  TIME_SLOTS,
  WASH_TEMP_BOOKING_OPTIONS,
  earliestPickupDate,
  formatPickupDate,
  isPickupDateAllowed,
  latestPickupDate,
  nextPickupDates,
  toIsoDate,
} from "@/lib/booking";
import {
  canEditOrderRequests,
  canRescheduleOrder,
  defaultEditPreferences,
  saveCustomerOrderEdit,
  slotIsBookableForEdit,
  type OrderEditPreferences,
} from "@/lib/order-edit";
import type { OrderStatus } from "@/lib/orders";
import {
  subscribePickupSlotCounts,
  type SlotCounts,
} from "@/lib/pickup-availability";
import { cn } from "@/lib/utils";

type PrefKey = keyof OrderEditPreferences;

const PREF_META: {
  key: PrefKey;
  label: string;
  options: readonly string[];
  images?: Partial<Record<string, string>>;
}[] = [
  { key: "pants", label: "Pants", options: FOLD_ITEM_OPTIONS },
  { key: "dresses", label: "Dresses", options: FOLD_ITEM_OPTIONS },
  {
    key: "detergent",
    label: "Detergent",
    options: DETERGENT_BOOKING_OPTIONS,
    images: DETERGENT_IMAGES,
  },
  { key: "softener", label: "Softener", options: SOFTENER_BOOKING_OPTIONS },
  {
    key: "whitesWashTemp",
    label: "Whites wash",
    options: WASH_TEMP_BOOKING_OPTIONS,
  },
  {
    key: "colorsWashTemp",
    label: "Colors wash",
    options: WASH_TEMP_BOOKING_OPTIONS,
  },
  {
    key: "whitesDryerHeat",
    label: "Whites dryer",
    options: DRYER_HEAT_OPTIONS,
  },
  {
    key: "colorsDryerHeat",
    label: "Colors dryer",
    options: DRYER_HEAT_OPTIONS,
  },
];

export function TrackOrderEdit({
  trackKey,
  orderId,
  status,
  pickupDate,
  pickupSlot,
  preferences,
  orderNotes,
  pickupNotes,
  onClose,
  onSaved,
}: {
  trackKey: string;
  orderId: string;
  status: OrderStatus;
  pickupDate: string;
  pickupSlot: string;
  preferences?: Record<string, string> | null;
  orderNotes?: string;
  pickupNotes?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const canEdit = canEditOrderRequests(status);
  const canReschedule = canRescheduleOrder(status, pickupDate, pickupSlot);

  const [prefs, setPrefs] = useState<OrderEditPreferences>(() =>
    defaultEditPreferences(preferences)
  );
  const [notes, setNotes] = useState(orderNotes ?? "");
  const [accessNotes, setAccessNotes] = useState(pickupNotes ?? "");
  const [date, setDate] = useState(pickupDate);
  const [slot, setSlot] = useState(pickupSlot);
  const [picker, setPicker] = useState<PrefKey | null>(null);
  const [showFullCalendar, setShowFullCalendar] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [slotCounts, setSlotCounts] = useState<SlotCounts>({
    "7am - 10am": 0,
    "10am - 1pm": 0,
    "1pm - 4pm": 0,
    "4pm - 7pm": 0,
  });

  useEffect(() => {
    if (!canReschedule || !date) return;
    return subscribePickupSlotCounts(date, setSlotCounts);
  }, [canReschedule, date]);

  useEffect(() => {
    if (!canReschedule || !date || !slot) return;
    if (slotIsBookableForEdit(date, slot, slotCounts, pickupDate, pickupSlot)) {
      return;
    }
    const next = TIME_SLOTS.find((s) =>
      slotIsBookableForEdit(date, s, slotCounts, pickupDate, pickupSlot)
    );
    if (next && next !== slot) setSlot(next);
  }, [canReschedule, date, slot, slotCounts, pickupDate, pickupSlot]);

  async function save() {
    if (!canEdit) return;
    setBusy(true);
    setError("");
    try {
      await saveCustomerOrderEdit({
        trackKey,
        orderId,
        status,
        previousDate: pickupDate,
        previousSlot: pickupSlot,
        next: {
          preferences: prefs,
          orderNotes: notes,
          pickupNotes: accessNotes,
          pickupDate: canReschedule ? date : pickupDate,
          pickupSlot: canReschedule ? slot : pickupSlot,
        },
      });
      onSaved();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not save changes.";
      setError(
        /permission|insufficient/i.test(message)
          ? "Could not save. Refresh and try again, or contact FOAM."
          : message
      );
    } finally {
      setBusy(false);
    }
  }

  if (!canEdit) {
    return (
      <div className="track-edit">
        <p className="text-sm text-muted-foreground">
          This order can no longer be edited from tracking. Contact FOAM if you
          need a change.
        </p>
        <Button type="button" variant="outline" className="mt-3" onClick={onClose}>
          Close
        </Button>
      </div>
    );
  }

  const activeMeta = picker ? PREF_META.find((m) => m.key === picker) : null;

  return (
    <div className="track-edit">
      {canReschedule ? (
        <section className="track-edit-block">
          <h3>Pickup date &amp; time</h3>
          <div className="book-day-pills">
            {nextPickupDates(7).map((iso) => {
              const d = new Date(`${iso}T12:00:00`);
              const active = date === iso;
              return (
                <button
                  key={iso}
                  type="button"
                  className={cn("book-day-pill", active && "is-active")}
                  onClick={() => setDate(iso)}
                >
                  <span className="book-day-pill-dow">
                    {d.toLocaleDateString("en-US", { weekday: "short" })}
                  </span>
                  <span className="book-day-pill-num">{d.getDate()}</span>
                </button>
              );
            })}
          </div>
          <button
            type="button"
            className="book-more-dates"
            onClick={() => setShowFullCalendar((v) => !v)}
          >
            {showFullCalendar
              ? "Hide full calendar"
              : "Need a date further out? Pick from the calendar"}
          </button>
          {showFullCalendar ? (
            <EditCalendar value={date} onChange={setDate} />
          ) : null}
          <div className="book-slots mt-3">
            {TIME_SLOTS.map((option) => {
              const open = slotIsBookableForEdit(
                date,
                option,
                slotCounts,
                pickupDate,
                pickupSlot
              );
              return (
                <button
                  key={option}
                  type="button"
                  disabled={!open}
                  className={cn(
                    "book-slot",
                    slot === option && open && "is-active",
                    !open && "is-disabled"
                  )}
                  onClick={() => setSlot(option)}
                >
                  {option}
                </button>
              );
            })}
          </div>
        </section>
      ) : (
        <section className="track-edit-block">
          <h3>Pickup date &amp; time</h3>
          <p className="text-sm text-muted-foreground">
            {formatPickupDate(pickupDate)}
            {pickupSlot ? ` · ${pickupSlot}` : ""}
          </p>
        </section>
      )}

      <section className="track-edit-block">
        <h3>Access notes</h3>
        <textarea
          className="track-edit-textarea"
          rows={3}
          placeholder="Gate code, leave at door, building manager…"
          value={accessNotes}
          onChange={(e) => setAccessNotes(e.target.value)}
        />
      </section>

      <section className="book-prefs track-edit-prefs">
        <div className="book-prefs-head">
          <strong>Wash preferences</strong>
        </div>
        <div className="book-prefs-body">
          {PREF_META.map((row) => (
            <button
              key={row.key}
              type="button"
              className="book-pref-row"
              onClick={() => setPicker(row.key)}
            >
              <span>{row.label}</span>
              <span>{prefs[row.key]}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="track-edit-block">
        <h3>Washing notes</h3>
        <textarea
          className="track-edit-textarea"
          rows={3}
          placeholder="Stains, delicate items, anything we should know…"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </section>

      {error ? (
        <p className="mt-3 text-sm font-medium text-destructive">{error}</p>
      ) : null}

      <div className="track-edit-actions">
        <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button type="button" onClick={() => void save()} disabled={busy}>
          {busy ? "Saving…" : "Save changes"}
        </Button>
      </div>

      {activeMeta ? (
        <OptionSheet
          title={activeMeta.label}
          options={activeMeta.options}
          value={prefs[activeMeta.key]}
          images={activeMeta.images}
          onSelect={(value) => {
            setPrefs((p) => ({ ...p, [activeMeta.key]: value }));
            setPicker(null);
          }}
          onClose={() => setPicker(null)}
        />
      ) : null}
    </div>
  );
}

function EditCalendar({
  value,
  onChange,
}: {
  value: string;
  onChange: (iso: string) => void;
}) {
  const min = useMemo(() => earliestPickupDate(), []);
  const max = useMemo(() => latestPickupDate(), []);
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
    <div className="book-cal mt-3">
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
          const open = isPickupDateAllowed(cell.iso);
          return (
            <button
              key={cell.iso}
              type="button"
              disabled={!open}
              className={cn(
                "book-cal-day",
                value === cell.iso && "is-active",
                !open && "is-disabled"
              )}
              onClick={() => onChange(cell.iso)}
            >
              {cell.day}
            </button>
          );
        })}
      </div>
    </div>
  );
}
