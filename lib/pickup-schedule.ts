import {
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";

import {
  SLOT_CAPACITY,
  TIME_SLOT_END_MINUTES,
  TIME_SLOT_START_MINUTES,
  TIME_SLOTS,
  bookingTodayIso,
} from "@/lib/booking";
import { getFirebaseDb } from "@/lib/firebase";

export type ScheduleSlot = {
  id: string;
  /** Display + booking key (stored on orders as pickup.slot). */
  label: string;
  startMinutes: number;
  endMinutes: number;
  capacity: number;
  enabled: boolean;
};

export type PickupSchedule = {
  slots: ScheduleSlot[];
  updatedBy: string;
};

export type DaySlotOverride = {
  closed?: boolean;
  capacity?: number;
};

export type DayOverride = {
  closed: boolean;
  slots: Record<string, DaySlotOverride>;
};

export const DEFAULT_SCHEDULE_SLOTS: ScheduleSlot[] = TIME_SLOTS.map(
  (label, index) => ({
    id: `slot-${index + 1}`,
    label,
    startMinutes: TIME_SLOT_START_MINUTES[label],
    endMinutes: TIME_SLOT_END_MINUTES[label],
    capacity: SLOT_CAPACITY,
    enabled: true,
  })
);

function clampMinutes(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(24 * 60, Math.floor(value)));
}

export function minutesToClock(total: number) {
  const m = clampMinutes(total);
  const h24 = Math.floor(m / 60) % 24;
  const min = m % 60;
  const ampm = h24 >= 12 ? "pm" : "am";
  const h12 = h24 % 12 || 12;
  return min === 0
    ? `${h12}${ampm}`
    : `${h12}:${String(min).padStart(2, "0")}${ampm}`;
}

export function clockToMinutes(raw: string): number | null {
  const text = raw.trim().toLowerCase().replace(/\s+/g, "");
  const match = text.match(/^(\d{1,2})(?::(\d{2}))?(am|pm)$/);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2] ?? 0);
  const ampm = match[3];
  if (!Number.isFinite(hour) || hour < 1 || hour > 12) return null;
  if (!Number.isFinite(minute) || minute < 0 || minute > 59) return null;
  if (ampm === "am") {
    if (hour === 12) hour = 0;
  } else if (hour !== 12) {
    hour += 12;
  }
  return hour * 60 + minute;
}

export function windowLabel(startMinutes: number, endMinutes: number) {
  return `${minutesToClock(startMinutes)} - ${minutesToClock(endMinutes)}`;
}

function normalizeSlots(raw: unknown): ScheduleSlot[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    return DEFAULT_SCHEDULE_SLOTS.map((s) => ({ ...s }));
  }
  const slots: ScheduleSlot[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const data = row as Record<string, unknown>;
    const startMinutes = clampMinutes(Number(data.startMinutes));
    const endMinutes = clampMinutes(Number(data.endMinutes));
    if (!(endMinutes > startMinutes)) continue;
    const label =
      typeof data.label === "string" && data.label.trim()
        ? data.label.trim()
        : windowLabel(startMinutes, endMinutes);
    const capacityRaw = Number(data.capacity);
    const capacity =
      Number.isFinite(capacityRaw) && capacityRaw > 0
        ? Math.min(200, Math.floor(capacityRaw))
        : SLOT_CAPACITY;
    const id =
      typeof data.id === "string" && data.id.trim()
        ? data.id.trim()
        : `slot-${slots.length + 1}`;
    slots.push({
      id,
      label,
      startMinutes,
      endMinutes,
      capacity,
      enabled: data.enabled !== false,
    });
  }
  return slots.length ? slots : DEFAULT_SCHEDULE_SLOTS.map((s) => ({ ...s }));
}

export function normalizeSchedule(raw?: Record<string, unknown> | null): PickupSchedule {
  return {
    slots: normalizeSlots(raw?.slots),
    updatedBy: typeof raw?.updatedBy === "string" ? raw.updatedBy : "",
  };
}

export function subscribePickupSchedule(
  onChange: (schedule: PickupSchedule) => void
) {
  return onSnapshot(
    doc(getFirebaseDb(), "config", "pickupSchedule"),
    (snap) => {
      onChange(
        normalizeSchedule(
          snap.exists() ? (snap.data() as Record<string, unknown>) : null
        )
      );
    },
    () => onChange(normalizeSchedule(null))
  );
}

export async function loadPickupSchedule(): Promise<PickupSchedule> {
  try {
    const snap = await getDoc(doc(getFirebaseDb(), "config", "pickupSchedule"));
    return normalizeSchedule(
      snap.exists() ? (snap.data() as Record<string, unknown>) : null
    );
  } catch {
    return normalizeSchedule(null);
  }
}

