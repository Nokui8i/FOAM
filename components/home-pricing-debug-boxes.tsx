/** Temporary debug outlines for pricing card boxes on the homepage mockup. */

type Box = { left: number; top: number; width: number; height: number; label: string };

const DESKTOP_BOXES: Box[] = [
  { left: 7.76, top: 23.15, width: 28.54, height: 44.26, label: "L weekly" },
  { left: 34.92, top: 23.15, width: 30, height: 44.31, label: "R on-demand" },
];

/** Blank art letterboxed in mobile pricing band (810px / 2308px). */
const MOBILE_OFFSET_Y = 32.45;
const MOBILE_SCALE_Y = 0.351;
const MOBILE_BOXES: Box[] = DESKTOP_BOXES.map((b) => ({
  ...b,
  top: MOBILE_OFFSET_Y + b.top * MOBILE_SCALE_Y,
  height: b.height * MOBILE_SCALE_Y,
}));

export function HomePricingDebugBoxes({ variant }: { variant: "desktop" | "mobile" }) {
  const boxes = variant === "desktop" ? DESKTOP_BOXES : MOBILE_BOXES;

  return (
    <div className={`home-pricing-debug is-${variant}`} aria-hidden="true">
      {boxes.map((box) => (
        <div
          key={box.label}
          className="home-pricing-debug-box"
          style={{
            left: `${box.left}%`,
            top: `${box.top}%`,
            width: `${box.width}%`,
            height: `${box.height}%`,
          }}
        >
          <span className="home-pricing-debug-label">
            {box.label}
            <br />
            {box.left.toFixed(1)}/{box.top.toFixed(1)} · {box.width.toFixed(1)}×
            {box.height.toFixed(1)}
          </span>
        </div>
      ))}
    </div>
  );
}
