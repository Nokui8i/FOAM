import {
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";

import {
  DELIVERY_FEE_USD,
  MIN_ORDER_USD,
  RATE_STANDARD_PER_LB_USD,
  RATE_WEEKLY_PER_LB_USD,
} from "@/lib/booking";
import { getFirebaseDb } from "@/lib/firebase";

export type LaundryRates = {
  weeklyPerLb: number;
  standardPerLb: number;
  deliveryFee: number;
  minimumOrder: number;
};

export const DEFAULT_LAUNDRY_RATES: LaundryRates = {
  weeklyPerLb: RATE_WEEKLY_PER_LB_USD,
  standardPerLb: RATE_STANDARD_PER_LB_USD,
  deliveryFee: DELIVERY_FEE_USD,
  minimumOrder: MIN_ORDER_USD,
};

function clampRate(value: unknown, fallback: number) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.round(n * 100) / 100;
}

export function normalizeLaundryRates(
  raw?: Record<string, unknown> | null
): LaundryRates {
  return {
    weeklyPerLb: clampRate(raw?.weeklyPerLb, DEFAULT_LAUNDRY_RATES.weeklyPerLb),
    standardPerLb: clampRate(
      raw?.standardPerLb,
      DEFAULT_LAUNDRY_RATES.standardPerLb
    ),
    deliveryFee: clampRate(raw?.deliveryFee, DEFAULT_LAUNDRY_RATES.deliveryFee),
    minimumOrder: clampRate(
      raw?.minimumOrder,
      DEFAULT_LAUNDRY_RATES.minimumOrder
    ),
  };
}

export function formatRateUsd(amount: number) {
  return `$${Number(amount).toFixed(2)}`;
}

export function subscribeLaundryRates(onChange: (rates: LaundryRates) => void) {
  return onSnapshot(
    doc(getFirebaseDb(), "config", "laundryRates"),
    (snap) => {
      onChange(
        normalizeLaundryRates(
          snap.exists() ? (snap.data() as Record<string, unknown>) : null
        )
      );
    },
    () => onChange({ ...DEFAULT_LAUNDRY_RATES })
  );
}

export async function loadLaundryRates(): Promise<LaundryRates> {
  try {
    const snap = await getDoc(doc(getFirebaseDb(), "config", "laundryRates"));
    return normalizeLaundryRates(
      snap.exists() ? (snap.data() as Record<string, unknown>) : null
    );
  } catch {
    return { ...DEFAULT_LAUNDRY_RATES };
  }
}

export async function saveLaundryRates(
  rates: LaundryRates,
  adminEmail: string
) {
  const cleaned = normalizeLaundryRates(rates as unknown as Record<string, unknown>);
  if (cleaned.weeklyPerLb >= cleaned.standardPerLb) {
    throw new Error("Weekly rate should be lower than on-demand.");
  }
  await setDoc(
    doc(getFirebaseDb(), "config", "laundryRates"),
    {
      ...cleaned,
      updatedAt: serverTimestamp(),
      updatedBy: adminEmail || "admin",
    },
    { merge: true }
  );
  return cleaned;
}
