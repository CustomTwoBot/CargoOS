"use client";
// The app's motion (docs/design.md §0.5): amounts count to their new value, cards rise in, a
// changed row flashes once. Every effect respects prefers-reduced-motion and never moves money
// on its own: the number shown is always the engine's, only the way it arrives is animated.
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { money } from "@/components/case/format";

const query = "(prefers-reduced-motion: reduce)";
const subscribe = (l: () => void) => {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const m = window.matchMedia(query);
  m.addEventListener?.("change", l);
  return () => m.removeEventListener?.("change", l);
};
// No matchMedia (jsdom in tests, very old browsers): no motion, so values land at once.
const read = () => (typeof window === "undefined" || !window.matchMedia || window.matchMedia(query).matches);

export const useReducedMotion = () => useSyncExternalStore(subscribe, read, () => true);

const ease = (t: number) => 1 - Math.pow(1 - t, 3);

/** The value, counting from the previous one over `ms` when it changes. Starts at the value (no count on first paint). */
export function useCountUp(value: number, ms = 900): number {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  const raf = useRef<number>(undefined);
  useEffect(() => {
    if (reduced || typeof requestAnimationFrame === "undefined" || from.current === value) {
      from.current = value;
      setShown(value);
      return;
    }
    const start = performance.now(), a = from.current;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      setShown(Math.round(a + (value - a) * ease(t)));
      if (t < 1) raf.current = requestAnimationFrame(step);
      else from.current = value;
    };
    raf.current = requestAnimationFrame(step);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); from.current = value; };
  }, [value, ms, reduced]);
  return shown;
}

/** Money that counts to its new value. The final text is always exactly `money(cents)`. */
export function CountMoney({ cents, ms, prefix = "" }: { cents: number; ms?: number; prefix?: string }) {
  const shown = useCountUp(cents, ms);
  // Round the in-between frames to whole dollars so the digits don't flicker cents.
  const text = shown === cents ? money(cents) : money(Math.round(shown / 100) * 100);
  return <span className="tabular-nums">{prefix}{text}</span>;
}

/** True for `ms` after `key` changes (not on first render): drive a one-time flash or ring. */
export function useFlash(key: unknown, ms = 1600): boolean {
  const [on, setOn] = useState(false);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    setOn(true);
    const t = setTimeout(() => setOn(false), ms);
    return () => clearTimeout(t);
  }, [key, ms]);
  return on;
}

/** Tailwind classes for a card or row entering: fade and rise 6px (tw-animate-css). */
export const RISE = "animate-in fade-in slide-in-from-bottom-1.5 duration-500 ease-out motion-reduce:animate-none";
