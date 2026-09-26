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

type LineKey = "amount" | "unit" | "title" | "fee";

type LineLayout = {
  /** Vertical position inside the card, % from top */
  top: number;
  /** Font size as % of card height */
  cqh: number;
};

type LayoutMap = Record<LineKey, LineLayout>;

const STORAGE_KEY = "foam-pricing-line-layout-v2";
const DBUG_KEY = "foam-pricing-dbug";

/** Shared row tops so left/right prices sit on the same height. */
const DEFAULT_LAYOUT: LayoutMap = {
  amount: { top: 14, cqh: 22 },
  unit: { top: 38, cqh: 7.2 },
  title: { top: 52, cqh: 9.5 },
  fee: { top: 78, cqh: 5.8 },
};

const LINE_LABELS: Record<LineKey, string> = {
  amount: "Price",
  unit: "per pound",
  title: "Title",
  fee: "Fee",
};

const LINE_ORDER: LineKey[] = ["amount", "unit", "title", "fee"];

function money(n: number) {
  return n.toFixed(2);
}

function loadLayout(): LayoutMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(DEFAULT_LAYOUT);
    const parsed = JSON.parse(raw) as Partial<LayoutMap>;
    const next = structuredClone(DEFAULT_LAYOUT);
    for (const key of LINE_ORDER) {
      const row = parsed[key];
      if (!row) continue;
      if (Number.isFinite(row.top)) next[key].top = row.top;
      if (Number.isFinite(row.cqh)) next[key].cqh = row.cqh;
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
  const [layout, setLayout] = useState<LayoutMap>(DEFAULT_LAYOUT);

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
    setLayout(loadLayout());
  }, []);

  const patchLine = (key: LineKey, patch: Partial<LineLayout>) => {
    setLayout((prev) => {
      const next: LayoutMap = {
        ...prev,
        [key]: {
          top: clamp(
            patch.top ?? prev[key].top,
            0,
            92
          ),
          cqh: clamp(patch.cqh ?? prev[key].cqh, 2, 40),
        },
      };
      next[key].top = Math.round(next[key].top * 10) / 10;
      next[key].cqh = Math.round(next[key].cqh * 10) / 10;
      saveLayout(next);
      return next;
    });
  };

  const setDbug = (on: boolean) => {
    setEnabled(on);
    localStorage.setItem(DBUG_KEY, on ? "1" : "0");
  };

  const reset = () => {
    const fresh = structuredClone(DEFAULT_LAYOUT);
    setLayout(fresh);
    saveLayout(fresh);
  };

  return { enabled, setDbug, layout, patchLine, reset };
}

function FreeLine({
  lineKey,
  enabled,
  layout,
  boxHeightPx,
  onPatch,
  className,
  children,
}: {
  lineKey: LineKey;
  enabled: boolean;
  layout: LineLayout;
  boxHeightPx: number;
  onPatch: (patch: Partial<LineLayout>) => void;
  className: string;
  children: ReactNode;
}) {
  const mode = useRef<"move" | "resize" | null>(null);
  const startY = useRef(0);
  const startTop = useRef(0);
  const startCqh = useRef(0);

  const begin = (
    e: ReactPointerEvent<HTMLElement>,
    nextMode: "move" | "resize"
  ) => {
    if (!enabled) return;
    e.preventDefault();
    e.stopPropagation();
    mode.current = nextMode;
    startY.current = e.clientY;
    startTop.current = layout.top;
    startCqh.current = layout.cqh;
    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);

    const onMove = (ev: PointerEvent) => {
      if (!boxHeightPx || !mode.current) return;
      const deltaPx = ev.clientY - startY.current;
      const deltaPct = (deltaPx / boxHeightPx) * 100;
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
      data-line={lineKey}
      style={{ top: `${layout.top}%` }}
      onPointerDown={(e) => begin(e, "move")}
    >
      <div
        className={className}
        style={{ fontSize: `${layout.cqh}cqh` }}
      >
        {children}
      </div>
      {enabled ? (
        <button
          type="button"
          className="home-price-dbug-handle"
          aria-label={`Resize ${LINE_LABELS[lineKey]}`}
          onPointerDown={(e) => begin(e, "resize")}
        />
      ) : null}
    </div>
  );
}

export function HomePriceOverlay() {
  const [rates, setRates] = useState<LaundryRates>(DEFAULT_LAUNDRY_RATES);
  const { enabled, setDbug, layout, patchLine, reset } = usePricingDbug();
  const boxRef = useRef<HTMLElement>(null);
  const [boxH, setBoxH] = useState(0);

  useEffect(() => subscribeLaundryRates(setRates), []);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const measure = () => setBoxH(el.getBoundingClientRect().height);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const line = (key: LineKey, className: string, content: ReactNode) => (
    <FreeLine
      lineKey={key}
      enabled={enabled}
      layout={layout[key]}
      boxHeightPx={boxH}
      onPatch={(patch) => patchLine(key, patch)}
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
            Drag a line to move it. Drag the orange handle to resize. Both
            cards stay locked to the same heights. Auto-saves here — when it
            looks right, tell me <b>done</b> and I&apos;ll lock it in the code
            for everyone.
          </p>
          <ul>
            {LINE_ORDER.map((key) => (
              <li key={key}>
                <span>{LINE_LABELS[key]}</span>
                <code>
                  {layout[key].top.toFixed(1)}% / {layout[key].cqh.toFixed(1)}cqh
                </code>
                <button
                  type="button"
                  onClick={() => patchLine(key, { cqh: layout[key].cqh - 0.5 })}
                >
                  −
                </button>
                <button
                  type="button"
                  onClick={() => patchLine(key, { cqh: layout[key].cqh + 0.5 })}
                >
                  +
                </button>
              </li>
            ))}
          </ul>
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
        ref={boxRef}
        className="home-price-box is-weekly"
        style={{
          left: "8.33%",
          top: "19.86%",
          width: "26.28%",
          height: "48.52%",
        }}
      >
        {line(
          "amount",
          "home-price-box-amount",
          <>
            <span className="home-price-box-dollar">$</span>
            {money(rates.weeklyPerLb)}
          </>
        )}
        {line("unit", "home-price-box-unit", "per pound")}
        {line("title", "home-price-box-title", "Weekly Service")}
        {line(
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
          "amount",
          "home-price-box-amount",
          <>
            <span className="home-price-box-dollar">$</span>
            {money(rates.standardPerLb)}
          </>
        )}
        {line("unit", "home-price-box-unit", "per pound")}
        {line(
          "title",
          "home-price-box-title",
          <>
            Only When You
            <br />
            Need Us
          </>
        )}
        {line(
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
