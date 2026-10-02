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

export async function createGuestSetupIntent(email: string, name?: string) {
  const callable = httpsCallable<
    { email: string; name?: string },
    SetupIntentResult
  >(activeFunctions(), "createGuestSetupIntent");
  const res = await callable({ email, name: name || undefined });
  return res.data;
}

export type GuestCardResult = SavedCardResult & {
  customerId: string;
  paymentMethodId: string;
};

export async function confirmGuestCardSaved(setupIntentId: string) {
  const callable = httpsCallable<{ setupIntentId: string }, GuestCardResult>(
    activeFunctions(),
    "confirmGuestCardSaved"
  );
  const res = await callable({ setupIntentId });
  return res.data;
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

export type OnSpotPaymentIntentResult = {
  clientSecret: string;
  paymentIntentId: string;
  customerId: string;
  finalTotal: number;
};

export async function createOnSpotPaymentIntent(input: {
  orderId: string;
  weightLbs?: number;
  dryCleanItems?: Array<{ name?: string; qty?: number; price?: number }>;
  finalTotal: number;
  promoCodeUsed?: string;
  promoDiscountAmount?: number;
  promoLabel?: string;
}) {
  const callable = httpsCallable<typeof input, OnSpotPaymentIntentResult>(
    activeFunctions(),
    "createOnSpotPaymentIntent"
  );
  const res = await callable(input);
  return res.data;
}

export type FinalizeOnSpotResult = ChargeOrderResult & {
  brand?: string;
  last4?: string;
};

export async function finalizeOnSpotCharge(input: {
  orderId: string;
  paymentIntentId: string;
}) {
  const callable = httpsCallable<typeof input, FinalizeOnSpotResult>(
    activeFunctions(),
    "finalizeOnSpotCharge"
  );
  const res = await callable(input);
  return res.data;
}

export async function chargeOrderMore(input: {
  orderId: string;
  amount: number;
}) {
  const callable = httpsCallable<
    typeof input,
    {
      ok: true;
      paymentStatus: "paid" | "pending";
      paymentIntentId: string;
      amount: number;
      finalTotal: number;
    }
  >(activeFunctions(), "chargeOrderMore");
  const res = await callable(input);
  return res.data;
}

export async function refundOrder(input: {
  orderId: string;
  amount?: number;
  reason?: string;
}) {
  const callable = httpsCallable<
    typeof input,
    { ok: true; refundId: string; amount: number; remaining?: number }
  >(activeFunctions(), "refundOrder");
  const res = await callable(input);
  return res.data;
}

export function stripeCallableErrorMessage(err: unknown): string {
  const obj = err && typeof err === "object" ? (err as Record<string, unknown>) : null;
  const raw = obj && typeof obj.message === "string" ? obj.message.trim() : "";
  const code = obj && typeof obj.code === "string" ? obj.code : "";
  const details =
    obj && obj.details != null
      ? typeof obj.details === "string"
        ? obj.details
        : JSON.stringify(obj.details)
      : "";

  const combined = `${raw} ${details} ${code}`.toLowerCase();

  if (
    combined.includes("fraudulent") ||
    combined.includes("highest_risk_level") ||
    combined.includes("blocked")
  ) {
    return "Card blocked as fraudulent. Try charging a different card on the spot, or ask the customer to update Account → Payments.";
  }
  if (
    combined.includes("card_declined") ||
    combined.includes("generic_decline") ||
    combined.includes("do_not_honor") ||
    combined.includes("insufficient_funds") ||
    (combined.includes("declined") && combined.includes("card"))
  ) {
    return "Card declined by the bank. Charge a different card on the spot, or ask the customer to update Account → Payments.";
  }
  if (
    combined.includes("authentication_required") ||
    combined.includes("requires_action") ||
    combined.includes("3ds")
  ) {
    return "Card needs customer verification (3D Secure). Charge a different card on the spot, or ask them to re-add the card while signed in.";
  }
  if (combined.includes("no card on file") || combined.includes("guest order has no card")) {
    return raw || "No card on file. Charge a different card on the spot, or ask the customer to add one in Account → Payments.";
  }

  const cleaned = raw
    .replace(/^Firebase:\s*/i, "")
    .replace(/\s*\([^)]*\)\.?\s*$/g, "")
    .trim();

  if (
    cleaned &&
    cleaned.toLowerCase() !== "internal" &&
    !cleaned.toLowerCase().includes("internal error")
  ) {
    return cleaned.startsWith("Payment") || /card|declin|stripe|charg/i.test(cleaned)
      ? cleaned
      : `Payment failed: ${cleaned}`;
  }

  return "Payment failed. Ask the customer to update their card, then try again.";
}

