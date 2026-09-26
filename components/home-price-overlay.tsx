"use client";

import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import {
  DEFAULT_LAUNDRY_RATES,
  subscribeLaundryRates,
  type LaundryRates,
} from "@/lib/laundry-rates";

type Variant = "desktop" | "mobile";
type CardKey = "weekly" | "ondemand";
type LineKey = "amount" | "unit" | "title" | "fee";

type LineLayout = {
  top: number;
  /** Horizontal nudge as % of card/overlay width (0 = centered). */
  x: number;
  cqh: number;
};

type LayoutMap = Record<CardKey, Record<LineKey, LineLayout>>;

type BoxGeom = {
  left: string;
  top: string;
  width: string;
  height: string;
};

/** Locked desktop card layout. */
const DESKTOP_LAYOUT: LayoutMap = {
  weekly: {
    amount: { top: 6.5, x: 0, cqh: 22.6 },
    unit: { top: 33, x: 0, cqh: 7 },
    title: { top: 47.3, x: 0, cqh: 8.2 },
    fee: { top: 69.2, x: 0, cqh: 6.5 },
  },
  ondemand: {
    amount: { top: 6.5, x: 0, cqh: 22.6 },
    unit: { top: 33, x: 0, cqh: 7 },
    title: { top: 46, x: 0, cqh: 8.2 },
    fee: { top: 69.2, x: 0, cqh: 6.5 },
  },
};

/** Locked mobile card layout. */
const MOBILE_LAYOUT: LayoutMap = {
  weekly: {
    amount: { top: 5.5, x: 0, cqh: 40 },
    unit: { top: 44.7, x: 0, cqh: 11.6 },
    title: { top: 60.7, x: 0, cqh: 16.4 },
    fee: { top: 80.8, x: 0, cqh: 10.8 },
  },
  ondemand: {
    amount: { top: 5.5, x: 0, cqh: 40 },
    unit: { top: 44.7, x: 0, cqh: 11.6 },
    title: { top: 59.8, x: -1.3, cqh: 16.4 },
    fee: { top: 80.8, x: 0, cqh: 10.8 },
  },
};

const DESKTOP_BOXES: Record<CardKey, BoxGeom> = {
  weekly: {
    left: "8.33%",
    top: "19.86%",
    width: "26.28%",
    height: "48.52%",
  },
  ondemand: {
    left: "38.46%",
    top: "19.77%",
    width: "25.21%",
    height: "48.7%",
  },
};

const MOBILE_BOXES: Record<CardKey, BoxGeom> = {
  weekly: {
    left: "20.04%",
    top: "9.29%",
    width: "59.93%",
    height: "19.44%",
  },
  ondemand: {
    left: "20.65%",
    top: "30.21%",
    width: "59%",
    height: "18.84%",
  },
};

const DESKTOP_MIN_STORAGE = "foam-pricing-min-layout-desktop-v1";
const DESKTOP_MIN_DBUG = "foam-pricing-min-dbug-desktop";
const MOBILE_MIN_STORAGE = "foam-pricing-min-layout-mobile-v1";
const MOBILE_MIN_DBUG = "foam-pricing-min-dbug-mobile";

/** Fallback only — localStorage wins when present. */
const DESKTOP_MIN_FALLBACK: LineLayout = {
  top: 70.5,
  x: -12,
  cqh: 3.2,
};

const MOBILE_MIN_FALLBACK: LineLayout = {
  top: 51,
  x: 0,
  cqh: 2.6,
};

function money(n: number) {
  return n.toFixed(2);
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function loadMinLayout(key: string, fallback: LineLayout): LineLayout {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return { ...fallback };
    const parsed = JSON.parse(raw) as Partial<LineLayout>;
    return {
      top: Number.isFinite(parsed.top) ? parsed.top! : fallback.top,
      x: Number.isFinite(parsed.x) ? parsed.x! : fallback.x,
      cqh: Number.isFinite(parsed.cqh) ? parsed.cqh! : fallback.cqh,
    };
  } catch {
    return { ...fallback };
  }
}

function useMinDbug(
  storageKey: string,
  dbugKey: string,
  fallback: LineLayout,
  dock: "desktop" | "mobile"
) {
  const [enabled, setEnabled] = useState(true);
  const [layout, setLayout] = useState<LineLayout>(fallback);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    localStorage.setItem(dbugKey, "1");
    setEnabled(true);
    setLayout(loadMinLayout(storageKey, fallback));
  }, [storageKey, dbugKey, fallback]);

  const patch = (nextPatch: Partial<LineLayout>) => {
    setLayout((prev) => {
      const next: LineLayout = {
        top: Math.round(clamp(nextPatch.top ?? prev.top, 0, 96) * 10) / 10,
        x: Math.round(clamp(nextPatch.x ?? prev.x, -50, 50) * 10) / 10,
        cqh: Math.round(clamp(nextPatch.cqh ?? prev.cqh, 1.2, 12) * 10) / 10,
      };
      localStorage.setItem(storageKey, JSON.stringify(next));
      return next;
    });
  };

  const setDbug = (on: boolean) => {
    setEnabled(on);
    localStorage.setItem(dbugKey, on ? "1" : "0");
  };

  const reset = () => {
    const fresh = { ...fallback };
    setLayout(fresh);
    localStorage.setItem(storageKey, JSON.stringify(fresh));
  };

  const copy = async () => {
    const json = JSON.stringify(layout);
    try {
      await navigator.clipboard.writeText(json);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      window.prompt("Copy this layout JSON:", json);
    }
  };

  return { enabled, setDbug, layout, patch, reset, copy, copied, dock };
}

