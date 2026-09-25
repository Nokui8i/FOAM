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

export type LaundryPrefs = {
  pants: string;
  dresses: string;
  detergent: string;
  softener: string;
  whitesWashTemp: string;
  colorsWashTemp: string;
  whitesDryerHeat: string;
  colorsDryerHeat: string;
};

export function defaultLaundryPrefs(): LaundryPrefs {
  return {
    pants: "Folded",
    dresses: "Folded",
    detergent: "Persil",
    softener: "No softener",
    whitesWashTemp: "Cold wash",
    colorsWashTemp: "Cold wash",
    whitesDryerHeat: "Low",
    colorsDryerHeat: "Low",
  };
}

/** Prefer laundryPrefs; fall back to legacy account fields when missing. */
export function resolveLaundryPrefs(profile: UserProfile): LaundryPrefs {
  if (profile.laundryPrefs) {
    return { ...defaultLaundryPrefs(), ...profile.laundryPrefs };
  }

  const wash =
    profile.washTemp === "Warm" || profile.washTemp === "Hot"
      ? "Warm wash"
      : "Cold wash";
  const dryer =
    profile.dryerTemp === "High"
      ? "Regular"
      : profile.dryerTemp === "Low"
        ? "Low"
        : "Low";

  let detergent = "Persil";
  const det = profile.detergent.toLowerCase();
  if (det.includes("hypo") || det.includes("organic") || det.includes("free")) {
    detergent = "All Free and Clear";
  } else if (det.includes("own")) {
    detergent = "Will Provide Own";
  } else if (
    [
      "Persil",
      "Tide",
      "Gain",
      "OxyClean",
      "All Free and Clear",
      "Kirkland UltraClear",
      "Will Provide Own",
    ].includes(profile.detergent)
  ) {
    detergent = profile.detergent;
  }

  let softener = "No softener";
  if (profile.softener === "Standard" || profile.softener === "Downy") {
    softener = "Downy";
  } else if (profile.softener === "White Vinegar") {
    softener = "White Vinegar";
  } else if (profile.softener === "No softener") {
    softener = "No softener";
  }

  const fold =
    profile.foldStyle.toLowerCase().includes("hang")
      ? "Hanger (Provide Own)"
      : "Folded";

  return {
    pants: fold,
    dresses: fold,
    detergent,
    softener,
    whitesWashTemp: wash,
    colorsWashTemp: wash,
    whitesDryerHeat: dryer,
    colorsDryerHeat: dryer,
  };
}

/** Keep old scalar fields roughly aligned for any leftover readers. */
export function legacyFieldsFromLaundryPrefs(prefs: LaundryPrefs) {
  const washTemp = prefs.whitesWashTemp.toLowerCase().includes("warm")
    ? "Warm"
    : "Cold";
  const dryerTemp = prefs.whitesDryerHeat === "Regular" ? "Medium" : "Low";
  const softener =
    prefs.softener === "Downy"
      ? "Standard"
      : prefs.softener === "White Vinegar"
        ? "White Vinegar"
        : "None";
  const foldStyle = prefs.pants.toLowerCase().includes("hanger")
    ? "Hang shirts when possible"
    : "Fold everything";
  return {
    detergent: prefs.detergent,
    softener,
    washTemp,
    dryerTemp,
    foldStyle,
  };
}

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
  /** Exact wash prefs from the booking form (preferred over legacy fields). */
  laundryPrefs: LaundryPrefs | null;
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
    laundryPrefs: null,
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
    laundryPrefs: parseLaundryPrefs(data.laundryPrefs),
    weeklyRepeatEnabled: Boolean(data.weeklyRepeatEnabled),
  };
}

function parseLaundryPrefs(raw: unknown): LaundryPrefs | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  return {
    pants: String(o.pants ?? "Folded"),
    dresses: String(o.dresses ?? "Folded"),
    detergent: String(o.detergent ?? "Persil"),
    softener: String(o.softener ?? "No softener"),
    whitesWashTemp: String(o.whitesWashTemp ?? "Cold wash"),
    colorsWashTemp: String(o.colorsWashTemp ?? "Cold wash"),
    whitesDryerHeat: String(o.whitesDryerHeat ?? "Low"),
    colorsDryerHeat: String(o.colorsDryerHeat ?? "Low"),
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
      laundryPrefs: input.laundryPrefs
        ? {
            pants: input.laundryPrefs.pants,
            dresses: input.laundryPrefs.dresses,
            detergent: input.laundryPrefs.detergent,
            softener: input.laundryPrefs.softener,
            whitesWashTemp: input.laundryPrefs.whitesWashTemp,
            colorsWashTemp: input.laundryPrefs.colorsWashTemp,
            whitesDryerHeat: input.laundryPrefs.whitesDryerHeat,
            colorsDryerHeat: input.laundryPrefs.colorsDryerHeat,
          }
        : null,
      weeklyRepeatEnabled: Boolean(input.weeklyRepeatEnabled),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}
