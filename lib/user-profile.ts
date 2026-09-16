import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";

import { getFirebaseDb } from "@/lib/firebase";

export const DETERGENT_OPTIONS = [
  "Standard Scented",
  "Hypoallergenic",
  "Organic",
  "Provide your own",
] as const;

export const SOFTENER_OPTIONS = [
  "Standard",
  "Hypoallergenic",
  "None",
] as const;

export const WASH_TEMP_OPTIONS = ["Cold", "Warm", "Hot"] as const;
export const DRYER_TEMP_OPTIONS = ["Low", "Medium", "High"] as const;
export const FOLD_OPTIONS = [
  "Standard fold",
  "Hang shirts when possible",
  "Fold everything",
] as const;

export type UserProfile = {
  uid: string;
  email: string;
  name: string;
  phone: string;
  address: string;
  unit: string;
  city: string;
  zip: string;
  pickupNotes: string;
  detergent: string;
  softener: string;
  washTemp: string;
  dryerTemp: string;
  foldStyle: string;
  separateColors: boolean;
  careNotes: string;
  /** Weekly automated pickups — cancel anytime from Account. */
  weeklyRepeatEnabled: boolean;
};

export function defaultProfile(uid: string, email: string): UserProfile {
  return {
    uid,
    email,
    name: "",
    phone: "",
    address: "",
    unit: "",
    city: "Las Vegas",
    zip: "",
    pickupNotes: "",
    detergent: "Standard Scented",
    softener: "Standard",
    washTemp: "Cold",
    dryerTemp: "Medium",
    foldStyle: "Standard fold",
    separateColors: false,
    careNotes: "",
    weeklyRepeatEnabled: false,
  };
}

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const snap = await getDoc(doc(getFirebaseDb(), "users", uid));
  if (!snap.exists()) return null;
  const data = snap.data();
  const base = defaultProfile(uid, String(data.email ?? ""));
  return {
    ...base,
    email: String(data.email ?? ""),
    name: String(data.name ?? ""),
    phone: String(data.phone ?? ""),
    address: String(data.address ?? ""),
    unit: String(data.unit ?? ""),
    city: String(data.city ?? ""),
    zip: String(data.zip ?? ""),
    pickupNotes: String(data.pickupNotes ?? ""),
    detergent: String(data.detergent ?? base.detergent),
    softener: String(data.softener ?? base.softener),
    washTemp: String(data.washTemp ?? base.washTemp),
    dryerTemp: String(data.dryerTemp ?? base.dryerTemp),
    foldStyle: String(data.foldStyle ?? base.foldStyle),
    separateColors: Boolean(data.separateColors),
    careNotes: String(data.careNotes ?? ""),
    weeklyRepeatEnabled: Boolean(data.weeklyRepeatEnabled),
  };
}

export async function saveUserProfile(
  uid: string,
  input: Omit<UserProfile, "uid">
) {
  await setDoc(
    doc(getFirebaseDb(), "users", uid),
    {
      uid,
      email: input.email.trim(),
      name: input.name.trim(),
      phone: input.phone.trim(),
      address: input.address.trim(),
      unit: input.unit.trim(),
      city: input.city.trim(),
      zip: input.zip.trim(),
      pickupNotes: input.pickupNotes.trim(),
      detergent: input.detergent.trim(),
      softener: input.softener.trim(),
      washTemp: input.washTemp.trim(),
      dryerTemp: input.dryerTemp.trim(),
      foldStyle: input.foldStyle.trim(),
      separateColors: Boolean(input.separateColors),
      careNotes: input.careNotes.trim(),
      weeklyRepeatEnabled: Boolean(input.weeklyRepeatEnabled),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}