function FreeLine({
  layout,
  className,
  children,
}: {
  layout: LineLayout;
  className: string;
  children: ReactNode;
}) {
  return (
    <div
      className="home-price-free-line"
      style={{
        top: `${layout.top}%`,
        transform: layout.x ? `translateX(${layout.x}%)` : undefined,
      }}
    >
      <div className={className} style={{ fontSize: `${layout.cqh}cqh` }}>
        {children}
      </div>
    </div>
  );
}

function MinLine({
  enabled,
  layout,
  onPatch,
  children,
}: {
  enabled: boolean;
  layout: LineLayout;
  onPatch?: (patch: Partial<LineLayout>) => void;
  children: ReactNode;
}) {
  const mode = useRef<"move" | "resize" | null>(null);
  const startX = useRef(0);
  const startY = useRef(0);
  const startTop = useRef(0);
  const startOffX = useRef(0);
  const startCqh = useRef(0);
  const boxW = useRef(0);
  const boxH = useRef(0);

  const begin = (
    e: ReactPointerEvent<HTMLElement>,
    nextMode: "move" | "resize"
  ) => {
    if (!enabled || !onPatch) return;
    e.preventDefault();
    e.stopPropagation();
    const box = (e.currentTarget as HTMLElement).closest(
      ".home-price-overlay"
    ) as HTMLElement | null;
    const rect = box?.getBoundingClientRect();
    boxW.current = rect?.width ?? 0;
    boxH.current = rect?.height ?? 0;
    mode.current = nextMode;
    startX.current = e.clientX;
    startY.current = e.clientY;
    startTop.current = layout.top;
    startOffX.current = layout.x;
    startCqh.current = layout.cqh;
    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);

    const onMove = (ev: PointerEvent) => {
      if (!mode.current || !onPatch) return;
      if (mode.current === "move") {
        if (!boxW.current || !boxH.current) return;
        const dx = ((ev.clientX - startX.current) / boxW.current) * 100;
        const dy = ((ev.clientY - startY.current) / boxH.current) * 100;
        onPatch({
          x: startOffX.current + dx,
          top: startTop.current + dy,
        });
      } else {
        if (!boxH.current) return;
        const dy = ((ev.clientY - startY.current) / boxH.current) * 100;
        onPatch({ cqh: startCqh.current + dy });
      }
    };
    const onUp = (ev: PointerEvent) => {
      mode.current = null;
      target.releasePointerCapture(ev.pointerId);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  return (
    <div
      className={`home-price-min-line ${enabled ? "is-dbug" : ""}`}
      data-line="minimum"
      style={{
        top: `${layout.top}%`,
        transform: layout.x ? `translateX(${layout.x}%)` : undefined,
      }}
      onPointerDown={enabled ? (e) => begin(e, "move") : undefined}
    >
      <p className="home-price-min-text" style={{ fontSize: `${layout.cqh}cqh` }}>
        {children}
      </p>
      {enabled ? (
        <button
          type="button"
          className="home-price-dbug-handle"
          aria-label="Resize minimum order"
          onPointerDown={(e) => begin(e, "resize")}
        />
      ) : null}
    </div>
  );
}

function PriceCards({
  rates,
  layout,
  boxes,
  singleLine = false,
}: {
  rates: LaundryRates;
  layout: LayoutMap;
  boxes: Record<CardKey, BoxGeom>;
  singleLine?: boolean;
}) {
  const line = (
    card: CardKey,
    key: LineKey,
    className: string,
    content: ReactNode
  ) => (
    <FreeLine layout={layout[card][key]} className={className}>
      {content}
    </FreeLine>
  );

  const ondemandTitle = singleLine ? (
    "Only When You Need Us"
  ) : (
    <>
      Only When
      <br />
      You Need Us
    </>
  );
  const feeText = singleLine ? (
    `+ $${money(rates.deliveryFee)} Service Fee per Pickup`
  ) : (
    <>
      + ${money(rates.deliveryFee)} Service Fee
      <br />
      per Pickup
    </>
  );

  return (
    <>
      <article className="home-price-box is-weekly" style={boxes.weekly}>
        {line(
          "weekly",
          "amount",
          "home-price-box-amount",
          <>
            <span className="home-price-box-dollar">$</span>
            {money(rates.weeklyPerLb)}
          </>
        )}
        {line("weekly", "unit", "home-price-box-unit", "per pound")}
        {line(
          "weekly",
          "title",
          "home-price-box-title is-nowrap",
          "Weekly Service"
        )}
        {line(
          "weekly",
          "fee",
          "home-price-box-fee is-nowrap",
          `+ $${money(rates.deliveryFee)} Service Fee per Pickup`
        )}
      </article>

      <article className="home-price-box is-ondemand" style={boxes.ondemand}>
        {line(
          "ondemand",
          "amount",
          "home-price-box-amount",
          <>
            <span className="home-price-box-dollar">$</span>
            {money(rates.standardPerLb)}
          </>
        )}
        {line("ondemand", "unit", "home-price-box-unit", "per pound")}
        {line(
          "ondemand",
          "title",
          singleLine ? "home-price-box-title is-nowrap" : "home-price-box-title",
          ondemandTitle
        )}
        {line(
          "ondemand",
          "fee",
          singleLine
            ? "home-price-box-fee is-nowrap"
            : "home-price-box-fee is-ink",
          feeText
        )}
      </article>
    </>
  );
}

function MinDbugChrome({
  dock,
  enabled,
  setDbug,
  reset,
  copy,
  copied,
  layout,
}: {
  dock: "desktop" | "mobile";
  enabled: boolean;
  setDbug: (on: boolean) => void;
  reset: () => void;
  copy: () => void;
  copied: boolean;
  layout: LineLayout;
}) {
  if (!enabled) {
    return (
      <button
        type="button"
        className={`home-price-dbug-open is-${dock}-dock`}
        onClick={() => setDbug(true)}
      >
        DBUG
      </button>
    );
  }

  return (
    <div className={`home-price-dbug-panel is-${dock}-dock`}>
      <strong>DBUG min</strong>
      <span className="home-price-dbug-meta">
        {layout.top}/{layout.x}/{layout.cqh}
      </span>
      <div className="home-price-dbug-actions">
        <button type="button" onClick={copy}>
          {copied ? "Copied" : "Copy"}
        </button>
        <button type="button" onClick={reset}>
          Reset
        </button>
        <button type="button" onClick={() => setDbug(false)}>
          Hide
        </button>
      </div>
    </div>
  );
}

function DesktopPriceOverlay({ rates }: { rates: LaundryRates }) {
  const dbug = useMinDbug(
    DESKTOP_MIN_STORAGE,
    DESKTOP_MIN_DBUG,
    DESKTOP_MIN_FALLBACK,
    "desktop"
  );
  const [portalReady, setPortalReady] = useState(false);
  useEffect(() => setPortalReady(true), []);

  return (
    <div
      className={`home-price-overlay ${dbug.enabled ? "is-dbug" : ""}`}
      aria-hidden={dbug.enabled ? undefined : true}
    >
      {portalReady
        ? createPortal(
            <MinDbugChrome
              dock="desktop"
              enabled={dbug.enabled}
              setDbug={dbug.setDbug}
              reset={dbug.reset}
              copy={dbug.copy}
              copied={dbug.copied}
              layout={dbug.layout}
            />,
            document.body
          )
        : null}
      <PriceCards rates={rates} layout={DESKTOP_LAYOUT} boxes={DESKTOP_BOXES} />
      <MinLine
        enabled={dbug.enabled}
        layout={dbug.layout}
        onPatch={dbug.patch}
      >
        Minimum order total: ${money(rates.minimumOrder)}.
      </MinLine>
    </div>
  );
}

function MobilePriceOverlay({ rates }: { rates: LaundryRates }) {
  const dbug = useMinDbug(
    MOBILE_MIN_STORAGE,
    MOBILE_MIN_DBUG,
    MOBILE_MIN_FALLBACK,
    "mobile"
  );
  const [portalReady, setPortalReady] = useState(false);
  useEffect(() => setPortalReady(true), []);

  return (
    <div
      className={`home-price-overlay is-mobile ${dbug.enabled ? "is-dbug" : ""}`}
      aria-hidden={dbug.enabled ? undefined : true}
    >
      {portalReady
        ? createPortal(
            <MinDbugChrome
              dock="mobile"
              enabled={dbug.enabled}
              setDbug={dbug.setDbug}
              reset={dbug.reset}
              copy={dbug.copy}
              copied={dbug.copied}
              layout={dbug.layout}
            />,
            document.body
          )
        : null}
      <PriceCards
        rates={rates}
        layout={MOBILE_LAYOUT}
        boxes={MOBILE_BOXES}
        singleLine
      />
      <MinLine
        enabled={dbug.enabled}
        layout={dbug.layout}
        onPatch={dbug.patch}
      >
        Minimum order total: ${money(rates.minimumOrder)}.
      </MinLine>
    </div>
  );
}

export function HomePriceOverlay({
  variant = "desktop",
}: {
  variant?: Variant;
}) {
  const [rates, setRates] = useState<LaundryRates>(DEFAULT_LAUNDRY_RATES);

  useEffect(() => subscribeLaundryRates(setRates), []);

  if (variant === "mobile") {
    return <MobilePriceOverlay rates={rates} />;
  }

  return <DesktopPriceOverlay rates={rates} />;
}
