"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import styles from "./washer-animation.module.css";

/** Coordinates are tied to the existing v21 / v18 homepage artwork. */
export function WasherAnimation({ mobile = false }: { mobile?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new IntersectionObserver(([entry]) => {
      setVisible(entry.isIntersecting);
    }, { threshold: 0.65 });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const source = mobile ? "/home-mockup-mobile-v18.png" : "/home-mockup-desktop-v21.png";
  return (
    <div ref={ref} aria-hidden="true" className={`${styles.machine} ${mobile ? styles.mobile : styles.desktop} ${visible ? styles.active : ""}`}>
      <div className={styles.drum}><div className={styles.interior} /></div>
      <div className={styles.hinge}>
        <div className={styles.door}>
          {/* Reuse the actual photographed door rather than an invented replacement. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={source} alt="" className={styles.doorImage} />
        </div>
      </div>
      <div className={styles.bubbles}>
        {Array.from({ length: 12 }, (_, i) => (
          <span key={i} className={styles.bubble} style={{
            "--delay": `${1.2 + i * 0.35}s`,
            "--size": `${13 + (i * 11) % 28}%`,
            "--drift": `${-130 + (i * 67) % 330}%`,
            "--rise": `${-240 - (i * 53) % 200}%`,
          } as CSSProperties} />
        ))}
      </div>
    </div>
  );
}
