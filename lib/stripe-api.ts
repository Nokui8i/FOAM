import { getFunctions, httpsCallable, type Functions } from "firebase/functions";

import {
  getFirebaseApp,
  getStaffFirebaseApp,
  isStaffBackendBound,
} from "@/lib/firebase";

function activeFunctions(): Functions {
  const app = isStaffBackendBound()
    ? getStaffFirebaseApp()
    : getFirebaseApp();
  return getFunctions(app, "us-central1");
}

export type SetupIntentResult = {
  clientSecret: string;
  customerId: string;
};

export type SavedCardResult = {
  brand: string;
  last4: string;
  expMonth: number | null;
  expYear: number | null;
};

export type ChargeOrderResult = {
  ok: true;
  paymentStatus: "paid" | "pending";
  paymentIntentId: string;
  finalTotal: number;
};

export async function createSetupIntent(name?: string) {
  const callable = httpsCallable<
    { name?: string },
    SetupIntentResult
  >(activeFunctions(), "createSetupIntent");
  const res = await callable({ name: name || undefined });
  return res.data;
}

export async function confirmCardSaved(setupIntentId: string) {
  const callable = httpsCallable<
    { setupIntentId: string },
    SavedCardResult
  >(activeFunctions(), "confirmCardSaved");
  const res = await callable({ setupIntentId });
  return res.data;
}

export async function removeSavedCard() {
  const callable = httpsCallable(activeFunctions(), "removeSavedCard");
  await callable({});
}

export async function chargeOrder(input: {
  orderId: string;
  weightLbs?: number;
  dryCleanItems?: Array<{ name?: string; qty?: number; price?: number }>;
  finalTotal: number;
  promoCodeUsed?: string;
  promoDiscountAmount?: number;
  promoLabel?: string;
}) {
  const callable = httpsCallable<typeof input, ChargeOrderResult>(
    activeFunctions(),
    "chargeOrder"
  );
  const res = await callable(input);
  return res.data;
}

export function stripeCallableErrorMessage(err: unknown): string {
  if (err && typeof err === "object" && "message" in err) {
    const message = String((err as { message?: string }).message || "");
    if (message) return message;
  }
  return "Payment request failed. Try again.";
}
