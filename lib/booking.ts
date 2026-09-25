import type { UserProfile } from "@/lib/user-profile";
import { resolveLaundryPrefs } from "@/lib/user-profile";

export const BOOKING_STEPS = ["services", "schedule", "address", "confirm"] as const;
export type BookingStep = (typeof BOOKING_STEPS)[number];

export const FOLD_ITEM_OPTIONS = ["Folded", "Hanger (Provide Own)"] as const;
export const DETERGENT_BOOKING_OPTIONS = [
  "Persil",
  "Tide",
  "Gain",
  "OxyClean",
  "All Free and Clear",
  "Kirkland UltraClear",
  "Will Provide Own",
] as const;

/** Product thumbnails for detergent picker (missing = text-only). */
export const DETERGENT_IMAGES: Partial<
  Record<(typeof DETERGENT_BOOKING_OPTIONS)[number], string>
> = {
  Persil: "/detergents/persil.webp",
  Tide: "/detergents/tide.webp",
  Gain: "/detergents/gain.webp",
  OxyClean: "/detergents/oxiclean.webp",
  "All Free and Clear": "/detergents/all-free.webp",
  "Kirkland UltraClear": "/detergents/kirkland.webp",
};
export const SOFTENER_BOOKING_OPTIONS = [
  "No softener",
  "Downy",
  "White Vinegar",
] as const;
export const WASH_TEMP_BOOKING_OPTIONS = ["Cold wash", "Warm wash"] as const;
export const DRYER_HEAT_OPTIONS = ["Low", "Regular", "Air-Fluff"] as const;

export const TIP_PRESETS = [0, 3, 5, 10] as const;
export const TIME_SLOTS = ["7am - 10am", "10am - 1pm", "1pm - 4pm", "4pm - 7pm"] as const;
export type TimeSlot = (typeof TIME_SLOTS)[number];

/** Max active pickups per date + time window. */
export const SLOT_CAPACITY = 5;

/** Slot opens at this Las Vegas clock time (start of window). */
export const TIME_SLOT_START_MINUTES: Record<TimeSlot, number> = {
  "7am - 10am": 7 * 60,
  "10am - 1pm": 10 * 60,
  "1pm - 4pm": 13 * 60,
  "4pm - 7pm": 16 * 60,
};

/** Slot closes once this Las Vegas clock time is reached (end of window). */
export const TIME_SLOT_END_MINUTES: Record<TimeSlot, number> = {
  "7am - 10am": 10 * 60,
  "10am - 1pm": 13 * 60,
  "1pm - 4pm": 16 * 60,
  "4pm - 7pm": 19 * 60,
};

export const MIN_ORDER_USD = 50;
export const DELIVERY_FEE_USD = 5;
/** Wash & fold — weekly automation (signed-in repeat pickup). */
export const RATE_WEEKLY_PER_LB_USD = 2.35;
/** Wash & fold — one-time / on-demand. */
export const RATE_STANDARD_PER_LB_USD = 2.6;
/** Extra 10% off next automated pickup after a prior repeat order (ops applies on final weigh). */
export const REPEAT_DISCOUNT_PERCENT = 10;
export const BOOKING_DRAFT_STORAGE_KEY = "foam-booking-draft-v1";

export type PricingTier = "weekly" | "standard";

export function pricingForOrder(opts: {
  weeklyAutomation: boolean;
}) {
  const tier: PricingTier = opts.weeklyAutomation ? "weekly" : "standard";
  return {
    mode: "weighed_at_pickup" as const,
    tier,
    laundryRatePerLb:
      tier === "weekly" ? RATE_WEEKLY_PER_LB_USD : RATE_STANDARD_PER_LB_USD,
    deliveryFee: DELIVERY_FEE_USD,
    minimumOrder: MIN_ORDER_USD,
    repeatDiscountPercent: REPEAT_DISCOUNT_PERCENT,
  };
}

