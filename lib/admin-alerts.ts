import { daysUntilPickupYmd, todayYmdLasVegas } from "@/lib/weekly-automation";

/** Admin should contact the customer this many days before pickup. */
export const PICKUP_REMINDER_DAYS = [3, 4] as const;

export type PickupReminderAlert = {
  orderId: string;
  uid?: string;
  trackKey?: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  pickupDate: string;
  pickupSlot: string;
  daysUntil: number;
  weekly: boolean;
  automatedWeekly: boolean;
  hasDiscount: boolean;
  status: string;
  contacted: boolean;
  contactedAt?: string | null;
  contactedBy?: string | null;
};

export function isInPickupReminderWindow(
  pickupDate: string,
  today = todayYmdLasVegas()
): { match: boolean; daysUntil: number | null } {
  const daysUntil = daysUntilPickupYmd(pickupDate, today);
  if (daysUntil == null) return { match: false, daysUntil: null };
  return {
    match: (PICKUP_REMINDER_DAYS as readonly number[]).includes(daysUntil),
    daysUntil,
  };
}

export function reminderSortKey(a: PickupReminderAlert, b: PickupReminderAlert) {
  // Soonest first, then uncontacted first
  if (a.daysUntil !== b.daysUntil) return a.daysUntil - b.daysUntil;
  if (a.contacted !== b.contacted) return a.contacted ? 1 : -1;
  return a.pickupDate.localeCompare(b.pickupDate);
}

export function buildReminderMessage(alert: PickupReminderAlert) {
  const first = alert.name.trim().split(/\s+/)[0] || "there";
  const when = [
    alert.pickupDate,
    alert.pickupSlot ? `(${alert.pickupSlot})` : "",
  ]
    .filter(Boolean)
    .join(" ");
  const weeklyBit = alert.weekly || alert.automatedWeekly
    ? " This is your automated weekly FOAM pickup."
    : "";
  return `Hi ${first}, this is FOAM — your laundry pickup is coming up on ${when} at ${alert.address || "your address"}.${weeklyBit} Please confirm you’re ready, or reply if you need to skip or change anything.`;
}

/** Short staff-facing summary for Notifications list cards. */
export function buildNotificationSummary(alert: PickupReminderAlert) {
  const daysLabel =
    alert.daysUntil === 1 ? "1 day" : `${alert.daysUntil} days`;
  if (alert.weekly || alert.automatedWeekly) {
    return `Automated order in ${daysLabel}`;
  }
  return `Order in ${daysLabel}`;
}

/** Full staff instruction shown on the notification detail. */
export function buildStaffNotificationNote(alert: PickupReminderAlert) {
  const daysLabel =
    alert.daysUntil === 1 ? "1 day" : `${alert.daysUntil} days`;
  const address = alert.address.trim() || "No address on file";
  const auto =
    alert.weekly || alert.automatedWeekly
      ? `An automated order came in for ${daysLabel} from now.`
      : `An order came in for ${daysLabel} from now.`;
  const lines = [
    auto,
    `Address: ${address}`,
    "Please call to verify and inform the customer.",
  ];
  if (alert.weekly || alert.automatedWeekly || alert.hasDiscount) {
    lines.push(
      "Explain that if the order is cancelled the 10% discount is cancelled."
    );
  }
  return lines.join("\n");
}
