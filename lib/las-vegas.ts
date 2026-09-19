/** Las Vegas, NV service area for address autocomplete + validation. */

export const LAS_VEGAS_CITY = "Las Vegas";
export const LAS_VEGAS_STATE = "NV";

/** Approximate city + Strip (Paradise) rectangle — excludes Henderson / Boulder City. */
export const LAS_VEGAS_BOUNDS = {
  south: 35.98,
  west: -115.42,
  north: 36.34,
  east: -115.02,
} as const;

/** Las Vegas mailing ZIPs: 891xx city + common North Las Vegas 890xx. */
export function isLasVegasZip(zip: string) {
  const digits = zip.replace(/\D/g, "").slice(0, 5);
  if (/^891\d{2}$/.test(digits)) return true;
  // North Las Vegas (suggestions include these streets)
  return /^890(30|31|32|36|81|84|85|86|87)$/.test(digits);
}

export function normalizeLasVegasCity(city: string) {
  const cleaned = city.trim();
  if (!cleaned) return LAS_VEGAS_CITY;
  const lower = cleaned.toLowerCase();
  if (
    lower === "las vegas" ||
    lower === "paradise" ||
    lower === "spring valley" ||
    lower === "enterprise" ||
    lower.includes("las vegas")
  ) {
    return LAS_VEGAS_CITY;
  }
  return cleaned;
}

export function isLasVegasCity(city: string) {
  return normalizeLasVegasCity(city) === LAS_VEGAS_CITY;
}

/** Filter autocomplete rows to Las Vegas Valley only (not CA/AZ/etc). */
export function isLasVegasSuggestionText(...parts: string[]) {
  const text = parts.filter(Boolean).join(" ").toLowerCase();
  if (!text) return false;
  // Explicit out-of-area states that show up often for similar street names
  if (
    /,\s*(ca|az|ut|or|wa|tx|fl|ny|il|co|nm)\b/.test(text) &&
    !text.includes("las vegas") &&
    !text.includes("paradise") &&
    !text.includes("spring valley") &&
    !text.includes("enterprise")
  ) {
    return false;
  }
  return (
    text.includes("las vegas") ||
    text.includes("north las vegas") ||
    text.includes("paradise, nv") ||
    text.includes("spring valley, nv") ||
    text.includes("enterprise, nv") ||
    /nv\s*89[01]\d{2}/.test(text)
  );
}

/** Drop highways / route codes (NV-159, US-95, I-15) — we need real streets. */
export function isPickupStreetSuggestion(main: string) {
  const m = main.trim();
  if (!m) return false;
  if (/^(nv|us|i|sr|hwy|highway|route|rt)\s*-?\s*\d+/i.test(m)) return false;
  if (/^[A-Z]{1,3}-\d+\b/i.test(m)) return false;
  return true;
}

export function isLasVegasAddress(parts: {
  city: string;
  zip: string;
}) {
  return isLasVegasCity(parts.city) && isLasVegasZip(parts.zip);
}

/** True when street starts with a house number (e.g. "123 Valley View"). */
export function hasHouseNumber(address: string) {
  return /^\d+\s+\S+/.test(address.trim());
}

export type ParsedStreetAddress = {
  address: string;
  city: string;
  zip: string;
  unit: string;
  /** Full pickup-ready address (house # + street + Las Vegas ZIP). */
  complete: boolean;
};

type AddressComponent = {
  long_name: string;
  short_name: string;
  types: string[];
};

/** Pull a Las Vegas Valley mailing ZIP from free-form Places text. */
export function extractLasVegasZip(...parts: string[]) {
  const text = parts.filter(Boolean).join(" ");
  const match = text.match(
    /\b(891\d{2}|890(?:30|31|32|36|81|84|85|86|87))(?:-\d{4})?\b/
  );
  return match?.[1] ?? "";
}

/**
 * Extract whatever Google returned. Incomplete picks (route-only) still fill
 * street name + ZIP so the form isn't left empty — `complete` is false until
 * a house number is present.
 */
export function parseGoogleAddressComponents(
  components: AddressComponent[] | undefined,
  fallbackText = ""
): ParsedStreetAddress | null {
  if (!components?.length && !fallbackText.trim()) return null;

  const get = (type: string, short = false) => {
    const hit = components?.find((c) => c.types.includes(type));
    if (!hit) return "";
    if (short) return hit.short_name || hit.long_name || "";
    return hit.long_name || hit.short_name || "";
  };

  const streetNumber = get("street_number");
  const route = get("route");
  const unit = get("subpremise");
  const locality =
    get("locality") ||
    get("sublocality") ||
    get("neighborhood") ||
    get("postal_town");
  let zip =
    get("postal_code") ||
    get("postal_code", true) ||
    extractLasVegasZip(
      fallbackText,
      ...(components || []).flatMap((c) => [c.long_name, c.short_name])
    );

  if (!route && !streetNumber && !fallbackText.trim()) return null;

  const city = normalizeLasVegasCity(locality || LAS_VEGAS_CITY);
  // Outside service area — reject entirely (unknown city name)
  if (city !== LAS_VEGAS_CITY) return null;

  let address = `${streetNumber} ${route}`.trim();
  if (!address && fallbackText.trim()) {
    // e.g. "12 Verbena Rose Court, Las Vegas, NV 891…"
    address = fallbackText.split(",")[0]?.trim() || fallbackText.trim();
  }
  if (!address) return null;

  if (!zip) zip = extractLasVegasZip(fallbackText, address);

  // Keep ZIP in the form even when out of area — Continue validation will block.
  // Returning null here left Street filled and ZIP blank (looked like a bug).
  const inArea = !zip || isLasVegasZip(zip);
  const complete = Boolean(
    hasHouseNumber(address) && zip && isLasVegasZip(zip)
  );

  return {
    address,
    city: LAS_VEGAS_CITY,
    zip: zip || "",
    unit,
    complete: complete && inArea,
  };
}