export function saveBookingDraft(draft: BookingDraft, step?: BookingStep) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(
      BOOKING_DRAFT_STORAGE_KEY,
      JSON.stringify({ draft, step: step ?? "confirm", savedAt: Date.now() })
    );
  } catch {
    /* ignore quota / private mode */
  }
}

export function loadBookingDraft(): {
  draft: BookingDraft;
  step: BookingStep;
} | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(BOOKING_DRAFT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      draft?: Partial<BookingDraft>;
      step?: BookingStep;
    };
    if (!parsed?.draft) return null;
    return {
      draft: { ...emptyBookingDraft(), ...parsed.draft },
      step:
        parsed.step && BOOKING_STEPS.includes(parsed.step)
          ? parsed.step
          : "confirm",
    };
  } catch {
    return null;
  }
}

export function clearBookingDraft() {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(BOOKING_DRAFT_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export type BookingDraft = {
  laundry: boolean;
  dryCleaning: boolean;
  bagCount: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  unit: string;
  city: string;
  zip: string;
  pickupNotes: string;
  pickupDate: string; // YYYY-MM-DD
  pickupSlot: string;
  repeatPickup: boolean;
  orderNotes: string;
  pants: string;
  dresses: string;
  detergent: string;
  softener: string;
  whitesWashTemp: string;
  colorsWashTemp: string;
  whitesDryerHeat: string;
  colorsDryerHeat: string;
  tip: number;
  tipCustom: string;
  setDefaultTip: boolean;
  promoCode: string;
  savePrefsToProfile: boolean;
  saveDetailsToProfile: boolean;
};

export function emptyBookingDraft(): BookingDraft {
  return {
    laundry: false,
    dryCleaning: false,
    bagCount: "1",
    name: "",
    email: "",
    phone: "",
    address: "",
    unit: "",
    city: "Las Vegas",
    zip: "",
    pickupNotes: "",
    pickupDate: "",
    pickupSlot: TIME_SLOTS[0],
    repeatPickup: false,
    orderNotes: "",
    pants: "Folded",
    dresses: "Folded",
    detergent: "Persil",
    softener: "No softener",
    whitesWashTemp: "Cold wash",
    colorsWashTemp: "Cold wash",
    whitesDryerHeat: "Low",
    colorsDryerHeat: "Low",
    tip: 0,
    tipCustom: "",
    setDefaultTip: false,
    promoCode: "",
    savePrefsToProfile: true,
    saveDetailsToProfile: true,
  };
}

/** Prefill from saved account profile without locking the order to it. */
export function draftFromProfile(profile: UserProfile): Partial<BookingDraft> {
  const prefs = resolveLaundryPrefs(profile);

  return {
    name: profile.name,
    email: profile.email,
    phone: profile.phone,
    address: profile.address,
    unit: profile.unit,
    city: profile.city,
    zip: profile.zip,
    pickupNotes: profile.pickupNotes,
    detergent: prefs.detergent,
    softener: prefs.softener,
    whitesWashTemp: prefs.whitesWashTemp,
    colorsWashTemp: prefs.colorsWashTemp,
    whitesDryerHeat: prefs.whitesDryerHeat,
    colorsDryerHeat: prefs.colorsDryerHeat,
    pants: prefs.pants,
    dresses: prefs.dresses,
    orderNotes: profile.careNotes || "",
    repeatPickup: Boolean(profile.weeklyRepeatEnabled),
    saveDetailsToProfile: true,
    savePrefsToProfile: true,
  };
}

export function hasService(draft: BookingDraft) {
  return draft.laundry || draft.dryCleaning;
}

export function servicesLabel(draft: BookingDraft) {
  const parts: string[] = [];
  if (draft.laundry) {
    const bags = Number(draft.bagCount) || 1;
    parts.push(
      `Laundry - Pickup & Delivery (${bags} bag${bags === 1 ? "" : "s"})`
    );
  }
  if (draft.dryCleaning) parts.push("Dry Cleaning - Pickup & Delivery");
  return parts.join(" · ") || "No service selected";
}

export function formatPickupDate(iso: string) {
  if (!iso) return "";
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function toIsoDate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Today in Las Vegas (service city), YYYY-MM-DD. */
export function bookingTodayIso(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function lasVegasMinutesNow(now = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  }).formatToParts(now);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return hour * 60 + minute;
}

/** Earliest bookable day (today in Las Vegas). */
export function earliestPickupDate() {
  return new Date(`${bookingTodayIso()}T12:00:00`);
}

/** Latest bookable day (~6 weeks out). */
export function latestPickupDate() {
  const d = earliestPickupDate();
  d.setDate(d.getDate() + 41);
  return d;
}

export function isPickupDateAllowed(iso: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const d = new Date(`${iso}T12:00:00`);
  const min = earliestPickupDate();
  const max = latestPickupDate();
  return d >= min && d <= max;
}

/** True when this date+slot is still open by clock (ignores capacity). */
export function isPickupSlotStillOpen(
  dateIso: string,
  slot: string,
  now = new Date(),
  window?: { endMinutes: number }
) {
  if (!isPickupDateAllowed(dateIso)) return false;
  const end =
    window?.endMinutes ?? TIME_SLOT_END_MINUTES[slot as TimeSlot];
  if (!Number.isFinite(end)) return false;
  const today = bookingTodayIso(now);
  if (dateIso > today) return true;
  if (dateIso < today) return false;
  return lasVegasMinutesNow(now) < end;
}

/** True before the pickup window starts (Las Vegas clock). */
export function isBeforePickupWindow(
  dateIso: string,
  slot: string,
  now = new Date(),
  window?: { startMinutes: number }
) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) return false;
  const start =
    window?.startMinutes ?? TIME_SLOT_START_MINUTES[slot as TimeSlot];
  if (!Number.isFinite(start)) return false;
  const today = bookingTodayIso(now);
  if (dateIso > today) return true;
  if (dateIso < today) return false;
  return lasVegasMinutesNow(now) < start;
}

