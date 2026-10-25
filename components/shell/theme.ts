// The theme (docs/design.md §3.2): light by default, dark is `.dark` on <html>, "system" follows the
// OS. Remembered in localStorage ("cargoos.theme"); app/layout.tsx applies it before first paint.
// Chosen in Settings → Appearance (§0.3).
import { useSyncExternalStore } from "react";

type Theme = "light" | "dark";
export type ThemeChoice = Theme | "system";
const KEY = "cargoos.theme";
const DARK_OS = "(prefers-color-scheme: dark)";
const listeners = new Set<() => void>();

const readChoice = (): ThemeChoice => {
  try {
    const v = localStorage.getItem(KEY);
    return v === "dark" || v === "system" ? v : "light";
  } catch { return "light"; }
};
const osDark = () => typeof window.matchMedia === "function" && window.matchMedia(DARK_OS).matches;
const apply = (c: ThemeChoice) => document.documentElement.classList.toggle("dark", c === "dark" || (c === "system" && osDark()));

/** Sets and remembers the theme: light, dark, or whatever the OS uses. */
export function setThemeChoice(c: ThemeChoice) {
  apply(c);
  try { localStorage.setItem(KEY, c); } catch { /* private mode: theme just isn't remembered */ }
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

/** The stored choice; "light" on the server. */
export const useThemeChoice = () => useSyncExternalStore(subscribe, readChoice, (): ThemeChoice => "light");

/** While "system" is chosen, follows the OS switching between light and dark. Returns the cleanup. */
export function followSystemTheme(): () => void {
  if (typeof window.matchMedia !== "function") return () => {};
  const m = window.matchMedia(DARK_OS);
  const on = () => { if (readChoice() === "system") { apply("system"); listeners.forEach((l) => l()); } };
  m.addEventListener("change", on);
  return () => m.removeEventListener("change", on);
}
