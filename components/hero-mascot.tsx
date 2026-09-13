import { Sparkles } from "lucide-react";

export function HeroMascot() {
  return (
    <div className="hero-art">
      <div className="hero-art-glow" aria-hidden="true" />
      <div className="hero-art-shadow" aria-hidden="true" />

      <div className="hero-art-frame">
        {/* Plain <img>, not next/image: avoids depending on the sharp
            package for image optimization, which isn't guaranteed to be
            installed in every environment this project runs in. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/foam-hero-laundry.webp"
          alt="FOAM drawstring laundry bag beside a stack of freshly folded towels, with the FOAM koala mascot peeking out from behind"
          width={1400}
          height={850}
          className="hero-art-image"
          fetchPriority="high"
        />

        <span className="hero-bubble hero-bubble-one" aria-hidden="true" />
        <span className="hero-bubble hero-bubble-two" aria-hidden="true" />
        <span className="hero-bubble hero-bubble-three" aria-hidden="true" />
      </div>

      <div className="hero-stamp">
        <Sparkles />
        <span>
          Freshly handled
          <br />
          Door to door
        </span>
      </div>
    </div>
  );
}
