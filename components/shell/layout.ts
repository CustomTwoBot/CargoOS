// How wide the shell is and how the sidebar shows (docs/design.md §0.2, decision 6). CSS breakpoints
// do the first paint; these two small stores only exist where React state has to change.
// ≥1280 wide: sidebar expanded. 1024–1279 mid: collapsed rail. <1024 narrow: hidden behind a menu.
import { useSyncExternalStore } from "react";

export type ShellWidth = "wide" | "mid" | "narrow" | "unknown";
export type SidebarPref = "expanded" | "collapsed";
/** "auto" is the server render: CSS picks the rail or the full sidebar until the client knows the width. */
export type SidebarMode = SidebarPref | "auto";

const WIDE = "(min-width: 1280px)";
const MID = "(min-width: 1024px)";

const readWidth = (): ShellWidth => {
  if (typeof window.matchMedia !== "function") return "wide";
  return window.matchMedia(WIDE).matches ? "wide" : window.matchMedia(MID).matches ? "mid" : "narrow";
};
const subscribeWidth = (l: () => void) => {
  if (typeof window.matchMedia !== "function") return () => {};
  const lists = [WIDE, MID].map((q) => window.matchMedia(q));
  lists.forEach((m) => m.addEventListener("change", l));
  return () => lists.forEach((m) => m.removeEventListener("change", l));
};

/** The window's width class; "unknown" while prerendering. */
export const useShellWidth = () => useSyncExternalStore(subscribeWidth, readWidth, (): ShellWidth => "unknown");

// The operator's own choice, remembered in localStorage ("cargoos.sidebar"), wrapped in try/catch like the theme.
const KEY = "cargoos.sidebar";
const listeners = new Set<() => void>();
const readPref = (): SidebarPref | null => {
  try {
    const v = localStorage.getItem(KEY);
    return v === "collapsed" || v === "expanded" ? v : null;
  } catch { return null; }
};
const subscribePref = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

export function setSidebarPref(v: SidebarPref) {
  try { localStorage.setItem(KEY, v); } catch { /* not remembered */ }
  listeners.forEach((l) => l());
}

export const useSidebarPref = () => useSyncExternalStore(subscribePref, readPref, () => null);

/** The operator's choice wins at any width the sidebar is in the page; otherwise the width decides. */
export function sidebarMode(pref: SidebarPref | null, width: ShellWidth): SidebarMode {
  if (width === "unknown") return "auto";
  if (width === "narrow") return "expanded";
  return pref ?? (width === "wide" ? "expanded" : "collapsed");
}
