"use client";

import { useEffect, useId, useRef, useState } from "react";
import { MapPin } from "lucide-react";

import { loadGoogleMapsPlaces } from "@/lib/google-maps";
import {
  LAS_VEGAS_BOUNDS,
  hasHouseNumber,
  isLasVegasSuggestionText,
  isPickupStreetSuggestion,
  parseGoogleAddressComponents,
  type ParsedStreetAddress,
} from "@/lib/las-vegas";
import { cn } from "@/lib/utils";

type AddressAutocompleteProps = {
  id?: string;
  className?: string;
  value: string;
  placeholder?: string;
  disabled?: boolean;
  onAddressChange: (value: string) => void;
  onPlaceSelect: (place: ParsedStreetAddress) => void;
};

type SuggestionItem = {
  id: string;
  main: string;
  secondary: string;
  /** Legacy place id, or new PlacePrediction handle */
  placeId?: string;
  prediction?: google.maps.places.PlacePrediction;
};

type GoogleComponent = {
  long_name?: string;
  short_name?: string;
  longText?: string;
  shortText?: string;
  types: string[];
};

function normalizeComponents(
  raw: GoogleComponent[] | undefined
): { long_name: string; short_name: string; types: string[] }[] | undefined {
  if (!raw?.length) return undefined;
  return raw.map((c) => ({
    long_name: c.long_name || c.longText || "",
    short_name: c.short_name || c.shortText || "",
    types: c.types || [],
  }));
}

