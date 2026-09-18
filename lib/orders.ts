import {
  DELIVERY_FEE_USD,
  MIN_ORDER_USD,
  RATE_STANDARD_PER_LB_USD,
  RATE_WEEKLY_PER_LB_USD,
} from "@/lib/booking";

/** Ops pipeline for laundry pickups */
export const ORDER_STATUSES = [
  "new",
  "confirmed",
  "picked_up",
  "weighed",
  "washing",
  "out_for_delivery",
  "delivered",
  "cancelled",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  new: "New",
  confirmed: "Confirmed",
  picked_up: "Picked up",
  weighed: "Weighed",
  washing: "Washing",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

/** Next sensible status buttons for ops */
export const ORDER_STATUS_NEXT: Partial<Record<OrderStatus, OrderStatus[]>> = {
  new: ["confirmed", "cancelled"],
  confirmed: ["picked_up", "cancelled"],
  picked_up: ["weighed", "cancelled"],
  weighed: ["washing", "cancelled"],
  washing: ["out_for_delivery", "cancelled"],
  out_for_delivery: ["delivered", "cancelled"],
  delivered: [],
  cancelled: [],
};

export type OrderPhotoKind =
  | "pickup"
  | "weight"
  | "return"
  | "other";

export type OrderPhoto = {
  url: string;
  kind: OrderPhotoKind;
  caption?: string;
  createdAt?: unknown;
};

export type FoamOrder = {
  id: string;
  status: OrderStatus;
  guest: boolean;
  uid: string | null;
  services: {
    laundry: boolean;
    dryCleaning: boolean;
    bagCount: number;
  };
  contact: {
    name: string;
    email: string;
    phone: string;
  };
  pickup: {
    address: string;
    unit: string;
    city: string;
    zip: string;
    notes: string;
    date: string;
    slot: string;
    repeat: boolean;
    repeatRequested?: boolean;
  };
  preferences?: Record<string, string>;
  orderNotes?: string;
  pricing?: {
    mode?: string;
    tier?: "weekly" | "standard";
    laundryRatePerLb?: number;
    deliveryFee?: number;
    minimumOrder?: number;
    tip?: number;
    promoCode?: string;
    finalTotalPending?: boolean;
    repeatDiscountEligible?: boolean;
    repeatDiscountPercent?: number;
  };
  tip?: number;
  promoCode?: string;
  /** Ops fields (admin-written) */
  weightLbs?: number | null;
  finalTotal?: number | null;
  opsNotes?: string;
  photos?: OrderPhoto[];
  statusHistory?: { status: OrderStatus; at: unknown; by?: string }[];
  createdAt?: { toDate: () => Date } | null;
  statusUpdatedAt?: { toDate: () => Date } | null;
};

export function normalizeOrderStatus(raw: unknown): OrderStatus {
  if (typeof raw === "string" && (ORDER_STATUSES as readonly string[]).includes(raw)) {
    return raw as OrderStatus;
  }
  return "new";
}

export function formatOrderAddress(order: FoamOrder) {
  const unit = order.pickup.unit?.trim();
  const line = unit
    ? `${order.pickup.address}, ${unit}`
    : order.pickup.address;
  return `${line}, ${order.pickup.city || "Las Vegas"} ${order.pickup.zip}`.trim();
}

export function servicesSummary(order: FoamOrder) {
  const parts: string[] = [];
  if (order.services.laundry) {
    parts.push(
      `Laundry${order.services.bagCount ? ` (${order.services.bagCount} bag${order.services.bagCount === 1 ? "" : "s"})` : ""}`
    );
  }
  if (order.services.dryCleaning) parts.push("Dry cleaning");
  return parts.join(" · ") || "—";
}

/** Final total after weigh-in (laundry lb rate + fee + tip, with min + optional repeat %). */
export function computeFinalTotal(opts: {
  weightLbs: number;
  tier?: "weekly" | "standard";
  ratePerLb?: number;
  deliveryFee?: number;
  minimumOrder?: number;
  tip?: number;
  repeatDiscountPercent?: number;
  hasLaundry?: boolean;
}) {
  const rate =
    opts.ratePerLb ??
    (opts.tier === "weekly"
      ? RATE_WEEKLY_PER_LB_USD
      : RATE_STANDARD_PER_LB_USD);
  const fee = opts.deliveryFee ?? DELIVERY_FEE_USD;
  const min = opts.minimumOrder ?? MIN_ORDER_USD;
  const tip = opts.tip ?? 0;
  const discountPct = opts.repeatDiscountPercent ?? 0;

  if (!opts.hasLaundry) {
    return Math.round((fee + tip) * 100) / 100;
  }

  let laundry = opts.weightLbs * rate;
  if (discountPct > 0) {
    laundry = laundry * (1 - discountPct / 100);
  }
  const sub = Math.max(laundry + fee, min);
  return Math.round((sub + tip) * 100) / 100;
}
