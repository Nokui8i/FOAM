import type { OrderStatus } from "@/lib/orders";
import {
  ORDER_PIPELINE_STEPS,
  orderPipelineIndex,
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
    label: "In progress",
    hint: "Your bags are at the plant and being cleaned.",
  },
  delivery: {
    label: "Out for delivery",
    hint: "On the way back to you.",
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
  updatedAt?: unknown;
  createdAt?: unknown;
};

export function makeTrackKey() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function orderRefFromId(orderId: string) {
  return orderId.slice(0, 8).toUpperCase();
}

export function firstNameFromContact(name: string) {
  const part = name.trim().split(/\s+/)[0] ?? "";
  return part.slice(0, 40);
}

export function trackPath(trackKey: string) {
  return `/track?k=${encodeURIComponent(trackKey)}`;
}

export function customerPipelineSteps(status: OrderStatus) {
  const active = orderPipelineIndex(status);
  const cancelled = status === "cancelled";

  return ORDER_PIPELINE_STEPS.map((step, index) => {
    const copy = CUSTOMER_PIPELINE_LABELS[step.id];
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
      label: copy.label,
      hint: copy.hint,
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
  };
}
