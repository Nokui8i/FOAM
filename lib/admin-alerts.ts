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
  const weeklyBit = alert.weekly
    ? " This is your weekly FOAM pickup."
    : "";
  return `Hi ${first}, this is FOAM — friendly reminder that your laundry pickup is scheduled for ${alert.pickupDate}${alert.pickupSlot ? ` (${alert.pickupSlot})` : ""}.${weeklyBit} Please leave your bags ready. Reply if you need to skip or change anything.`;
}
