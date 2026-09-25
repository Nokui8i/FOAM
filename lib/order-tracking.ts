import type { OrderStatus, OrderPhoto } from "@/lib/orders";
import {
  ORDER_PIPELINE_STEPS,
  orderPipelineIndex,
  orderRefFromId,
} from "@/lib/orders";

/** Customer-facing stage labels (ops uses different wording). */
export const CUSTOMER_PIPELINE_LABELS: Record<
  (typeof ORDER_PIPELINE_STEPS)[number]["id"],
  { label: string; hint: string }
> = {
  waiting: {
    label: "Waiting for pickup",
    hint: "Scheduled — we’ll collect your bags in the pickup window.",
  },
  progress: {
    label: "At the laundry",
    hint: "Collected and being cleaned.",
  },
  delivery: {
    label: "On delivery",
    hint: "Your order is on the way back to you today.",
  },
  done: {
    label: "Delivered",
    hint: "All done — thanks for choosing FOAM.",
  },
};

export type OrderTrackSnapshot = {
  orderId: string;
  ref: string;
  status: OrderStatus;
  firstName: string;
  pickupDate: string;
  pickupSlot: string;
  laundry: boolean;
  dryCleaning: boolean;
  bagCount: number;
  preferences?: Record<string, string>;
  orderNotes?: string;
  pickupNotes?: string;
  /** Customer-visible ops photos (scale + delivery proof). */
  photos?: OrderPhoto[];
  weightLbs?: number | null;
  finalTotal?: number | null;
  updatedAt?: unknown;
  createdAt?: unknown;
};

export function makeTrackKey() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function firstNameFromContact(name: string) {
  const part = name.trim().split(/\s+/)[0] ?? "";
  return part.slice(0, 40);
}

export { orderRefFromId };

export function trackPath(trackKey: string) {
  return `/track?k=${encodeURIComponent(trackKey)}`;
}

/** Photos safe to show on the public tracking page. */
export function customerVisiblePhotos(photos?: OrderPhoto[] | null) {
  if (!photos?.length) return [];
  return photos.filter(
    (photo) =>
      photo &&
      typeof photo.url === "string" &&
      photo.url.length > 0 &&
      (photo.kind === "weight" || photo.kind === "return")
  );
}

export function customerPipelineSteps(status: OrderStatus) {
  const active = orderPipelineIndex(status);
  const cancelled = status === "cancelled";

  return ORDER_PIPELINE_STEPS.map((step, index) => {
    const copy = CUSTOMER_PIPELINE_LABELS[step.id];
    let label = copy.label;
    let hint = copy.hint;
    if (step.id === "waiting" && status === "confirmed") {
      label = "Driver on the way";
      hint = "Your courier is heading to pick up your bags.";
    }
    let state: "done" | "active" | "upcoming" | "cancelled" = "upcoming";
    if (cancelled) {
      state = index === 0 ? "cancelled" : "upcoming";
    } else if (active < 0) {
      state = "upcoming";
    } else if (index < active) {
      state = "done";
    } else if (index === active) {
      state = "active";
    }
    return {
      id: step.id,
      label,
      hint,
      state,
    };
  });
}

export function buildOrderTrackDoc(opts: {
  orderId: string;
  status: OrderStatus;
  name: string;
  pickupDate: string;
  pickupSlot: string;
  laundry: boolean;
  dryCleaning: boolean;
  bagCount: number;
  preferences?: Record<string, string>;
  orderNotes?: string;
  pickupNotes?: string;
}): Omit<OrderTrackSnapshot, "updatedAt" | "createdAt"> {
  return {
    orderId: opts.orderId,
    ref: orderRefFromId(opts.orderId),
    status: opts.status,
    firstName: firstNameFromContact(opts.name),
    pickupDate: opts.pickupDate,
    pickupSlot: opts.pickupSlot,
    laundry: opts.laundry,
    dryCleaning: opts.dryCleaning,
    bagCount: opts.bagCount,
    preferences: opts.preferences ?? {},
    orderNotes: opts.orderNotes ?? "",
    pickupNotes: opts.pickupNotes ?? "",
  };
}
