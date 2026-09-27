import { opsTodayIso, type FoamOrder } from "@/lib/orders";
import type { PickupReminderAlert } from "@/lib/admin-alerts";
import { addDaysToYmd } from "@/lib/weekly-automation";

/** Temporary volume fill so Ops lists / Payments can be reviewed at scale. */
export const OPS_DEMO_VOLUME = 30;

export function isOpsDemoId(id: string) {
  return id.startsWith("demo-");
}

const SLOTS = ["7am - 10am", "10am - 1pm", "1pm - 4pm", "4pm - 7pm"] as const;

function demoStamp() {
  return {
    toDate: () => new Date(),
  };
}

function baseDemoOrder(
  kind: "orders" | "future" | "history",
  index: number,
  status: FoamOrder["status"],
  pickupDate: string
): FoamOrder {
  const n = String(index + 1).padStart(2, "0");
  const slot = SLOTS[index % SLOTS.length];
  return {
    id: `demo-${kind}-${n}`,
    status,
    guest: true,
    uid: null,
    services: {
      laundry: true,
      dryCleaning: index % 3 === 0,
      bagCount: 1 + (index % 4),
    },
    contact: {
      name: `DEMO ${kind} ${n}`,
      email: `demo.${kind}.${n}@example.com`,
      phone: `702555${String(1000 + index).slice(-4)}`,
    },
    pickup: {
      address: `${3700 + index} Demo Las Vegas Blvd`,
      unit: String(100 + index),
      city: "Las Vegas",
      zip: "89109",
      notes: `DEMO ${kind} #${n}`,
      date: pickupDate,
      slot,
      repeat: kind === "future",
      repeatRequested: kind === "future",
    },
    preferences: {
      pants: "Folded",
      dresses: "Folded",
      detergent: "All Free and Clear",
      softener: "No softener",
    },
    orderNotes: `DEMO volume row — ${kind} #${n}`,
    pricing: {
      mode: "per_lb",
      tier: kind === "future" ? "weekly" : "standard",
      laundryRatePerLb: kind === "future" ? 2.35 : 2.6,
      deliveryFee: 5,
      minimumOrder: 50,
      tip: 0,
      finalTotalPending: status !== "delivered",
      repeatDiscountEligible: kind === "future",
      repeatDiscountPercent: kind === "future" ? 10 : 0,
    },
    tip: 0,
    promoCode: "",
    weightLbs: status === "delivered" ? 12 + (index % 8) : null,
    finalTotal: status === "delivered" ? 40 + index * 1.25 : null,
    dryCleanItems: [],
    photos: [],
    trackKey: undefined,
    createdAt: demoStamp(),
    statusUpdatedAt: demoStamp(),
    opsIssue: "",
    opsNotes: "",
    refundStatus: "none",
    refundAmount: null,
    cancelReason: "",
  };
}

export function buildDemoOrdersVolume(count = OPS_DEMO_VOLUME): FoamOrder[] {
  const today = opsTodayIso();
  const futureDate = addDaysToYmd(today, 3);
  const historyDate = addDaysToYmd(today, -5);
  const rows: FoamOrder[] = [];
  for (let i = 0; i < count; i++) {
    rows.push(baseDemoOrder("orders", i, "new", today));
    rows.push(baseDemoOrder("future", i, "new", futureDate));
    rows.push(baseDemoOrder("history", i, "delivered", historyDate));
  }
  return rows;
}

export function buildDemoAlertsVolume(
  count = OPS_DEMO_VOLUME
): PickupReminderAlert[] {
  const today = opsTodayIso();
  const pickupDate = addDaysToYmd(today, 3);
  return Array.from({ length: count }, (_, index) => {
    const n = String(index + 1).padStart(2, "0");
    const slot = SLOTS[index % SLOTS.length];
    return {
      orderId: `demo-alerts-${n}`,
      trackKey: undefined,
      name: `DEMO alert ${n}`,
      phone: `702555${String(3000 + index).slice(-4)}`,
      email: `demo.alert.${n}@example.com`,
      address: `${3800 + index} Demo Las Vegas Blvd, Las Vegas 89109`,
      pickupDate,
      pickupSlot: slot,
      daysUntil: 3,
      weekly: true,
      automatedWeekly: true,
      hasDiscount: true,
      status: "new",
      contacted: false,
      contactedAt: null,
      contactedBy: null,
    };
  });
}

export type DemoSupportRow = {
  id: string;
  name: string;
  email: string;
  phone: string;
  topic: string;
  message: string;
  status: "new" | "done";
  read: boolean;
  createdAt: { toDate: () => Date } | null;
};

export function buildDemoSupportVolume(
  count = OPS_DEMO_VOLUME
): DemoSupportRow[] {
  return Array.from({ length: count }, (_, index) => {
    const n = String(index + 1).padStart(2, "0");
    return {
      id: `demo-support-${n}`,
      name: `DEMO support ${n}`,
      email: `demo.support.${n}@example.com`,
      phone: `702555${String(2000 + index).slice(-4)}`,
      topic: `DEMO support #${n}`,
      message: `Hi FOAM — DEMO support message #${n}. Please help with scheduling.`,
      status: "new",
      read: false,
      createdAt: demoStamp(),
    };
  });
}

export function mergeDemoOrders(real: FoamOrder[]): FoamOrder[] {
  const demo = buildDemoOrdersVolume();
  const realIds = new Set(real.map((row) => row.id));
  return [...real, ...demo.filter((row) => !realIds.has(row.id))];
}

export function mergeDemoAlerts(
  real: PickupReminderAlert[]
): PickupReminderAlert[] {
  const demo = buildDemoAlertsVolume();
  const realIds = new Set(real.map((row) => row.orderId));
  return [...real, ...demo.filter((row) => !realIds.has(row.orderId))];
}

export function mergeDemoSupport<T extends { id: string }>(
  real: T[],
  demo: T[]
): T[] {
  const realIds = new Set(real.map((row) => row.id));
  return [...real, ...demo.filter((row) => !realIds.has(row.id))];
}