export async function savePickupSchedule(
  slots: ScheduleSlot[],
  adminEmail: string
) {
  const cleaned = normalizeSlots(slots);
  if (!cleaned.length) throw new Error("Add at least one time window.");
  const labels = new Set<string>();
  for (const slot of cleaned) {
    const key = slot.label.toLowerCase();
    if (labels.has(key)) {
      throw new Error(`Duplicate time window label: ${slot.label}`);
    }
    labels.add(key);
  }
  await setDoc(
    doc(getFirebaseDb(), "config", "pickupSchedule"),
    {
      slots: cleaned,
      updatedAt: serverTimestamp(),
      updatedBy: adminEmail || "admin",
    },
    { merge: true }
  );
  return cleaned;
}

function normalizeDayOverride(raw?: Record<string, unknown> | null): DayOverride {
  const slots: Record<string, DaySlotOverride> = {};
  const rawSlots = raw?.slots;
  if (rawSlots && typeof rawSlots === "object") {
    for (const [label, value] of Object.entries(
      rawSlots as Record<string, unknown>
    )) {
      if (!value || typeof value !== "object") continue;
      const row = value as Record<string, unknown>;
      const capacityRaw = Number(row.capacity);
      slots[label] = {
        closed: row.closed === true,
        capacity:
          Number.isFinite(capacityRaw) && capacityRaw > 0
            ? Math.min(200, Math.floor(capacityRaw))
            : undefined,
      };
    }
  }
  return {
    closed: raw?.closed === true,
    slots,
  };
}

export function subscribeDayOverride(
  dateIso: string,
  onChange: (override: DayOverride) => void
) {
  if (!dateIso) {
    onChange({ closed: false, slots: {} });
    return () => {};
  }
  return onSnapshot(
    doc(getFirebaseDb(), "pickupDayOverrides", dateIso),
    (snap) => {
      onChange(
        normalizeDayOverride(
          snap.exists() ? (snap.data() as Record<string, unknown>) : null
        )
      );
    },
    () => onChange({ closed: false, slots: {} })
  );
}

export async function loadDayOverride(dateIso: string): Promise<DayOverride> {
  if (!dateIso) return { closed: false, slots: {} };
  try {
    const snap = await getDoc(
      doc(getFirebaseDb(), "pickupDayOverrides", dateIso)
    );
    return normalizeDayOverride(
      snap.exists() ? (snap.data() as Record<string, unknown>) : null
    );
  } catch {
    return { closed: false, slots: {} };
  }
}

export async function saveDayOverride(
  dateIso: string,
  override: DayOverride,
  adminEmail: string
) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) {
    throw new Error("Invalid date.");
  }
  const slots: Record<string, DaySlotOverride> = {};
  for (const [label, row] of Object.entries(override.slots ?? {})) {
    const next: DaySlotOverride = {};
    if (row.closed) next.closed = true;
    if (typeof row.capacity === "number" && row.capacity > 0) {
      next.capacity = Math.min(200, Math.floor(row.capacity));
    }
    if (next.closed || next.capacity != null) slots[label] = next;
  }
  await setDoc(
    doc(getFirebaseDb(), "pickupDayOverrides", dateIso),
    {
      closed: override.closed === true,
      slots,
      updatedAt: serverTimestamp(),
      updatedBy: adminEmail || "admin",
    },
    { merge: false }
  );
}

export function findScheduleSlot(
  schedule: PickupSchedule,
  label: string
): ScheduleSlot | null {
  return schedule.slots.find((s) => s.label === label) ?? null;
}

export function slotCapacityForDay(
  schedule: PickupSchedule,
  override: DayOverride | null | undefined,
  label: string
) {
  const base = findScheduleSlot(schedule, label)?.capacity ?? SLOT_CAPACITY;
  const dayCap = override?.slots?.[label]?.capacity;
  return typeof dayCap === "number" && dayCap > 0 ? dayCap : base;
}

export function isScheduleSlotOpenOnDay(opts: {
  schedule: PickupSchedule;
  override?: DayOverride | null;
  dateIso: string;
  label: string;
  now?: Date;
}) {
  const { schedule, override, dateIso, label, now = new Date() } = opts;
  if (!dateIso || !label) return false;
  if (override?.closed) return false;
  if (override?.slots?.[label]?.closed) return false;

  const slot = findScheduleSlot(schedule, label);
  if (!slot || !slot.enabled) return false;

  const today = bookingTodayIso(now);
  if (dateIso < today) return false;
  if (dateIso > today) return true;

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  }).formatToParts(now);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  const nowMin = hour * 60 + minute;
  return nowMin < slot.endMinutes;
}

export function enabledScheduleLabels(schedule: PickupSchedule) {
  return schedule.slots.filter((s) => s.enabled).map((s) => s.label);
}

export function newScheduleSlotId() {
  return `slot-${Date.now().toString(36)}`;
}