export function AddressAutocomplete({
  id,
  className,
  value,
  placeholder = "Start typing your street address…",
  disabled,
  onAddressChange,
  onPlaceSelect,
}: AddressAutocompleteProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const listId = `${inputId}-list`;
  const wrapRef = useRef<HTMLDivElement>(null);
  const streetInputRef = useRef<HTMLInputElement>(null);
  const houseInputRef = useRef<HTMLInputElement>(null);
  const sessionTokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(
    null
  );
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<SuggestionItem[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [busySelect, setBusySelect] = useState(false);
  const [needsHouseNumber, setNeedsHouseNumber] = useState(false);
  const [streetOnly, setStreetOnly] = useState("");
  const [houseNo, setHouseNo] = useState("");

  useEffect(() => {
    let cancelled = false;
    let retries = 0;

    const markReady = () => {
      if (cancelled) return;
      setReady(true);
      setFailed(false);
      try {
        sessionTokenRef.current =
          new google.maps.places.AutocompleteSessionToken();
      } catch {
        sessionTokenRef.current = null;
      }
    };

    const boot = () => {
      loadGoogleMapsPlaces()
        .then(markReady)
        .catch(() => {
          if (cancelled) return;
          // Places can finish a beat after script onload — retry a few times
          if (retries < 6) {
            retries += 1;
            window.setTimeout(boot, 400 * retries);
            return;
          }
          // Last chance: library already on window from a late load
          if (window.google?.maps?.places?.AutocompleteService) {
            markReady();
            return;
          }
          setFailed(true);
          setReady(false);
        });
    };

    boot();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function onDocPointer(e: MouseEvent | TouchEvent) {
      const t = e.target as Node | null;
      if (wrapRef.current && t && !wrapRef.current.contains(t)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocPointer);
    document.addEventListener("touchstart", onDocPointer);
    return () => {
      document.removeEventListener("mousedown", onDocPointer);
      document.removeEventListener("touchstart", onDocPointer);
    };
  }, []);

  function clearHouseSplit() {
    setNeedsHouseNumber(false);
    setStreetOnly("");
    setHouseNo("");
  }

  function applyHouseNumber(raw: string) {
    const n = raw.replace(/\D/g, "").slice(0, 8);
    setHouseNo(n);
    const base =
      streetOnly.trim() ||
      value.replace(/^\d+\s*/, "").trim() ||
      value.trim();
    setStreetOnly(base);
    onAddressChange(n ? `${n} ${base}`.trim() : base);
  }

  function finishHouseNumberIfReady() {
    // Collapse only after the user leaves the field — not mid-typing
    if (houseNo.trim() && hasHouseNumber(`${houseNo} ${streetOnly}`.trim())) {
      clearHouseSplit();
    }
  }

  function scheduleFetch(query: string) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!ready || query.trim().length < 2) {
      setItems([]);
      setOpen(false);
      return;
    }
    debounceRef.current = setTimeout(() => {
      void fetchSuggestions(query.trim());
    }, 220);
  }

  async function fetchSuggestions(input: string) {
    if (!window.google?.maps?.places) return;
    setLoading(true);
    try {
      const next = await fetchPredictions(input, sessionTokenRef.current);
      setItems(next);
      setOpen(next.length > 0);
      setActiveIndex(next.length ? 0 : -1);
    } catch {
      setItems([]);
      setOpen(false);
    } finally {
      setLoading(false);
    }
  }

  async function selectItem(item: SuggestionItem) {
    if (busySelect) return;
    setBusySelect(true);
    setOpen(false);
    clearHouseSplit();

    // Immediately keep the chosen label — prevents the "jump back" feel
    onAddressChange(item.main);

    try {
      const components = await fetchPlaceComponents(item);
      const parsed = parseGoogleAddressComponents(
        normalizeComponents(components)
      );
      if (parsed) {
        onPlaceSelect(parsed);
        if (parsed.complete) {
          clearHouseSplit();
        } else {
          // Street-only pick — ask for building # (Apt/unit is a different field)
          setStreetOnly(parsed.address);
          setHouseNo("");
          setNeedsHouseNumber(true);
          window.setTimeout(() => houseInputRef.current?.focus(), 0);
        }
        try {
          sessionTokenRef.current =
            new google.maps.places.AutocompleteSessionToken();
        } catch {
          sessionTokenRef.current = null;
        }
        return;
      }

      setStreetOnly(item.main);
      setHouseNo("");
      setNeedsHouseNumber(true);
      window.setTimeout(() => houseInputRef.current?.focus(), 0);
    } catch {
      setStreetOnly(item.main);
      setHouseNo("");
      setNeedsHouseNumber(true);
      window.setTimeout(() => houseInputRef.current?.focus(), 0);
    } finally {
      setBusySelect(false);
    }
  }

  return (
    <div className="book-address-wrap" ref={wrapRef}>
      <div className="book-address-field">
        {needsHouseNumber ? (
          <div className="book-address-split">
            <input
              ref={houseInputRef}
              className={cn(className, "book-address-houseno")}
              value={houseNo}
              disabled={disabled || busySelect}
              placeholder="No."
              inputMode="numeric"
              autoComplete="off"
              aria-label="House number"
              onChange={(e) => applyHouseNumber(e.target.value)}
              onBlur={() => finishHouseNumberIfReady()}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  finishHouseNumberIfReady();
                  houseInputRef.current?.blur();
                }
              }}
            />
            <input
              ref={streetInputRef}
              id={inputId}
              className={cn(className)}
              value={streetOnly || value.replace(/^\d+\s*/, "")}
              disabled={disabled || busySelect}
              placeholder={placeholder}
              autoComplete="off"
              inputMode="text"
              aria-describedby={`${inputId}-hint`}
              onChange={(e) => {
                const next = e.target.value;
                setStreetOnly(next);
                onAddressChange(
                  houseNo ? `${houseNo} ${next}`.trim() : next
                );
                scheduleFetch(next);
              }}
            />
          </div>
        ) : (
          <input
            ref={streetInputRef}
            id={inputId}
            className={cn(className)}
            value={value}
            disabled={disabled || busySelect}
            placeholder={placeholder}
            autoComplete="off"
            inputMode="text"
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={
              activeIndex >= 0 ? `${listId}-opt-${activeIndex}` : undefined
            }
            aria-describedby={`${inputId}-hint`}
            onChange={(e) => {
              const next = e.target.value;
              clearHouseSplit();
              onAddressChange(next);
              scheduleFetch(next);
            }}
            onFocus={() => {
              if (!ready && window.google?.maps?.places?.AutocompleteService) {
                setReady(true);
                setFailed(false);
              }
              if (items.length) setOpen(true);
              else if (value.trim().length >= 2) scheduleFetch(value);
            }}
            onKeyDown={(e) => {
              if (!open || !items.length) return;
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActiveIndex((i) => (i + 1) % items.length);
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActiveIndex((i) => (i <= 0 ? items.length - 1 : i - 1));
              } else if (e.key === "Enter" && activeIndex >= 0) {
                e.preventDefault();
                void selectItem(items[activeIndex]);
              } else if (e.key === "Escape") {
                setOpen(false);
              }
            }}
          />
        )}

        {open && items.length > 0 && !needsHouseNumber ? (
          <ul
            id={listId}
            className="book-address-list"
            role="listbox"
            aria-label="Address suggestions"
          >
            {items.map((item, index) => (
              <li key={item.id} role="presentation">
                <button
                  type="button"
                  id={`${listId}-opt-${index}`}
                  role="option"
                  aria-selected={index === activeIndex}
                  className={cn(
                    "book-address-option",
                    index === activeIndex && "is-active"
                  )}
                  onMouseDown={(e) => {
                    e.preventDefault();
                  }}
                  onClick={() => void selectItem(item)}
                  onMouseEnter={() => setActiveIndex(index)}
                >
                  <MapPin
                    size={14}
                    aria-hidden
                    className="book-address-option-icon"
                  />
                  <span className="book-address-option-text">
                    <strong>{item.main}</strong>
                    {item.secondary ? <small>{item.secondary}</small> : null}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <p
        id={`${inputId}-hint`}
        className={cn(
          "book-address-hint",
          needsHouseNumber && "book-address-hint-warn"
        )}
      >
        {failed
          ? "Address suggestions unavailable — type street + ZIP manually."
          : !ready
            ? "Loading address suggestions…"
            : loading
              ? "Searching…"
              : busySelect
                ? "Applying address…"
                : needsHouseNumber
                  ? houseNo
                    ? "Looks good — tap next field or Continue when the number is complete."
                    : "Enter the building / house number here — Apt/unit below is separate."
                  : "Type your house number + street, then tap a suggestion (e.g. 123 Valley View Blvd)."}
      </p>
    </div>
  );
}

async function fetchPredictions(
  input: string,
  sessionToken: google.maps.places.AutocompleteSessionToken | null
): Promise<SuggestionItem[]> {
  const places = google.maps.places;
  const query = input.trim();
  if (query.length < 2) return [];

  const toItems = (
    predictions: google.maps.places.AutocompletePrediction[]
  ): SuggestionItem[] =>
    predictions
      .map((p) => ({
        id: p.place_id,
        main:
          p.structured_formatting?.main_text || p.description.split(",")[0],
        secondary:
          p.structured_formatting?.secondary_text ||
          p.description
            .replace(p.structured_formatting?.main_text || "", "")
            .replace(/^,\s*/, ""),
        placeId: p.place_id,
        description: p.description,
      }))
      .filter(
        (p) =>
          isPickupStreetSuggestion(p.main) &&
          isLasVegasSuggestionText(p.main, p.secondary, p.description)
      )
      .sort((a, b) => {
        const aNum = /^\d/.test(a.main) ? 0 : 1;
        const bNum = /^\d/.test(b.main) ? 0 : 1;
        return aNum - bNum;
      })
      .map(({ description: _d, ...rest }) => rest);

  // Classic AutocompleteService — reliable with libraries=places
  if (typeof places.AutocompleteService === "function") {
    const service = new places.AutocompleteService();
    const bounds = new google.maps.LatLngBounds(
      { lat: LAS_VEGAS_BOUNDS.south, lng: LAS_VEGAS_BOUNDS.west },
      { lat: LAS_VEGAS_BOUNDS.north, lng: LAS_VEGAS_BOUNDS.east }
    );

    const request = (strict: boolean) =>
      new Promise<google.maps.places.AutocompletePrediction[]>((resolve) => {
        service.getPlacePredictions(
          {
            input: query,
            componentRestrictions: { country: "us" },
            types: ["address"],
            bounds,
            ...(strict ? { strictBounds: true } : {}),
            ...(sessionToken ? { sessionToken } : {}),
          } as google.maps.places.AutocompletionRequest,
          (result, status) => {
            if (
              status !== google.maps.places.PlacesServiceStatus.OK ||
              !result
            ) {
              resolve([]);
              return;
            }
            resolve(result);
          }
        );
      });

    let items = toItems(await request(true));
    if (!items.length) items = toItems(await request(false));
    if (items.length) return items;
  }

  // Optional new Autocomplete Data API
  try {
    const AutocompleteSuggestion = (
      places as unknown as {
        AutocompleteSuggestion?: {
          fetchAutocompleteSuggestions: (r: unknown) => Promise<{
            suggestions: Array<{
              placePrediction?: google.maps.places.PlacePrediction;
            }>;
          }>;
        };
      }
    ).AutocompleteSuggestion;

    if (!AutocompleteSuggestion?.fetchAutocompleteSuggestions) return [];

    const { suggestions } =
      await AutocompleteSuggestion.fetchAutocompleteSuggestions({
        input: query,
        includedRegionCodes: ["us"],
        locationRestriction: {
          west: LAS_VEGAS_BOUNDS.west,
          south: LAS_VEGAS_BOUNDS.south,
          east: LAS_VEGAS_BOUNDS.east,
          north: LAS_VEGAS_BOUNDS.north,
        },
        ...(sessionToken ? { sessionToken } : {}),
      });

    return (suggestions || [])
      .map((s, i) => {
        const p = s.placePrediction;
        if (!p) return null;
        const text = p.text?.toString?.() || "";
        const main =
          p.mainText?.toString?.() || text.split(",")[0]?.trim() || text;
        const secondary =
          p.secondaryText?.toString?.() ||
          text.replace(main, "").replace(/^,\s*/, "").trim();
        if (
          !isPickupStreetSuggestion(main) ||
          !isLasVegasSuggestionText(main, secondary, text)
        ) {
          return null;
        }
        return {
          id: p.placeId || `new-${i}-${main}`,
          main,
          secondary,
          placeId: p.placeId,
          prediction: p,
        } satisfies SuggestionItem;
      })
      .filter(Boolean) as SuggestionItem[];
  } catch {
    return [];
  }
}

async function fetchPlaceComponents(
  item: SuggestionItem
): Promise<GoogleComponent[] | undefined> {
  // New PlacePrediction → Place.fetchFields
  if (item.prediction && typeof item.prediction.toPlace === "function") {
    const place = item.prediction.toPlace();
    await place.fetchFields({
      fields: ["addressComponents", "formattedAddress", "location", "displayName"],
    });
    return place.addressComponents as GoogleComponent[] | undefined;
  }

  if (!item.placeId) return undefined;

  const service = new google.maps.places.PlacesService(
    document.createElement("div")
  );
  const detail = await new Promise<google.maps.places.PlaceResult | null>(
    (resolve) => {
      service.getDetails(
        {
          placeId: item.placeId!,
          fields: ["address_components", "formatted_address", "geometry", "name"],
        },
        (result, status) => {
          if (
            status !== google.maps.places.PlacesServiceStatus.OK ||
            !result
          ) {
            resolve(null);
            return;
          }
          resolve(result);
        }
      );
    }
  );
  return detail?.address_components as GoogleComponent[] | undefined;
}
