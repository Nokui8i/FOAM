import type { UserProfile } from "@/lib/user-profile";

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
export const SOFTENER_BOOKING_OPTIONS = [
  "No softener",
  "Downy",
  "White Vinegar",
] as const;
export const WASH_TEMP_BOOKING_OPTIONS = ["Cold wash", "Warm wash"] as const;
export const DRYER_HEAT_OPTIONS = ["Low", "Regular", "Air-Fluff"] as const;

export const TIP_PRESETS = [0, 3, 5, 10] as const;
export const TIME_SLOTS = ["7am - 10am", "10am - 1pm", "1pm - 4pm", "4pm - 7pm"] as const;

export const MIN_ORDER_USD = 50;
export const DELIVERY_FEE_USD = 5;
export const REPEAT_DISCOUNT_PERCENT = 10;
export const BOOKING_DRAFT_STORAGE_KEY = "foam-booking-draft-v1";

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
    savePrefsToProfile: false,
    saveDetailsToProfile: false,
  };
}

/** Prefill from saved account profile without locking the order to it. */
export function draftFromProfile(profile: UserProfile): Partial<BookingDraft> {
  const wash =
    profile.washTemp === "Warm" || profile.washTemp === "Hot"
      ? "Warm wash"
      : "Cold wash";
  const dryer =
    profile.dryerTemp === "High"
      ? "Regular"
      : profile.dryerTemp === "Low"
        ? "Low"
        : "Low";

  let detergent = "Persil";
  if (profile.detergent.toLowerCase().includes("hypo")) detergent = "All Free and Clear";
  else if (profile.detergent.toLowerCase().includes("own")) detergent = "Will Provide Own";
  else if (profile.detergent.toLowerCase().includes("organic")) detergent = "All Free and Clear";

  let softener = "No softener";
  if (profile.softener === "Standard") softener = "Downy";
  else if (profile.softener === "Hypoallergenic") softener = "No softener";

  return {
    name: profile.name,
    email: profile.email,
    phone: profile.phone,
    address: profile.address,
    unit: profile.unit,
    city: profile.city,
    zip: profile.zip,
    pickupNotes: profile.pickupNotes,
    detergent,
    softener,
    whitesWashTemp: wash,
    colorsWashTemp: wash,
    whitesDryerHeat: dryer,
    colorsDryerHeat: dryer,
    pants: profile.foldStyle.includes("Hang") ? "Hanger (Provide Own)" : "Folded",
    dresses: profile.foldStyle.includes("Hang") ? "Hanger (Provide Own)" : "Folded",
    repeatPickup: Boolean(profile.weeklyRepeatEnabled),
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

/** Earliest bookable day (tomorrow). */
export function earliestPickupDate() {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + 1);
  return d;
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
  opts: { repeatDiscountEligible?: boolean } = {}
) {
  const tip = resolvedTip(draft);
  const hasLaundry = draft.laundry;
  const hasDryCleaning = draft.dryCleaning;

  // Laundry is weighed at pickup — show the order minimum as the laundry estimate.
  // Dry cleaning is per-item and only finalized when items are inspected at pickup.
  const laundryMinimum = hasLaundry ? MIN_ORDER_USD : 0;
  const delivery = hasLaundry || hasDryCleaning ? DELIVERY_FEE_USD : 0;
  const subtotal = laundryMinimum + delivery;
  const discount = opts.repeatDiscountEligible
    ? Math.round(subtotal * (REPEAT_DISCOUNT_PERCENT / 100) * 100) / 100
    : 0;
  const knownTotal = Math.max(0, subtotal - discount) + tip;

  return {
    hasLaundry,
    hasDryCleaning,
    laundryMinimum,
    delivery,
    discount,
    tip,
    knownTotal,
    totalLabel: `$${knownTotal.toFixed(2)}`,
    serviceLine: hasLaundry
      ? "Laundry (weighed at pickup)"
      : hasDryCleaning
        ? "Dry cleaning (priced at pickup)"
        : "To be determined",
    minimumAdjustment: laundryMinimum,
  };
}
