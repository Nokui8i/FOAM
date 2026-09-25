"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type BoxKey =
  | "weeklyBig"
  | "ondemandBig"
  | "feeWeekly"
  | "feeOndemand"
  | "minimum";

type Box = {
  key: BoxKey;
  label: string;
  left: number;
  top: number;
  width: number;
  height: number;
  color: string;
};

const STORAGE_KEY = "foam-pricing-debug-boxes-v1";

/** Seeded near the number-only areas on desktop panel 4 (3840×2160). */
const DEFAULT_BOXES: Box[] = [
  {
    key: "weeklyBig",
    label: "1 · weekly big",
    left: 17.2,
    top: 24.0,
    width: 13.5,
    height: 9.0,
    color: "#ff2d55",
  },
  {
    key: "ondemandBig",
    label: "2 · on-demand big",
    left: 41.5,
    top: 24.0,
    width: 13.5,
    height: 9.0,
    color: "#00e5ff",
  },
  {
    key: "feeWeekly",
    label: "3 · fee weekly",
    left: 16.2,
    top: 51.2,
    width: 6.5,
    height: 2.8,
    color: "#ff9500",
  },
  {
    key: "feeOndemand",
    label: "4 · fee on-demand",
    left: 43.0,
    top: 51.2,
    width: 6.5,
    height: 2.8,
    color: "#af52de",
  },
  {
    key: "minimum",
    label: "5 · minimum",
    left: 52.5,
    top: 64.5,
    width: 8.5,
    height: 3.2,
    color: "#34c759",
  },
];

type DragMode = "move" | "resize";

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export function HomePricingDebugDrag() {
  const rootRef = useRef<HTMLDivElement>(null);
  const [boxes, setBoxes] = useState<Box[]>(DEFAULT_BOXES);
  const [copied, setCopied] = useState(false);
  const dragRef = useRef<{
    key: BoxKey;
    mode: DragMode;
    startX: number;
    startY: number;
    origin: Box;
  } | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Box[];
      if (Array.isArray(parsed) && parsed.length === DEFAULT_BOXES.length) {
        setBoxes(parsed);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(boxes));
    } catch {
      /* ignore */
    }
  }, [boxes]);

  const onPointerMove = useCallback((event: PointerEvent) => {
    const drag = dragRef.current;
    const root = rootRef.current;
    if (!drag || !root) return;

    const rect = root.getBoundingClientRect();
    const dxPct = ((event.clientX - drag.startX) / rect.width) * 100;
    const dyPct = ((event.clientY - drag.startY) / rect.height) * 100;
    const o = drag.origin;

    setBoxes((prev) =>
      prev.map((box) => {
        if (box.key !== drag.key) return box;
        if (drag.mode === "move") {
          return {
            ...box,
            left: round2(clamp(o.left + dxPct, 0, 100 - o.width)),
            top: round2(clamp(o.top + dyPct, 0, 100 - o.height)),
          };
        }
        return {
          ...box,
          width: round2(clamp(o.width + dxPct, 1.5, 100 - o.left)),
          height: round2(clamp(o.height + dyPct, 1.2, 100 - o.top)),
        };
      })
    );
  }, []);

  const endDrag = useCallback(() => {
    dragRef.current = null;
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", endDrag);
  }, [onPointerMove]);

  const startDrag = (
    event: React.PointerEvent,
    key: BoxKey,
    mode: DragMode
  ) => {
    event.preventDefault();
    event.stopPropagation();
    const origin = boxes.find((b) => b.key === key);
    if (!origin) return;
    dragRef.current = {
      key,
      mode,
      startX: event.clientX,
      startY: event.clientY,
      origin: { ...origin },
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", endDrag);
  };

  const copyJson = async () => {
    const payload = Object.fromEntries(
      boxes.map((b) => [
        b.key,
        {
          left: b.left,
          top: b.top,
          width: b.width,
          height: b.height,
        },
      ])
    );
    const text = JSON.stringify(payload, null, 2);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      window.prompt("Copy positions:", text);
    }
  };

  const reset = () => {
    localStorage.removeItem(STORAGE_KEY);
    setBoxes(DEFAULT_BOXES);
  };

  return (
    <div ref={rootRef} className="home-price-debug-drag" aria-hidden="true">
      <div className="home-price-debug-toolbar">
        <button type="button" onClick={copyJson}>
          {copied ? "Copied ✓" : "Copy JSON"}
        </button>
        <button type="button" onClick={reset}>
          Reset
        </button>
        <span>Drag box · corner = resize</span>
      </div>

      {boxes.map((box) => (
        <div
          key={box.key}
          className="home-price-debug-box"
          style={{
            left: `${box.left}%`,
            top: `${box.top}%`,
            width: `${box.width}%`,
            height: `${box.height}%`,
            borderColor: box.color,
            background: `${box.color}22`,
          }}
          onPointerDown={(e) => startDrag(e, box.key, "move")}
        >
          <span className="home-price-debug-label">
            {box.label}
            <br />
            L{box.left} T{box.top} · {box.width}×{box.height}
          </span>
          <span
            className="home-price-debug-handle"
            onPointerDown={(e) => startDrag(e, box.key, "resize")}
          />
        </div>
      ))}
    </div>
  );
}
