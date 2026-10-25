"use client";
// The landing page's background: a faint ledger grid in --line, fixed behind the whole page, and a diamond of
// the same grid in --lime (the safe-to-pay highlight) that follows the mouse, brightest at the cursor and
// fading toward its tips. The diamond is two diagonal bands masked together (intersect), so the lime grid
// shows only where both overlap. The pointer is read once per frame and written to CSS variables: no React
// re-render, no layout. Takes no pointer events; on touch screens (no cursor) nothing lights up.

import { useEffect, useRef } from "react";

const CELL = 32;
/** Half the diamond's width, tip to centre. */
const R = 200;

const gridOf = (color: string, width = "1px") => ({
  backgroundImage: `linear-gradient(to right, ${color} ${width}, transparent ${width}), linear-gradient(to bottom, ${color} ${width}, transparent ${width})`,
  backgroundSize: `${CELL}px ${CELL}px`,
});

const LIME_GRID = gridOf("var(--lime)", "var(--glow-line)");

const BAND = (deg: number) => `linear-gradient(${deg}deg, transparent 18%, black 50%, transparent 82%)`;
const DIAMOND = `${BAND(45)}, ${BAND(-45)}`;
const AT = `calc(var(--x, -999px) - ${R}px) calc(var(--y, -999px) - ${R}px)`;

/** The lime grid, shown only inside the diamond under the cursor (both prefixed and standard mask properties). */
const GLOW = {
  // The lime lines over a soft lime fill of the lit cells, so the diamond reads on the pale light background too.
  backgroundImage: `${LIME_GRID.backgroundImage}, linear-gradient(color-mix(in srgb, var(--lime) var(--glow-fill), transparent), color-mix(in srgb, var(--lime) var(--glow-fill), transparent))`,
  backgroundSize: `${CELL}px ${CELL}px, ${CELL}px ${CELL}px, 100% 100%`,
  maskImage: DIAMOND, WebkitMaskImage: DIAMOND,
  maskSize: `${R * 2}px ${R * 2}px`, WebkitMaskSize: `${R * 2}px ${R * 2}px`,
  maskRepeat: "no-repeat", WebkitMaskRepeat: "no-repeat",
  maskPosition: `${AT}, ${AT}`, WebkitMaskPosition: `${AT}, ${AT}`,
  maskComposite: "intersect", WebkitMaskComposite: "source-in",
} as const;

export function HeroBackdrop() {
  const glow = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = glow.current;
    if (!el) return;
    let frame = 0, x = 0, y = 0;
    const paint = () => {
      frame = 0;
      el.style.setProperty("--x", `${x}px`);
      el.style.setProperty("--y", `${y}px`);
      el.style.opacity = "1";
    };
    const move = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      x = e.clientX; y = e.clientY;
      if (!frame) frame = requestAnimationFrame(paint);
    };
    const leave = () => { el.style.opacity = "0"; };
    window.addEventListener("pointermove", move, { passive: true });
    document.documentElement.addEventListener("pointerleave", leave);
    return () => {
      window.removeEventListener("pointermove", move);
      document.documentElement.removeEventListener("pointerleave", leave);
      cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div aria-hidden="true" data-testid="hero-backdrop" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0 opacity-60" style={gridOf("var(--line)")} />
      {/* Light mode: 2px lines and a stronger fill, since lime on a pale page is faint; dark keeps it fine and subtle. */}
      <div ref={glow} data-testid="grid-glow" style={GLOW}
        className="absolute inset-0 opacity-0 transition-opacity duration-200 [--glow-fill:30%] [--glow-line:2px] motion-reduce:transition-none dark:[--glow-fill:10%] dark:[--glow-line:1px]" />
    </div>
  );
}
