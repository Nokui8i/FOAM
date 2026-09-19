const MAPS_SCRIPT_ID = "foam-google-maps-sdk";

declare global {
  interface Window {
    google?: typeof google;
    __foamMapsReady?: Promise<typeof google>;
    __foamMapsInit?: () => void;
  }
}

export function getGoogleMapsApiKey() {
  return (
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() ||
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY?.trim() ||
    ""
  );
}

export function placesLibraryReady(): boolean {
  return Boolean(window.google?.maps?.places?.AutocompleteService);
}

async function waitForPlaces(maxMs = 8000): Promise<typeof google> {
  const start = Date.now();

  while (Date.now() - start < maxMs) {
    if (placesLibraryReady() && window.google) return window.google;

    if (window.google?.maps?.importLibrary) {
      try {
        await window.google.maps.importLibrary("places");
      } catch {
        // Classic libraries=places may still finish loading below
      }
      if (placesLibraryReady() && window.google) return window.google;
    }

    await new Promise((r) => setTimeout(r, 120));
  }

  if (placesLibraryReady() && window.google) return window.google;
  throw new Error("Google Places library unavailable");
}

export function loadGoogleMapsPlaces(): Promise<typeof google> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Maps only available in the browser"));
  }

  if (placesLibraryReady() && window.google) {
    return Promise.resolve(window.google);
  }

  if (window.__foamMapsReady) return window.__foamMapsReady;

  const key = getGoogleMapsApiKey();
  if (!key) {
    return Promise.reject(new Error("Missing Google Maps API key"));
  }

  window.__foamMapsReady = (async () => {
    try {
      // Script already present
      const existing = document.getElementById(
        MAPS_SCRIPT_ID
      ) as HTMLScriptElement | null;

      if (existing) {
        // Replace broken tags that never requested places
        if (
          existing.src &&
          !existing.src.includes("libraries=places") &&
          !placesLibraryReady()
        ) {
          existing.remove();
        } else {
          return await waitForPlaces();
        }
      }

      await new Promise<void>((resolve, reject) => {
        const callbackName = "__foamMapsInit";
        window[callbackName] = () => {
          delete window[callbackName];
          resolve();
        };

        const script = document.createElement("script");
        script.id = MAPS_SCRIPT_ID;
        script.async = true;
        script.defer = true;
        // Classic callback + libraries=places is the reliable path for AutocompleteService
        script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(
          key
        )}&libraries=places&v=weekly&loading=async&callback=${callbackName}`;
        script.onerror = () => {
          delete window[callbackName];
          reject(new Error("Google Maps failed to load"));
        };
        document.head.appendChild(script);
      });

      return await waitForPlaces();
    } catch (err) {
      window.__foamMapsReady = undefined;
      throw err;
    }
  })();

  return window.__foamMapsReady;
}
