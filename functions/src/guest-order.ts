import { HttpsError } from "firebase-functions/v2/https";

/** Guest order creates per platform IP. Separate from the slot-hold limit. */
export const GUEST_ORDER_IP_LIMIT = 10;
export const GUEST_ORDER_IP_WINDOW_MS = 60 * 60 * 1000;
/** Same address cannot open unlimited orders by rotating the forwarded IP. */
export const GUEST_ORDER_EMAIL_LIMIT = 5;

const PREFERENCE_KEYS = [
  "pants",
  "dresses",
  "detergent",
  "softener",
  "whitesWashTemp",
  "colorsWashTemp",
  "whitesDryerHeat",
  "colorsDryerHeat",
] as const;

export type GuestOrderDraft = {
  services: { laundry: boolean; dryCleaning: boolean; bagCount: number };
  contact: { name: string; email: string; phone: string };
  pickup: {
    address: string;
    unit: string;
    city: string;
    zip: string;
    notes: string;
    date: string;
    slot: string;
    repeatRequested: boolean;
  };
  preferences: Record<string, string>;
  orderNotes: string;
  tip: number;
  promoCode: string;
};

export type GuestPromoSnapshot = {
  code: string;
  discountType: "percent" | "fixed";
  discountValue: number;
  includesFee: boolean;
};

export type GuestRateSnapshot = {
  weeklyPerLb: number;
  standardPerLb: number;
  deliveryFee: number;
  minimumOrder: number;
};

function text(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function normalizeGuestSlot(raw: string) {
  return raw.trim().replace(/[\u2013\u2014]/g, "-").replace(/\s*-\s*/g, " - ");
}

/** Reads only booking fields. Price, identity, and payment keys are ignored. */
export function parseGuestOrderInput(data: unknown): GuestOrderDraft {
  const body = asRecord(data);
  const services = asRecord(body.services);
  const contact = asRecord(body.contact);
  const pickup = asRecord(body.pickup);
  const laundry = services.laundry === true;
  const dryCleaning = services.dryCleaning === true;
  const bagCount = Number(services.bagCount);
  if (!laundry && !dryCleaning) {
    throw new HttpsError("invalid-argument", "Select at least one service.");
  }
  if (!Number.isInteger(bagCount) || bagCount < 0 || bagCount > 20 || (laundry && bagCount < 1)) {
    throw new HttpsError("invalid-argument", "Enter a valid bag count.");
  }
  const name = text(contact.name, 120);
  const email = text(contact.email, 200).toLowerCase();
  const phone = text(contact.phone, 40);
  if (!name || !email || email.length < 4 || !email.includes("@") || email.includes(" ") || !phone) {
    throw new HttpsError("invalid-argument", "Name, email, and phone are required.");
  }
  const address = text(pickup.address, 200);
  const zip = text(pickup.zip, 10);
  const date = text(pickup.date, 10);
  const slot = normalizeGuestSlot(text(pickup.slot, 80));
  if (!/^\d+\s+\S+/.test(address)) {
    throw new HttpsError("invalid-argument", "Add a street address with a house number.");
  }
  if (!/^891\d{2}$/.test(zip)) {
    throw new HttpsError("invalid-argument", "Enter a valid Las Vegas ZIP (891xx).");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new HttpsError("invalid-argument", "Invalid pickup date.");
  }
  const parsedDate = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== date) {
    throw new HttpsError("invalid-argument", "Invalid pickup date.");
  }
  if (!slot) throw new HttpsError("invalid-argument", "Choose a pickup time window.");
  const tip = Number(body.tip ?? 0);
  if (!Number.isFinite(tip) || tip < 0 || tip > 500) {
    throw new HttpsError("invalid-argument", "Tip must be between $0 and $500.");
  }
  const preferences: Record<string, string> = {};
  const rawPrefs = asRecord(body.preferences);
  for (const key of PREFERENCE_KEYS) {
    preferences[key] = text(rawPrefs[key], 80);
  }
  const promoCode = text(body.promoCode, 24).toUpperCase().replace(/\s+/g, "");
  if (promoCode && promoCode.length < 2) {
    throw new HttpsError("invalid-argument", "Invalid promo code.");
  }
  return {
    services: { laundry, dryCleaning, bagCount: laundry ? bagCount : 0 },
    contact: { name, email, phone },
    pickup: {
      address,
      unit: text(pickup.unit, 40),
      city: "Las Vegas",
      zip,
      notes: text(pickup.notes, 1000),
      date,
      slot,
      repeatRequested: pickup.repeatRequested === true,
    },
    preferences,
    orderNotes: text(body.orderNotes, 2000),
    tip: Math.round(tip * 100) / 100,
    promoCode,
  };
}

export function guestPricingSnapshot(
  rates: GuestRateSnapshot,
  tip: number,
  promo: GuestPromoSnapshot | null
) {
  return {
    mode: "weighed_at_pickup" as const,
    tier: "standard" as const,
    laundryRatePerLb: rates.standardPerLb,
    deliveryFee: rates.deliveryFee,
    minimumOrder: rates.minimumOrder,
    tip,
    promoCode: promo?.code ?? "",
    promoDiscountType: promo?.discountType ?? null,
    promoDiscountValue: promo?.discountValue ?? null,
    promoIncludesFee: promo?.includesFee ?? false,
    promoLabel: promo
      ? `${promo.discountType === "percent" ? `${promo.discountValue}% off` : `$${promo.discountValue.toFixed(2)} off`} (${promo.includesFee ? "incl." : "excl."} fee)`
      : "",
    finalTotalPending: true,
    repeatDiscountEligible: false,
    repeatDiscountPercent: 0,
  };
}

export function guestOrderDocument(
  draft: GuestOrderDraft,
  pricing: ReturnType<typeof guestPricingSnapshot>,
  trackKey: string
) {
  return {
    status: "new" as const,
    guest: true,
    uid: null,
    trackKey,
    services: draft.services,
    contact: draft.contact,
    pickup: {
      address: draft.pickup.address,
      unit: draft.pickup.unit,
      city: draft.pickup.city,
      zip: draft.pickup.zip,
      notes: draft.pickup.notes,
      date: draft.pickup.date,
      slot: draft.pickup.slot,
      repeat: false,
      repeatRequested: draft.pickup.repeatRequested,
    },
    preferences: draft.preferences,
    orderNotes: draft.orderNotes,
    pricing,
    tip: draft.tip,
    promoCode: draft.promoCode,
  };
}

const PROTECTED_ORDER_KEYS = [
  "assignedDriverUid",
  "paymentStatus",
  "finalTotal",
  "stripeCustomerId",
  "stripePaymentMethodId",
  "stripePaymentIntentId",
  "chargeLedger",
  "cardBrand",
  "cardLast4",
];

export function guestOrderHasProtectedFields(order: Record<string, unknown>) {
  return PROTECTED_ORDER_KEYS.some((key) => key in order && order[key] != null);
}
