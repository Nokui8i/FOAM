"use client";

import { useEffect, useId, useRef, useState } from "react";

import { loadGoogleMapsPlaces } from "@/lib/google-maps";
import {
  LAS_VEGAS_BOUNDS,
  LAS_VEGAS_CITY,
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
  onInvalidPlace?: () => void;
};

export function AddressAutocomplete({
  id,
  className,
  value,
  placeholder = "",
  disabled,
  onAddressChange,
  onPlaceSelect,
  onInvalidPlace,
}: AddressAutocompleteProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const inputRef = useRef<HTMLInputElement>(null);
  const onPlaceSelectRef = useRef(onPlaceSelect);
  const onInvalidPlaceRef = useRef(onInvalidPlace);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  onPlaceSelectRef.current = onPlaceSelect;
  onInvalidPlaceRef.current = onInvalidPlace;

  useEffect(() => {
    let cancelled = false;
    let autocomplete: google.maps.places.Autocomplete | null = null;
    let listener: google.maps.MapsEventListener | null = null;

    loadGoogleMapsPlaces()
      .then((g) => {
        if (cancelled || !inputRef.current) return;

        autocomplete = new g.maps.places.Autocomplete(inputRef.current, {
          fields: ["address_components", "formatted_address", "geometry"],
          types: ["address"],
          componentRestrictions: { country: "us" },
          bounds: new g.maps.LatLngBounds(
            { lat: LAS_VEGAS_BOUNDS.south, lng: LAS_VEGAS_BOUNDS.west },
            { lat: LAS_VEGAS_BOUNDS.north, lng: LAS_VEGAS_BOUNDS.east }
          ),
          strictBounds: true,
        });

        listener = autocomplete.addListener("place_changed", () => {
          const place = autocomplete?.getPlace();
          const parsed = parseGoogleAddressComponents(
            place?.address_components as
              | {
                  long_name: string;
                  short_name: string;
                  types: string[];
                }[]
              | undefined
          );

          if (!parsed) {
            onInvalidPlaceRef.current?.();
            return;
          }

          onPlaceSelectRef.current(parsed);
        });

        setReady(true);
        setFailed(false);
      })
      .catch(() => {
        if (!cancelled) {
          setFailed(true);
          setReady(false);
        }
      });

    return () => {
      cancelled = true;
      if (listener) listener.remove();
      // Detach pac container bindings when possible
      const pac = document.querySelector(".pac-container");
      if (pac && !document.querySelectorAll("input").length) {
        pac.remove();
      }
    };
  }, []);

  return (
    <div className="book-address-wrap">
      <input
        ref={inputRef}
        id={inputId}
        className={cn(className)}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        autoComplete="off"
        inputMode="text"
        onChange={(e) => onAddressChange(e.target.value)}
        aria-autocomplete="list"
        aria-describedby={failed || !ready ? `${inputId}-hint` : undefined}
      />
      {failed || !ready ? (
        <p id={`${inputId}-hint`} className="book-address-hint">
          {failed
            ? "Address suggestions unavailable — enter a street address."
            : "Loading address suggestions…"}
        </p>
      ) : null}
      <input type="hidden" value={LAS_VEGAS_CITY} readOnly aria-hidden />
    </div>
  );
}