/** True while now is inside the pickup window (Las Vegas clock). */
export function isWithinPickupWindow(
  dateIso: string,
  slot: string,
  now = new Date(),
  window?: { startMinutes: number; endMinutes: number }
) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) return false;
  const start =
    window?.startMinutes ?? TIME_SLOT_START_MINUTES[slot as TimeSlot];
  const end =
    window?.endMinutes ?? TIME_SLOT_END_MINUTES[slot as TimeSlot];
  if (!Number.isFinite(start) || !Number.isFinite(end)) return false;
  const today = bookingTodayIso(now);
  if (dateIso !== today) return false;
  const mins = lasVegasMinutesNow(now);
  return mins >= start && mins < end;
}

export function nextPickupDates(count = 7): string[] {
  const out: string[] = [];
  const start = earliestPickupDate();
  for (let i = 0; i < count; i += 1) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    out.push(toIsoDate(d));
  }
  return out;
}

export function resolvedTip(draft: BookingDraft) {
  if (draft.tipCustom.trim()) {
    const n = Number(draft.tipCustom);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  }
  return draft.tip;
}

export function orderEstimate(
  draft: BookingDraft,
  opts: { repeatDiscountEligible?: boolean; weeklyAutomation?: boolean } = {}
) {
  const tip = resolvedTip(draft);
  const hasLaundry = draft.laundry;
  const hasDryCleaning = draft.dryCleaning;
  const pricing = pricingForOrder({
    weeklyAutomation: Boolean(opts.weeklyAutomation),
  });

  // Final laundry $ is weighed at pickup — estimate only exposes known fees/tip.
  const delivery = hasLaundry || hasDryCleaning ? pricing.deliveryFee : 0;
  const discountEligible = Boolean(opts.repeatDiscountEligible);

  return {
    hasLaundry,
    hasDryCleaning,
    delivery,
    tip,
    discountEligible,
    pricing,
    knownFees: delivery + tip,
  };
}
