export function LaundryBasketIllustration({
  className,
}: {
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 360 300"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label="An illustration of a laundry basket overflowing with folded clothes and soap bubbles"
    >
      {/* ground shadow */}
      <ellipse cx="180" cy="292" rx="110" ry="8" fill="var(--color-foreground)" opacity="0.08" />

      {/* bubbles */}
      <circle cx="112" cy="30" r="7" fill="var(--color-accent)" opacity="0.9" />
      <circle cx="141" cy="14" r="4" fill="var(--color-accent-strong)" opacity="0.7" />
      <circle cx="252" cy="26" r="9" fill="var(--color-accent)" opacity="0.9" />
      <circle cx="278" cy="48" r="4" fill="var(--color-accent-strong)" opacity="0.7" />
      <circle cx="90" cy="58" r="4" fill="var(--color-accent-strong)" opacity="0.5" />

      {/* back clothing piece */}
      <path
        d="M100,148 C84,96 122,54 172,60 C202,64 216,92 208,122 C246,102 276,118 270,148 C260,168 124,172 100,148 Z"
        fill="color-mix(in oklch, var(--color-foreground) 72%, white)"
      />

      {/* main clothing piece */}
      <path
        d="M126,158 C108,110 146,76 190,82 C210,85 222,102 216,124 C246,112 268,132 256,154 C238,180 154,180 126,158 Z"
        fill="var(--color-accent-strong)"
      />
      <path
        d="M150,110 C165,124 185,128 205,120"
        stroke="white"
        strokeWidth="2.5"
        strokeLinecap="round"
        opacity="0.55"
      />

      {/* folded light piece */}
      <path
        d="M146,140 C140,114 166,98 190,108 C204,114 206,130 196,140 C182,154 154,154 146,140 Z"
        fill="var(--color-background)"
        stroke="var(--color-foreground)"
        strokeWidth="3"
      />

      {/* light accent piece */}
      <path
        d="M220,130 C214,112 234,100 252,110 C261,116 260,128 251,135 C240,144 224,141 220,130 Z"
        fill="var(--color-accent)"
      />

      {/* basket rim */}
      <rect
        x="46"
        y="150"
        width="268"
        height="20"
        rx="10"
        fill="var(--color-background)"
        stroke="var(--color-foreground)"
        strokeWidth="3.5"
      />

      {/* handles */}
      <ellipse cx="46" cy="160" rx="10" ry="14" fill="var(--color-background)" stroke="var(--color-foreground)" strokeWidth="3" />
      <ellipse cx="314" cy="160" rx="10" ry="14" fill="var(--color-background)" stroke="var(--color-foreground)" strokeWidth="3" />

      {/* basket body */}
      <path
        d="M58,170 L302,170 L272,278 C270,284 264,288 258,288 L102,288 C96,288 90,284 88,278 Z"
        fill="var(--color-background)"
        stroke="var(--color-foreground)"
        strokeWidth="3.5"
        strokeLinejoin="round"
      />

      {/* basket slats */}
      <g stroke="var(--color-foreground)" strokeWidth="2" opacity="0.55">
        <line x1="98" y1="178" x2="94" y2="278" />
        <line x1="130" y1="178" x2="128" y2="282" />
        <line x1="162" y1="178" x2="161" y2="284" />
        <line x1="198" y1="178" x2="199" y2="284" />
        <line x1="230" y1="178" x2="232" y2="282" />
        <line x1="262" y1="178" x2="266" y2="278" />
      </g>
      <g stroke="var(--color-foreground)" strokeWidth="2" opacity="0.4">
        <line x1="70" y1="205" x2="290" y2="205" />
        <line x1="76" y1="240" x2="284" y2="240" />
      </g>
    </svg>
  );
}
