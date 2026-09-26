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

/** Locked desktop minimum-order line. */
const DESKTOP_MIN_LAYOUT: LineLayout = {
  top: 74,
  x: -12,
  cqh: 3.4,
};

const MOBILE_MIN_STORAGE_KEY = "foam-pricing-min-layout-mobile-v1";
const MOBILE_MIN_DBUG_KEY = "foam-pricing-min-dbug-mobile";

const MOBILE_MIN_DEFAULT_LAYOUT: LineLayout = {
  top: 54,
  x: 0,
  cqh: 2.8,
};

const LINE_LABELS: Record<LineKey, string> = {
  amount: "Price",
  unit: "Unit",
  title: "Title",
  fee: "Fee",
};

function money(n: number) {
  return n.toFixed(2);
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function loadMobileMinLayout(): LineLayout {
  try {
    const raw = localStorage.getItem(MOBILE_MIN_STORAGE_KEY);
    if (!raw) return { ...MOBILE_MIN_DEFAULT_LAYOUT };
    const parsed = JSON.parse(raw) as Partial<LineLayout>;
    return {
      top: Number.isFinite(parsed.top)
        ? parsed.top!
        : MOBILE_MIN_DEFAULT_LAYOUT.top,
      x: Number.isFinite(parsed.x) ? parsed.x! : MOBILE_MIN_DEFAULT_LAYOUT.x,
      cqh: Number.isFinite(parsed.cqh)
        ? parsed.cqh!
        : MOBILE_MIN_DEFAULT_LAYOUT.cqh,
    };
  } catch {
    return { ...MOBILE_MIN_DEFAULT_LAYOUT };
  }
}

function saveMobileMinLayout(layout: LineLayout) {
  localStorage.setItem(MOBILE_MIN_STORAGE_KEY, JSON.stringify(layout));
}

function useMobileMinDbug() {
  const [enabled, setEnabled] = useState(true);
  const [layout, setLayout] = useState<LineLayout>(MOBILE_MIN_DEFAULT_LAYOUT);

  useEffect(() => {
    localStorage.setItem(MOBILE_MIN_DBUG_KEY, "1");
    setEnabled(true);
    setLayout(loadMobileMinLayout());
  }, []);

  const patch = (nextPatch: Partial<LineLayout>) => {
    setLayout((prev) => {
      const next: LineLayout = {
        top: Math.round(clamp(nextPatch.top ?? prev.top, 0, 96) * 10) / 10,
        x: Math.round(clamp(nextPatch.x ?? prev.x, -50, 50) * 10) / 10,
        cqh: Math.round(clamp(nextPatch.cqh ?? prev.cqh, 1.2, 12) * 10) / 10,
      };
      saveMobileMinLayout(next);
      return next;
    });
  };

  const setDbug = (on: boolean) => {
    setEnabled(on);
    localStorage.setItem(MOBILE_MIN_DBUG_KEY, on ? "1" : "0");
  };

  const reset = () => {
    const fresh = { ...MOBILE_MIN_DEFAULT_LAYOUT };
    setLayout(fresh);
    saveMobileMinLayout(fresh);
  };

  return { enabled, setDbug, layout, patch, reset };
}

function FreeLine({
  card,
  lineKey,
  enabled,
  layout,
  onPatch,
  className,
  children,
}: {
  card: CardKey;
  lineKey: LineKey;
  enabled: boolean;
  layout: LineLayout;
  onPatch?: (patch: Partial<LineLayout>) => void;
  className: string;
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
      ".home-price-box"
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
      className={`home-price-free-line ${enabled ? "is-dbug" : ""}`}
      data-card={card}
      data-line={lineKey}
      style={{
        top: `${layout.top}%`,
        transform: layout.x ? `translateX(${layout.x}%)` : undefined,
      }}
      onPointerDown={enabled ? (e) => begin(e, "move") : undefined}
    >
      <div className={className} style={{ fontSize: `${layout.cqh}cqh` }}>
        {children}
      </div>
      {enabled ? (
        <button
          type="button"
          className="home-price-dbug-handle"
          aria-label={`Resize ${card} ${LINE_LABELS[lineKey]}`}
          onPointerDown={(e) => begin(e, "resize")}
        />
      ) : null}
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
    <FreeLine
      card={card}
      lineKey={key}
      enabled={false}
      layout={layout[card][key]}
      className={className}
    >
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

function MobilePriceOverlay({ rates }: { rates: LaundryRates }) {
  const { enabled, setDbug, layout, patch, reset } = useMobileMinDbug();
  const [portalReady, setPortalReady] = useState(false);

  useEffect(() => setPortalReady(true), []);

  const dbugChrome = enabled ? (
    <div className="home-price-dbug-panel is-mobile-dock">
      <strong>DBUG min</strong>
      <div className="home-price-dbug-actions">
        <button type="button" onClick={reset}>
          Reset
        </button>
        <button type="button" onClick={() => setDbug(false)}>
          Hide
        </button>
      </div>
    </div>
  ) : (
    <button
      type="button"
      className="home-price-dbug-open is-mobile-dock"
      onClick={() => setDbug(true)}
    >
      DBUG
    </button>
  );

  return (
    <div
      className={`home-price-overlay is-mobile ${enabled ? "is-dbug" : ""}`}
      aria-hidden={enabled ? undefined : true}
    >
      {portalReady ? createPortal(dbugChrome, document.body) : null}
      <PriceCards
        rates={rates}
        layout={MOBILE_LAYOUT}
        boxes={MOBILE_BOXES}
        singleLine
      />
      <MinLine enabled={enabled} layout={layout} onPatch={patch}>
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

  return (
    <div className="home-price-overlay" aria-hidden="true">
      <PriceCards rates={rates} layout={DESKTOP_LAYOUT} boxes={DESKTOP_BOXES} />
      <MinLine enabled={false} layout={DESKTOP_MIN_LAYOUT}>
        Minimum order total: ${money(rates.minimumOrder)}.
      </MinLine>
    </div>
  );
}
