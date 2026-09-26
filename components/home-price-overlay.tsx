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

/** Defaults for mobile card DBUG (localStorage overrides). */
const MOBILE_CARD_DEFAULT: LayoutMap = {
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

/** Locked from desktop DBUG Copy. */
const DESKTOP_MIN_LAYOUT: LineLayout = {
  top: 70.3,
  x: -12.4,
  cqh: 3.4,
};

/** Locked from mobile DBUG Copy. */
const MOBILE_MIN_LAYOUT: LineLayout = {
  top: 77.5,
  x: -1.7,
  cqh: 2.6,
};

const MOBILE_CARD_STORAGE = "foam-pricing-line-layout-mobile-v2";
const MOBILE_CARD_DBUG = "foam-pricing-dbug-mobile-cards";
const MOBILE_CARD_LINK = "foam-pricing-dbug-link-mobile-cards";

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

function loadMobileCardLayout(): LayoutMap {
  try {
    const raw = localStorage.getItem(MOBILE_CARD_STORAGE);
    if (!raw) return structuredClone(MOBILE_CARD_DEFAULT);
    const parsed = JSON.parse(raw) as Partial<LayoutMap>;
    const next = structuredClone(MOBILE_CARD_DEFAULT);
    for (const card of ["weekly", "ondemand"] as CardKey[]) {
      for (const line of LINE_ORDER) {
        const row = parsed[card]?.[line];
        if (!row) continue;
        if (Number.isFinite(row.top)) next[card][line].top = row.top;
        if (Number.isFinite(row.x)) next[card][line].x = row.x;
        if (Number.isFinite(row.cqh)) next[card][line].cqh = row.cqh;
      }
    }
    return next;
  } catch {
    return structuredClone(MOBILE_CARD_DEFAULT);
  }
}

function useMobileCardDbug() {
  const [enabled, setEnabled] = useState(true);
  const [linked, setLinkedState] = useState(false);
  const [layout, setLayout] = useState<LayoutMap>(MOBILE_CARD_DEFAULT);
  const [copied, setCopied] = useState(false);
  const linkedRef = useRef(false);

  useEffect(() => {
    localStorage.setItem(MOBILE_CARD_DBUG, "1");
    setEnabled(true);
    const linkSaved = localStorage.getItem(MOBILE_CARD_LINK) === "1";
    setLinkedState(linkSaved);
    linkedRef.current = linkSaved;
    setLayout(loadMobileCardLayout());
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
        x: Math.round(clamp(patch.x ?? current.x, -40, 40) * 10) / 10,
        cqh: Math.round(clamp(patch.cqh ?? current.cqh, 2, 48) * 10) / 10,
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
      localStorage.setItem(MOBILE_CARD_STORAGE, JSON.stringify(next));
      return next;
    });
  };

  const setDbug = (on: boolean) => {
    setEnabled(on);
    localStorage.setItem(MOBILE_CARD_DBUG, on ? "1" : "0");
  };

  const setLinked = (on: boolean) => {
    setLinkedState(on);
    linkedRef.current = on;
    localStorage.setItem(MOBILE_CARD_LINK, on ? "1" : "0");
  };

  const reset = () => {
    const fresh = structuredClone(MOBILE_CARD_DEFAULT);
    setLayout(fresh);
    localStorage.setItem(MOBILE_CARD_STORAGE, JSON.stringify(fresh));
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

  return {
    enabled,
    setDbug,
    linked,
    setLinked,
    layout,
    patchLine,
    reset,
    copy,
    copied,
  };
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
  card?: CardKey;
  lineKey?: LineKey;
  enabled?: boolean;
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
  const dbug = Boolean(enabled && onPatch);

  const begin = (
    e: ReactPointerEvent<HTMLElement>,
    nextMode: "move" | "resize"
  ) => {
    if (!dbug || !onPatch) return;
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
      className={`home-price-free-line ${dbug ? "is-dbug" : ""}`}
      data-card={card}
      data-line={lineKey}
      style={{
        top: `${layout.top}%`,
        transform: layout.x ? `translateX(${layout.x}%)` : undefined,
      }}
      onPointerDown={dbug ? (e) => begin(e, "move") : undefined}
    >
      <div className={className} style={{ fontSize: `${layout.cqh}cqh` }}>
        {children}
      </div>
      {dbug ? (
        <button
          type="button"
          className="home-price-dbug-handle"
          aria-label={`Resize ${card ?? ""} ${lineKey ? LINE_LABELS[lineKey] : ""}`}
          onPointerDown={(e) => begin(e, "resize")}
        />
      ) : null}
    </div>
  );
}

function MinLine({
  layout,
  children,
}: {
  layout: LineLayout;
  children: ReactNode;
}) {
  return (
    <div
      className="home-price-min-line"
      data-line="minimum"
      style={{
        top: `${layout.top}%`,
        transform: layout.x ? `translateX(${layout.x}%)` : undefined,
      }}
    >
      <p className="home-price-min-text" style={{ fontSize: `${layout.cqh}cqh` }}>
        {children}
      </p>
    </div>
  );
}

function PriceCards({
  rates,
  layout,
  boxes,
  singleLine = false,
  dbug = false,
  onPatch,
}: {
  rates: LaundryRates;
  layout: LayoutMap;
  boxes: Record<CardKey, BoxGeom>;
  singleLine?: boolean;
  dbug?: boolean;
  onPatch?: (card: CardKey, key: LineKey, patch: Partial<LineLayout>) => void;
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

function DesktopPriceOverlay({ rates }: { rates: LaundryRates }) {
  return (
    <div className="home-price-overlay" aria-hidden="true">
      <PriceCards rates={rates} layout={DESKTOP_LAYOUT} boxes={DESKTOP_BOXES} />
      <MinLine layout={DESKTOP_MIN_LAYOUT}>
        Minimum order total: ${money(rates.minimumOrder)}.
      </MinLine>
    </div>
  );
}

function MobilePriceOverlay({ rates }: { rates: LaundryRates }) {
  const {
    enabled,
    setDbug,
    linked,
    setLinked,
    layout,
    patchLine,
    reset,
    copy,
    copied,
  } = useMobileCardDbug();
  const [portalReady, setPortalReady] = useState(false);
  useEffect(() => setPortalReady(true), []);

  const dbugChrome = enabled ? (
    <div className="home-price-dbug-panel is-mobile-dock">
      <strong>DBUG cards</strong>
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
        singleLine
        dbug={enabled}
        onPatch={patchLine}
      />
      <MinLine layout={MOBILE_MIN_LAYOUT}>
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
