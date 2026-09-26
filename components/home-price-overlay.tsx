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
  cqh: number;
};

type CardLayout = Record<LineKey, LineLayout>;
type LayoutMap = Record<CardKey, CardLayout>;

type BoxGeom = {
  left: string;
  top: string;
  width: string;
  height: string;
};

const DESKTOP_LAYOUT: LayoutMap = {
  weekly: {
    amount: { top: 6.5, cqh: 22.6 },
    unit: { top: 33, cqh: 7 },
    title: { top: 47.3, cqh: 8.2 },
    fee: { top: 69.2, cqh: 6.5 },
  },
  ondemand: {
    amount: { top: 6.5, cqh: 22.6 },
    unit: { top: 33, cqh: 7 },
    title: { top: 46, cqh: 8.2 },
    fee: { top: 69.2, cqh: 6.5 },
  },
};

const MOBILE_DEFAULT_LAYOUT: LayoutMap = {
  weekly: {
    amount: { top: 10, cqh: 20 },
    unit: { top: 36, cqh: 7 },
    title: { top: 50, cqh: 9 },
    fee: { top: 72, cqh: 5.5 },
  },
  ondemand: {
    amount: { top: 10, cqh: 20 },
    unit: { top: 36, cqh: 7 },
    title: { top: 48, cqh: 9 },
    fee: { top: 72, cqh: 5.5 },
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

/** Stacked cards on mobile pricing panel (panel starts at composite fade). */
const MOBILE_BOXES: Record<CardKey, BoxGeom> = {
  weekly: {
    left: "22.87%",
    top: "15.24%",
    width: "54.26%",
    height: "18.16%",
  },
  ondemand: {
    left: "23.43%",
    top: "34.79%",
    width: "53.43%",
    height: "17.6%",
  },
};

const MOBILE_STORAGE_KEY = "foam-pricing-line-layout-mobile-v1";
const MOBILE_DBUG_KEY = "foam-pricing-dbug-mobile";
const MOBILE_LINK_KEY = "foam-pricing-dbug-link-mobile";

const LINE_ORDER: LineKey[] = ["amount", "unit", "title", "fee"];

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

function loadMobileLayout(): LayoutMap {
  try {
    const raw = localStorage.getItem(MOBILE_STORAGE_KEY);
    if (!raw) return structuredClone(MOBILE_DEFAULT_LAYOUT);
    const parsed = JSON.parse(raw) as Partial<LayoutMap>;
    const next = structuredClone(MOBILE_DEFAULT_LAYOUT);
    for (const card of ["weekly", "ondemand"] as CardKey[]) {
      for (const line of LINE_ORDER) {
        const row = parsed[card]?.[line];
        if (!row) continue;
        if (Number.isFinite(row.top)) next[card][line].top = row.top;
        if (Number.isFinite(row.cqh)) next[card][line].cqh = row.cqh;
      }
    }
    return next;
  } catch {
    return structuredClone(MOBILE_DEFAULT_LAYOUT);
  }
}

function saveMobileLayout(layout: LayoutMap) {
  localStorage.setItem(MOBILE_STORAGE_KEY, JSON.stringify(layout));
}

function useMobilePricingDbug() {
  const [enabled, setEnabled] = useState(true);
  const [linked, setLinkedState] = useState(false);
  const [layout, setLayout] = useState<LayoutMap>(MOBILE_DEFAULT_LAYOUT);
  const linkedRef = useRef(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const saved = localStorage.getItem(MOBILE_DBUG_KEY);
    const on =
      params.get("dbug") === "1" ||
      params.get("dbug") === "pricing" ||
      params.get("dbug") === "mobile" ||
      saved === "1" ||
      saved === null;
    setEnabled(on);
    if (saved === null) localStorage.setItem(MOBILE_DBUG_KEY, "1");
    const linkSaved = localStorage.getItem(MOBILE_LINK_KEY) === "1";
    setLinkedState(linkSaved);
    linkedRef.current = linkSaved;
    setLayout(loadMobileLayout());
  }, []);

  const patchLine = (
    card: CardKey,
    key: LineKey,
    patch: Partial<LineLayout>
  ) => {
    setLayout((prev) => {
      const current = prev[card][key];
      const nextLine: LineLayout = {
        top: Math.round(clamp(patch.top ?? current.top, 0, 92) * 10) / 10,
        cqh: Math.round(clamp(patch.cqh ?? current.cqh, 2, 40) * 10) / 10,
      };
      const next: LayoutMap = linkedRef.current
        ? {
            weekly: { ...prev.weekly, [key]: { ...nextLine } },
            ondemand: { ...prev.ondemand, [key]: { ...nextLine } },
          }
        : {
            ...prev,
            [card]: {
              ...prev[card],
              [key]: nextLine,
            },
          };
      saveMobileLayout(next);
      return next;
    });
  };

  const setDbug = (on: boolean) => {
    setEnabled(on);
    localStorage.setItem(MOBILE_DBUG_KEY, on ? "1" : "0");
  };

  const setLinked = (on: boolean) => {
    setLinkedState(on);
    linkedRef.current = on;
    localStorage.setItem(MOBILE_LINK_KEY, on ? "1" : "0");
  };

  const reset = () => {
    const fresh = structuredClone(MOBILE_DEFAULT_LAYOUT);
    setLayout(fresh);
    saveMobileLayout(fresh);
  };

  return { enabled, setDbug, linked, setLinked, layout, patchLine, reset };
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
  const startY = useRef(0);
  const startTop = useRef(0);
  const startCqh = useRef(0);
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
    boxH.current = box?.getBoundingClientRect().height ?? 0;
    mode.current = nextMode;
    startY.current = e.clientY;
    startTop.current = layout.top;
    startCqh.current = layout.cqh;
    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);

    const onMove = (ev: PointerEvent) => {
      if (!boxH.current || !mode.current || !onPatch) return;
      const deltaPct = ((ev.clientY - startY.current) / boxH.current) * 100;
      if (mode.current === "move") {
        onPatch({ top: startTop.current + deltaPct });
      } else {
        onPatch({ cqh: startCqh.current + deltaPct });
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
      style={{ top: `${layout.top}%` }}
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

function PriceCards({
  rates,
  layout,
  boxes,
  dbug,
  onPatch,
  singleLine = false,
}: {
  rates: LaundryRates;
  layout: LayoutMap;
  boxes: Record<CardKey, BoxGeom>;
  dbug: boolean;
  onPatch?: (card: CardKey, key: LineKey, patch: Partial<LineLayout>) => void;
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
      enabled={dbug}
      layout={layout[card][key]}
      onPatch={onPatch ? (patch) => onPatch(card, key, patch) : undefined}
      className={className}
    >
      {content}
    </FreeLine>
  );

  const feeClass = singleLine
    ? "home-price-box-fee is-nowrap"
    : "home-price-box-fee";
  const ondemandTitle = singleLine ? (
    "Only When You Need Us"
  ) : (
    <>
      Only When You
      <br />
      Need Us
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
          singleLine ? "home-price-box-title is-nowrap" : "home-price-box-title",
          "Weekly Service"
        )}
        {line("weekly", "fee", feeClass, feeText)}
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
        {line("ondemand", "fee", feeClass, feeText)}
      </article>
    </>
  );
}

function DesktopPriceOverlay({ rates }: { rates: LaundryRates }) {
  return (
    <div className="home-price-overlay" aria-hidden="true">
      <PriceCards
        rates={rates}
        layout={DESKTOP_LAYOUT}
        boxes={DESKTOP_BOXES}
        dbug={false}
      />
    </div>
  );
}

function MobilePriceOverlay({ rates }: { rates: LaundryRates }) {
  const { enabled, setDbug, linked, setLinked, layout, patchLine, reset } =
    useMobilePricingDbug();
  const [portalReady, setPortalReady] = useState(false);

  useEffect(() => setPortalReady(true), []);

  const dbugChrome = enabled ? (
    <div className="home-price-dbug-panel is-mobile-dock">
      <strong>DBUG</strong>
      <div className="home-price-dbug-mode" role="group" aria-label="Move mode">
        <button
          type="button"
          className={!linked ? "is-active" : undefined}
          onClick={() => setLinked(false)}
        >
          Solo
        </button>
        <button
          type="button"
          className={linked ? "is-active" : undefined}
          onClick={() => setLinked(true)}
        >
          Linked
        </button>
      </div>
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
        layout={layout}
        boxes={MOBILE_BOXES}
        dbug={enabled}
        onPatch={patchLine}
        singleLine
      />
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
