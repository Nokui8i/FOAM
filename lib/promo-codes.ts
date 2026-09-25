import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  increment,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  type Timestamp,
} from "firebase/firestore";

import { bookingTodayIso } from "@/lib/booking";
import { getFirebaseDb } from "@/lib/firebase";

export type PromoDiscountType = "percent" | "fixed";
export type PromoLimitMode = "uses" | "expires";

export type PromoCode = {
  id: string;
  code: string;
  discountType: PromoDiscountType;
  discountValue: number;
  limitMode: PromoLimitMode;
  maxUses: number | null;
  usedCount: number;
  /** Inclusive end date YYYY-MM-DD (Las Vegas calendar). */
  expiresAt: string | null;
  active: boolean;
  note: string;
  createdBy: string;
  updatedBy: string;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
};

export type PromoValidation =
  | { ok: true; promo: PromoCode; label: string }
  | { ok: false; reason: string };

function normalizeCode(raw: string) {
  return raw.trim().toUpperCase().replace(/\s+/g, "");
}

export function promoDocId(code: string) {
  return normalizeCode(code);
}

export function formatPromoLabel(promo: Pick<PromoCode, "discountType" | "discountValue">) {
  if (promo.discountType === "percent") {
    return `${promo.discountValue}% off`;
  }
  return `$${Number(promo.discountValue).toFixed(2)} off`;
}

export function promoDiscountAmount(
  subtotal: number,
  promo: Pick<PromoCode, "discountType" | "discountValue">
) {
  if (!(subtotal > 0)) return 0;
  if (promo.discountType === "percent") {
    const pct = Math.min(100, Math.max(0, promo.discountValue));
    return Math.round(subtotal * (pct / 100) * 100) / 100;
  }
  return Math.min(subtotal, Math.round(Math.max(0, promo.discountValue) * 100) / 100);
}

function mapPromo(
  id: string,
  data: Record<string, unknown>
): PromoCode | null {
  const code = normalizeCode(String(data.code ?? id));
  if (!code) return null;
  const discountType =
    data.discountType === "fixed" ? "fixed" : "percent";
  const discountValue = Number(data.discountValue);
  if (!Number.isFinite(discountValue) || discountValue <= 0) return null;
  const limitMode = data.limitMode === "expires" ? "expires" : "uses";
  const maxUsesRaw = Number(data.maxUses);
  const maxUses =
    limitMode === "uses" && Number.isFinite(maxUsesRaw) && maxUsesRaw > 0
      ? Math.floor(maxUsesRaw)
      : null;
  const expiresAt =
    typeof data.expiresAt === "string" && /^\d{4}-\d{2}-\d{2}$/.test(data.expiresAt)
      ? data.expiresAt
      : null;
  const usedCount = Math.max(0, Math.floor(Number(data.usedCount) || 0));

  return {
    id,
    code,
    discountType,
    discountValue:
      discountType === "percent"
        ? Math.min(100, Math.round(discountValue * 100) / 100)
        : Math.round(discountValue * 100) / 100,
    limitMode,
    maxUses,
    usedCount,
    expiresAt,
    active: data.active !== false,
    note: typeof data.note === "string" ? data.note.trim() : "",
    createdBy: typeof data.createdBy === "string" ? data.createdBy : "",
    updatedBy: typeof data.updatedBy === "string" ? data.updatedBy : "",
    createdAt: (data.createdAt as Timestamp | null | undefined) ?? null,
    updatedAt: (data.updatedAt as Timestamp | null | undefined) ?? null,
  };
}

export function isPromoCurrentlyValid(
  promo: PromoCode,
  todayIso = bookingTodayIso()
): PromoValidation {
  if (!promo.active) {
    return { ok: false, reason: "This promo code is inactive." };
  }
  if (promo.limitMode === "expires") {
    if (!promo.expiresAt) {
      return { ok: false, reason: "This promo code has no end date." };
    }
    if (promo.expiresAt < todayIso) {
      return { ok: false, reason: "This promo code has expired." };
    }
  }
  if (promo.limitMode === "uses") {
    if (!promo.maxUses || promo.maxUses < 1) {
      return { ok: false, reason: "This promo code has no uses left." };
    }
    if (promo.usedCount >= promo.maxUses) {
      return { ok: false, reason: "This promo code has reached its use limit." };
    }
  }
  return { ok: true, promo, label: formatPromoLabel(promo) };
}

