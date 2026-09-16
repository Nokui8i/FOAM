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

/** Las Vegas mailing ZIPs are primarily 891xx. */
export function isLasVegasZip(zip: string) {
  const digits = zip.replace(/\D/g, "").slice(0, 5);
  return /^891\d{2}$/.test(digits);
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

export function isLasVegasAddress(parts: {
  city: string;
  zip: string;
}) {
  return isLasVegasCity(parts.city) && isLasVegasZip(parts.zip);
}

export type ParsedStreetAddress = {
  address: string;
  city: string;
  zip: string;
  unit: string;
};

type AddressComponent = {
  long_name: string;
  short_name: string;
  types: string[];
};

export function parseGoogleAddressComponents(
  components: AddressComponent[] | undefined
): ParsedStreetAddress | null {
  if (!components?.length) return null;

  const get = (type: string, short = false) => {
    const hit = components.find((c) => c.types.includes(type));
    if (!hit) return "";
    return short ? hit.short_name : hit.long_name;
  };

  const streetNumber = get("street_number");
  const route = get("route");
  const unit = get("subpremise");
  const locality =
    get("locality") ||
    get("sublocality") ||
    get("neighborhood") ||
    get("postal_town");
  const zip = get("postal_code");

  const address = [streetNumber, route].filter(Boolean).join(" ").trim();
  if (!address || !zip) return null;

  const city = normalizeLasVegasCity(locality || LAS_VEGAS_CITY);
  if (!isLasVegasZip(zip) || city !== LAS_VEGAS_CITY) return null;

  return { address, city: LAS_VEGAS_CITY, zip, unit };
}
