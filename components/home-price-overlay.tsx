"use client";

import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";

import {
  DEFAULT_LAUNDRY_RATES,
  subscribeLaundryRates,
  type LaundryRates,
} from "@/lib/laundry-rates";

type CardKey = "weekly" | "ondemand";
type LineKey = "amount" | "unit" | "title" | "fee";

type LineLayout = {
  top: number;
  cqh: number;
};

type CardLayout = Record<LineKey, LineLayout>;
type LayoutMap = Record<CardKey, CardLayout>;

const STORAGE_KEY = "foam-pricing-line-layout-v3";
const DBUG_KEY = "foam-pricing-dbug";
const LINK_KEY = "foam-pricing-dbug-link";

const DEFAULT_CARD: CardLayout = {
  amount: { top: 14, cqh: 22 },
  unit: { top: 38, cqh: 7.2 },
  title: { top: 52, cqh: 9.5 },
  fee: { top: 78, cqh: 5.8 },
};

const DEFAULT_LAYOUT: LayoutMap = {
  weekly: structuredClone(DEFAULT_CARD),
  ondemand: structuredClone(DEFAULT_CARD),
};

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

function loadLayout(): LayoutMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(DEFAULT_LAYOUT);
    const parsed = JSON.parse(raw) as Partial<LayoutMap>;
    const next = structuredClone(DEFAULT_LAYOUT);
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
    return structuredClone(DEFAULT_LAYOUT);
  }
}

function saveLayout(layout: LayoutMap) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function usePricingDbug() {
  const [enabled, setEnabled] = useState(true);
  const [linked, setLinkedState] = useState(false);
  const [layout, setLayout] = useState<LayoutMap>(DEFAULT_LAYOUT);
  const linkedRef = useRef(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const saved = localStorage.getItem(DBUG_KEY);
    const on =
      params.get("dbug") === "1" ||
      params.get("dbug") === "pricing" ||
      saved === "1" ||
      saved === null;
    setEnabled(on);
    if (saved === null) localStorage.setItem(DBUG_KEY, "1");
    const linkSaved = localStorage.getItem(LINK_KEY) === "1";
    setLinkedState(linkSaved);
    linkedRef.current = linkSaved;
    setLayout(loadLayout());
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
      saveLayout(next);
      return next;
    });
  };

  const setDbug = (on: boolean) => {
    setEnabled(on);
    localStorage.setItem(DBUG_KEY, on ? "1" : "0");
  };

  const setLinked = (on: boolean) => {
    setLinkedState(on);
    linkedRef.current = on;
    localStorage.setItem(LINK_KEY, on ? "1" : "0");
  };

  const reset = () => {
    const fresh = structuredClone(DEFAULT_LAYOUT);
    setLayout(fresh);
    saveLayout(fresh);
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
  onPatch: (patch: Partial<LineLayout>) => void;
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
    if (!enabled) return;
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
      if (!boxH.current || !mode.current) return;
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
      onPointerDown={(e) => begin(e, "move")}
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

export function HomePriceOverlay() {
  const [rates, setRates] = useState<LaundryRates>(DEFAULT_LAUNDRY_RATES);
  const { enabled, setDbug, linked, setLinked, layout, patchLine, reset } =
    usePricingDbug();

  useEffect(() => subscribeLaundryRates(setRates), []);

  const line = (
    card: CardKey,
    key: LineKey,
    className: string,
    content: ReactNode
  ) => (
    <FreeLine
      card={card}
      lineKey={key}
      enabled={enabled}
      layout={layout[card][key]}
      onPatch={(patch) => patchLine(card, key, patch)}
      className={className}
    >
      {content}
    </FreeLine>
  );

  return (
    <div
      className={`home-price-overlay ${enabled ? "is-dbug" : ""}`}
      aria-hidden={enabled ? undefined : true}
    >
      {enabled ? (
        <div className="home-price-dbug-panel">
          <strong>DBUG type</strong>
          <p>
            Drag a line to move. Orange handle = resize. Choose Solo or Linked
            below. Auto-saves — tell me <b>done</b> to lock in code.
          </p>
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
          <p className="home-price-dbug-mode-hint">
            {linked
              ? "Linked: both cards move/resize together."
              : "Solo: only the card you drag moves."}
          </p>
          <div className="home-price-dbug-actions">
            <button type="button" onClick={reset}>
              Reset
            </button>
            <button type="button" onClick={() => setDbug(false)}>
              Hide DBUG
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="home-price-dbug-open"
          onClick={() => setDbug(true)}
        >
          DBUG
        </button>
      )}

      <article
        className="home-price-box is-weekly"
        style={{
          left: "8.33%",
          top: "19.86%",
          width: "26.28%",
          height: "48.52%",
        }}
      >
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
        {line("weekly", "title", "home-price-box-title", "Weekly Service")}
        {line(
          "weekly",
          "fee",
          "home-price-box-fee is-nowrap",
          `+ $${money(rates.deliveryFee)} Service Fee per Pickup`
        )}
      </article>

      <article
        className="home-price-box is-ondemand"
        style={{
          left: "38.46%",
          top: "19.77%",
          width: "25.21%",
          height: "48.7%",
        }}
      >
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
          "home-price-box-title",
          <>
            Only When You
            <br />
            Need Us
          </>
        )}
        {line(
          "ondemand",
          "fee",
          "home-price-box-fee",
          <>
            + ${money(rates.deliveryFee)} Service Fee
            <br />
            per Pickup
          </>
        )}
      </article>
    </div>
  );
}
