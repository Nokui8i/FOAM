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
  new: "Waiting for pickup",
  confirmed: "Waiting for pickup",
  picked_up: "Collected",
  weighed: "Collected",
  washing: "In process",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

export const ORDER_STATUS_HELP: Record<OrderStatus, string> = {
  new: "Order is waiting for pickup. At the stop: weigh, photo the scale, then charge.",
  confirmed: "Order is waiting for pickup. At the stop: weigh, photo the scale, then charge.",
  picked_up: "Collected after charge. At the plant, confirm it entered the work process.",
  weighed: "Collected after charge. At the plant, confirm it entered the work process.",
  washing: "In the plant process. When ready for return, confirm it left for delivery.",
  out_for_delivery: "On the way back to the customer. Mark delivered when handed off.",
  delivered: "Order is complete.",
  cancelled: "Order is cancelled.",
};

/** Ops / customer-service situations to resolve in admin */
export const ORDER_ISSUE_OPTIONS = [
  { id: "", label: "No open issue" },
  // Customer service / money
  { id: "cancel_request", label: "CS · Cancel request" },
  { id: "refund_request", label: "CS · Refund request" },
  { id: "billing_dispute", label: "CS · Billing / price dispute" },
  { id: "complaint", label: "CS · Complaint / bad experience" },
  { id: "change_request", label: "CS · Change date, address, or prefs" },
  { id: "repeat_stop", label: "CS · Stop weekly / automation" },
  // Field / pickup
  { id: "no_answer", label: "Field · No answer / unreachable" },
  { id: "not_home", label: "Field · Not home at pickup/return" },
  { id: "access_blocked", label: "Field · Gate / access blocked" },
  { id: "wrong_address", label: "Field · Wrong / incomplete address" },
  { id: "no_bags", label: "Field · No bags ready" },
  { id: "extra_bags", label: "Field · More bags than ordered" },
  { id: "outside_area", label: "Field · Outside service area" },
  // Product quality
  { id: "contaminated", label: "Quality · Contaminated items" },
  { id: "damaged_in", label: "Quality · Damage at pickup" },
  { id: "damaged_out", label: "Quality · Damage claim after return" },
  { id: "missing_item", label: "Quality · Missing item claim" },
  { id: "weight_dispute", label: "Quality · Weight / total dispute" },
  { id: "payment_fail", label: "Money · Payment / tip failed" },
  { id: "reschedule", label: "Ops · Needs reschedule" },
  { id: "other", label: "Other — see notes" },
] as const;

export type OrderIssueId = (typeof ORDER_ISSUE_OPTIONS)[number]["id"];

export const REFUND_STATUSES = [
  "none",
  "requested",
  "approved",
  "issued",
  "denied",
] as const;

export type RefundStatus = (typeof REFUND_STATUSES)[number];

export const REFUND_STATUS_LABELS: Record<RefundStatus, string> = {
  none: "No refund",
  requested: "Refund requested",
  approved: "Refund approved",
  issued: "Refund issued",
  denied: "Refund denied",
};

export const CANCEL_REASONS = [
  "",
  "Customer requested",
  "Could not reach customer",
  "Outside service area",
  "No bags / false order",
  "Duplicate order",
  "Weather / ops capacity",
  "Other — see notes",
] as const;

/** Next status moves for ops (no cancel in the main progress UI). */
export const ORDER_STATUS_NEXT: Partial<Record<OrderStatus, OrderStatus[]>> = {
  new: ["picked_up"],
  confirmed: ["picked_up"],
  picked_up: ["washing"],
  weighed: ["washing"],
  washing: ["out_for_delivery"],
  out_for_delivery: ["delivered"],
  delivered: [],
  cancelled: [],
};

/** Visual pipeline shown in ops (maps several DB statuses into one stage). */
export const ORDER_PIPELINE_STEPS = [
  { id: "waiting", label: "Waiting", statuses: ["new", "confirmed"] },
  { id: "collected", label: "Collected", statuses: ["picked_up", "weighed"] },
  { id: "plant", label: "In process", statuses: ["washing"] },
  { id: "delivery", label: "Delivery", statuses: ["out_for_delivery"] },
  { id: "done", label: "Done", statuses: ["delivered"] },
] as const;

export function orderPipelineIndex(status: OrderStatus): number {
  if (status === "cancelled") return -1;
  const index = ORDER_PIPELINE_STEPS.findIndex((step) =>
    (step.statuses as readonly string[]).includes(status)
  );
  return Math.max(0, index);
}

export function isWaitingForPickup(status: OrderStatus) {
  return status === "new" || status === "confirmed";
}

export function isCollectedStage(status: OrderStatus) {
  return status === "picked_up" || status === "weighed";
}

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

export type DryCleanItem = {
  name: string;
  price: number;
};

/** Sum of ad-hoc dry-cleaning items ops added for this order. */
export function dryCleanItemsTotal(items?: DryCleanItem[] | null): number {
  if (!items || items.length === 0) return 0;
  const sum = items.reduce(
    (total, item) => total + (Number(item.price) || 0),
    0
  );
  return Math.round(sum * 100) / 100;
}

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
  dryCleanItems?: DryCleanItem[];
  finalTotal?: number | null;
  opsNotes?: string;
  opsIssue?: string;
  refundStatus?: RefundStatus | string;
  refundAmount?: number | null;
  cancelReason?: string;
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
