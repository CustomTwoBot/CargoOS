// FLIP for lists whose items change place after a recheck (docs/design.md §9). No animation
// library yet (`motion` would be a new dependency): items with a [data-key] slide from where they were.
import { useLayoutEffect, useRef, type RefObject } from "react";

export function useRowMoves(ref: RefObject<HTMLElement | null>, ms: number, movingKey?: string) {
  const tops = useRef(new Map<string, number>());
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const next = new Map<string, number>();
    root.querySelectorAll<HTMLElement>("[data-key]").forEach((el) => {
      const key = el.dataset.key!, top = el.offsetTop, was = tops.current.get(key);
      next.set(key, top);
      if (!reduce && el.animate) {
        if (was === undefined && tops.current.size) {
          el.animate([{ opacity: 0, transform: "translateY(-6px)" }, { opacity: 1, transform: "none" }], { duration: ms, easing: "cubic-bezier(0.2, 0, 0, 1)" });
        } else if (was !== undefined && was !== top) {
          el.animate([{ transform: `translateY(${was - top}px)` }, { transform: "none" }], { duration: ms, easing: "cubic-bezier(0.2, 0, 0, 1)" });
        }
      }
      if (key === movingKey) el.scrollIntoView?.({ block: "nearest", behavior: reduce ? "auto" : "smooth" });
    });
    tops.current = next;
  });
}
