const RECEIPT_EMAIL =
  /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;

/** Normalize a stored FOAM email. Returns null when it cannot be used for a Stripe receipt. */
export function normalizeReceiptEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  if (email.length < 3 || email.length > 200) return null;
  if (!RECEIPT_EMAIL.test(email)) return null;
  return email;
}

export type ReceiptEmailInput = {
  /** Empty for a guest order. */
  accountUid: string;
  authEmail: string;
  authEmailVerified: boolean;
  profileEmail: string;
  /** Email already stored on the order. Never a payment-request field. */
  orderContactEmail: string;
};

/**
 * Choose the receipt address from FOAM records.
 * Signed-in customers use the verified Auth email, or the same address stored
 * on their profile. Guests use the order contact email. No address is invented.
 */
export function resolveReceiptEmail(input: ReceiptEmailInput): string | null {
  const auth = normalizeReceiptEmail(input.authEmail);
  const profile = normalizeReceiptEmail(input.profileEmail);
  const contact = normalizeReceiptEmail(input.orderContactEmail);
  const accountUid = input.accountUid.trim();

  if (!accountUid) return contact;

  if (auth && input.authEmailVerified) return auth;
  if (profile && auth && profile === auth) return profile;
  if (profile && !auth) return profile;
  if (contact && auth && contact === auth) return contact;
  if (contact && profile && contact === profile) return contact;
  if (contact && !auth && !profile) return contact;
  return null;
}

export type ReceiptEmailParams = {
  receipt_email?: string;
};

/**
 * Stripe emails its own receipt when receipt_email is set on PaymentIntent
 * creation, before the payment succeeds. A succeeded PaymentIntent must not
 * be updated with this field, or Stripe can send another receipt.
 */
export function receiptParamsForAttempt(
  email: string | null,
  paymentAlreadySucceeded: boolean
): ReceiptEmailParams {
  if (paymentAlreadySucceeded) return {};
  const normalized = normalizeReceiptEmail(email);
  if (!normalized) return {};
  return { receipt_email: normalized };
}
