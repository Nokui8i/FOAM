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
  confirmed: "Driver on the way",
  picked_up: "At laundry",
  weighed: "At laundry",
  washing: "At laundry",
  out_for_delivery: "On delivery",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

export const ORDER_STATUS_HELP: Record<OrderStatus, string> = {
  new: "When you leave for this stop, tap I’m on the way.",
  confirmed:
    "At the stop: weigh, scale photo, dry-clean items if needed, then charge.",
  picked_up: "Collected and at the laundry. Tap when ready to deliver today.",
  weighed: "Collected and at the laundry. Tap when ready to deliver today.",
  washing: "Collected and at the laundry. Tap when ready to deliver today.",
  out_for_delivery:
    "Out for delivery today. Upload a door photo, then confirm delivered.",
  delivered: "Order closed.",
  cancelled: "Cancelled.",
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
  new: ["confirmed"],
  confirmed: ["washing"],
  picked_up: ["out_for_delivery"],
  weighed: ["out_for_delivery"],
  washing: ["out_for_delivery"],
  out_for_delivery: ["delivered"],
  delivered: [],
  cancelled: [],
};

/** Undo / step back for driver mistakes before charge only.
 * After charge (At laundry+), never return to pickup — refunds need management. */
export const ORDER_STATUS_PREV: Partial<Record<OrderStatus, OrderStatus>> = {
  confirmed: "new",
  out_for_delivery: "washing",
  delivered: "out_for_delivery",
};

export function orderStatusPrevious(status: OrderStatus): OrderStatus | null {
  return ORDER_STATUS_PREV[status] ?? null;
}

export function orderStageBackLabel(status: OrderStatus): string | null {
  switch (status) {
    case "confirmed":
      return "Back";
    case "out_for_delivery":
      return "Back to At laundry";
    case "delivered":
      return "Back to On delivery";
    default:
      return null;
  }
}

/** True once the order has been charged at pickup (cannot undo to stop). */
export function isOrderCharged(order: {
  status: OrderStatus;
  finalTotal?: number | null;
}): boolean {
  if (order.finalTotal != null) return true;
  return (
    order.status === "picked_up" ||
    order.status === "weighed" ||
    order.status === "washing" ||
    order.status === "out_for_delivery" ||
    order.status === "delivered"
  );
}

/** Visual pipeline (ops + customer). */
export const ORDER_PIPELINE_STEPS = [
  {
    id: "waiting",
    label: "Pickup",
    statuses: ["new", "confirmed"],
    preview:
      "I’m on the way → at the stop: weigh, photo, dry-clean, then charge.",
  },
  {
    id: "progress",
    label: "At laundry",
    statuses: ["picked_up", "weighed", "washing"],
    preview: "Collected and being cleaned at the plant.",
  },
  {
    id: "delivery",
    label: "On delivery",
    statuses: ["out_for_delivery"],
    preview: "Delivering today. Photo at the door, then confirm.",
  },
  {
    id: "done",
    label: "Complete",
    statuses: ["delivered"],
    preview: "Order closed.",
  },
] as const;

/** Plant wash only — excludes out_for_delivery (use Ready filter). */
export function isWashingOrder(status: OrderStatus) {
  return (
    status === "picked_up" ||
    status === "weighed" ||
    status === "washing"
  );
}

export function isReadyForDelivery(status: OrderStatus) {
  return status === "out_for_delivery";
}

/** Compact badge label for ops list cards. */
export function orderListBadge(status: OrderStatus): string {
  switch (status) {
    case "new":
      return "Waiting";
    case "confirmed":
      return "En route";
    case "picked_up":
    case "weighed":
    case "washing":
      return "In progress";
    case "out_for_delivery":
      return "Out for delivery";
    case "delivered":
      return "Delivered";
    case "cancelled":
      return "Cancelled";
    default:
      return ORDER_STATUS_LABELS[status];
  }
}

export function orderRefFromId(orderId: string) {
  let hash = 2166136261;
  for (let i = 0; i < orderId.length; i++) {
    hash ^= orderId.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const n = 10000000 + ((hash >>> 0) % 90000000);
  return String(n);
}

export function orderDisplayId(id: string) {
  return `#${orderRefFromId(id)}`;
}

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

export function isDoneOrder(status: OrderStatus) {
  return status === "delivered" || status === "cancelled";
}

/** Ops “today” in Las Vegas (service city). */
export function opsTodayIso(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** Sort key for pickup slots like "7am - 10am". Unknown slots go last. */
export function pickupSlotSortKey(slot: string): number {
  const match = slot.trim().match(/^(\d{1,2})\s*(am|pm)/i);
  if (!match) return 99;
  let hour = Number(match[1]);
  const meridiem = match[2].toLowerCase();
  if (meridiem === "pm" && hour < 12) hour += 12;
  if (meridiem === "am" && hour === 12) hour = 0;
  return hour;
}

export function compareOrdersByPickupSchedule(a: FoamOrder, b: FoamOrder): number {
  const dateCmp = (a.pickup.date || "").localeCompare(b.pickup.date || "");
  if (dateCmp !== 0) return dateCmp;
  const slotCmp = pickupSlotSortKey(a.pickup.slot) - pickupSlotSortKey(b.pickup.slot);
  if (slotCmp !== 0) return slotCmp;
  return (a.pickup.slot || "").localeCompare(b.pickup.slot || "");
}

/** Today's pickups still waiting (includes overdue so ops doesn't miss them). */
export function isWaitingTodayOrder(order: FoamOrder, today = opsTodayIso()) {
  if (!isWaitingForPickup(order.status)) return false;
  const date = order.pickup.date || "";
  return !date || date <= today;
}

/** Scheduled pickups after today, still waiting. */
export function isFuturePickupOrder(order: FoamOrder, today = opsTodayIso()) {
  if (!isWaitingForPickup(order.status)) return false;
  const date = order.pickup.date || "";
  return Boolean(date && date > today);
}

/** Driver left the depot / plant and is heading to collect bags. */
export function isEnRouteToPickup(status: OrderStatus) {
  return status === "confirmed";
}

export function isCollectedStage(status: OrderStatus) {
  return status === "picked_up" || status === "weighed";
}

/** After charge — plant / wash / drop-off until delivered. */
export function isInProgressOrder(status: OrderStatus) {
  return (
    status === "picked_up" ||
    status === "weighed" ||
    status === "washing" ||
    status === "out_for_delivery"
  );
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
  /** Unguessable key for public /track?k=… page */
  trackKey?: string;
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
