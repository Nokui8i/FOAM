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

type TypeScales = Record<LineKey, number>;

const STORAGE_KEY = "foam-pricing-type-cqh";
const DBUG_KEY = "foam-pricing-dbug";

const DEFAULT_SCALES: TypeScales = {
  amount: 24,
  unit: 7.4,
  title: 10.5,
  fee: 6.2,
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

function loadScales(): TypeScales {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SCALES };
    const parsed = JSON.parse(raw) as Partial<TypeScales>;
    return {
      amount: Number(parsed.amount) || DEFAULT_SCALES.amount,
      unit: Number(parsed.unit) || DEFAULT_SCALES.unit,
      title: Number(parsed.title) || DEFAULT_SCALES.title,
      fee: Number(parsed.fee) || DEFAULT_SCALES.fee,
    };
  } catch {
    return { ...DEFAULT_SCALES };
  }
}

function saveScales(scales: TypeScales) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(scales));
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function usePricingDbug() {
  const [enabled, setEnabled] = useState(true);
  const [scales, setScales] = useState<TypeScales>(DEFAULT_SCALES);

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
    setScales(loadScales());
  }, []);

  const updateScale = (key: LineKey, cqh: number) => {
    setScales((prev) => {
      const next = {
        ...prev,
        [key]: Math.round(clamp(cqh, 2, 45) * 10) / 10,
      };
      saveScales(next);
      return next;
    });
  };

  const setDbug = (on: boolean) => {
    setEnabled(on);
    localStorage.setItem(DBUG_KEY, on ? "1" : "0");
  };

  const reset = () => {
    setScales({ ...DEFAULT_SCALES });
    saveScales(DEFAULT_SCALES);
  };

  return { enabled, setDbug, scales, updateScale, reset };
}

function DbugLine({
  lineKey,
  enabled,
  cqh,
  boxHeightPx,
  onChange,
  className,
  children,
}: {
  lineKey: LineKey;
  enabled: boolean;
  cqh: number;
  boxHeightPx: number;
  onChange: (cqh: number) => void;
  className: string;
  children: ReactNode;
}) {
  const startY = useRef(0);
  const startCqh = useRef(0);

  const onPointerDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (!enabled) return;
    e.preventDefault();
    e.stopPropagation();
    startY.current = e.clientY;
    startCqh.current = cqh;
    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);

    const onMove = (ev: PointerEvent) => {
      if (!boxHeightPx) return;
      const deltaPx = ev.clientY - startY.current;
      const deltaCqh = (deltaPx / boxHeightPx) * 100;
      onChange(startCqh.current + deltaCqh);
    };
    const onUp = (ev: PointerEvent) => {
      target.releasePointerCapture(ev.pointerId);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  return (
    <div
      className={`home-price-dbug-line ${enabled ? "is-dbug" : ""}`}
      data-line={lineKey}
    >
      <div className={className} style={{ fontSize: `${cqh}cqh` }}>
        {children}
      </div>
      {enabled ? (
        <button
          type="button"
          className="home-price-dbug-handle"
          aria-label={`Resize ${LINE_LABELS[lineKey]}`}
          onPointerDown={onPointerDown}
        />
      ) : null}
    </div>
  );
}

export function HomePriceOverlay() {
  const [rates, setRates] = useState<LaundryRates>(DEFAULT_LAUNDRY_RATES);
  const { enabled, setDbug, scales, updateScale, reset } = usePricingDbug();
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
    <DbugLine
      lineKey={key}
      enabled={enabled}
      cqh={scales[key]}
      boxHeightPx={boxH}
      onChange={(v) => updateScale(key, v)}
      className={className}
    >
      {content}
    </DbugLine>
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
            Drag the orange handle under each line to resize. Sizes save
            automatically in this browser.
          </p>
          <ul>
            {LINE_ORDER.map((key) => (
              <li key={key}>
                <span>{LINE_LABELS[key]}</span>
                <code>{scales[key].toFixed(1)}cqh</code>
                <button
                  type="button"
                  onClick={() => updateScale(key, scales[key] - 0.5)}
                >
                  −
                </button>
                <button
                  type="button"
                  onClick={() => updateScale(key, scales[key] + 0.5)}
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
          "home-price-box-fee",
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