export function subscribePromoCodes(onChange: (rows: PromoCode[]) => void) {
  return onSnapshot(
    collection(getFirebaseDb(), "promoCodes"),
    (snap) => {
      const rows: PromoCode[] = [];
      for (const docSnap of snap.docs) {
        const mapped = mapPromo(
          docSnap.id,
          docSnap.data() as Record<string, unknown>
        );
        if (mapped) rows.push(mapped);
      }
      rows.sort((a, b) => a.code.localeCompare(b.code));
      onChange(rows);
    },
    () => onChange([])
  );
}

export async function loadPromoCode(code: string): Promise<PromoCode | null> {
  const id = promoDocId(code);
  if (!id) return null;
  try {
    const snap = await getDoc(doc(getFirebaseDb(), "promoCodes", id));
    if (!snap.exists()) return null;
    return mapPromo(snap.id, snap.data() as Record<string, unknown>);
  } catch {
    return null;
  }
}

export async function validatePromoCode(
  code: string
): Promise<PromoValidation> {
  const normalized = normalizeCode(code);
  if (!normalized) {
    return { ok: false, reason: "Enter a promo code." };
  }
  const promo = await loadPromoCode(normalized);
  if (!promo) {
    return { ok: false, reason: "Promo code not found." };
  }
  return isPromoCurrentlyValid(promo);
}

export type SavePromoInput = {
  code: string;
  discountType: PromoDiscountType;
  discountValue: number;
  limitMode: PromoLimitMode;
  maxUses: number | null;
  expiresAt: string | null;
  active: boolean;
  note?: string;
};

export async function savePromoCode(
  input: SavePromoInput,
  adminEmail: string
) {
  const code = normalizeCode(input.code);
  if (!/^[A-Z0-9][A-Z0-9_-]{1,23}$/.test(code)) {
    throw new Error(
      "Code must be 2–24 characters: letters, numbers, - or _."
    );
  }
  if (!(input.discountValue > 0)) {
    throw new Error("Enter a discount greater than zero.");
  }
  if (input.discountType === "percent" && input.discountValue > 100) {
    throw new Error("Percent discount cannot exceed 100.");
  }
  if (input.limitMode === "uses") {
    if (!input.maxUses || input.maxUses < 1) {
      throw new Error("Enter how many times this code can be used.");
    }
  }
  if (input.limitMode === "expires") {
    if (!input.expiresAt || !/^\d{4}-\d{2}-\d{2}$/.test(input.expiresAt)) {
      throw new Error("Pick an end date for this code.");
    }
  }

  const id = promoDocId(code);
  const ref = doc(getFirebaseDb(), "promoCodes", id);
  const existing = await getDoc(ref);
  const usedCount = existing.exists()
    ? Math.max(0, Math.floor(Number(existing.data()?.usedCount) || 0))
    : 0;

  const payload = {
    code,
    discountType: input.discountType,
    discountValue:
      input.discountType === "percent"
        ? Math.min(100, Math.round(input.discountValue * 100) / 100)
        : Math.round(input.discountValue * 100) / 100,
    limitMode: input.limitMode,
    maxUses: input.limitMode === "uses" ? Math.floor(input.maxUses!) : null,
    expiresAt: input.limitMode === "expires" ? input.expiresAt : null,
    usedCount,
    active: input.active !== false,
    note: (input.note ?? "").trim().slice(0, 200),
    updatedAt: serverTimestamp(),
    updatedBy: adminEmail || "admin",
    ...(existing.exists()
      ? {}
      : {
          createdAt: serverTimestamp(),
          createdBy: adminEmail || "admin",
        }),
  };

  await setDoc(ref, payload, { merge: true });
  return id;
}

export async function setPromoActive(code: string, active: boolean, adminEmail: string) {
  const id = promoDocId(code);
  await updateDoc(doc(getFirebaseDb(), "promoCodes", id), {
    active,
    updatedAt: serverTimestamp(),
    updatedBy: adminEmail || "admin",
  });
}

export async function deletePromoCode(code: string) {
  await deleteDoc(doc(getFirebaseDb(), "promoCodes", promoDocId(code)));
}

/** Count one redemption when an order is charged with this promo. */
export async function recordPromoUse(code: string) {
  const id = promoDocId(code);
  if (!id) return;
  try {
    await updateDoc(doc(getFirebaseDb(), "promoCodes", id), {
      usedCount: increment(1),
      updatedAt: serverTimestamp(),
    });
  } catch {
    /* best-effort; charge should still succeed */
  }
}
