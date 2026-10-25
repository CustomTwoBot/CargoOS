"use client";
// Light by default; dark is `.dark` on <html>, remembered in localStorage (docs/design.md §3.2).
// "system" follows the OS setting (Settings → Appearance, §0.3); app/layout.tsx applies it before paint.
import { useSyncExternalStore } from "react";
import { cx } from "./cx";
import { MoonIcon, SunIcon } from "./glyphs";

type Theme = "light" | "dark";
export type ThemeChoice = Theme | "system";
const KEY = "cargoos.theme";
const DARK_OS = "(prefers-color-scheme: dark)";
const listeners = new Set<() => void>();

const read = (): Theme => (document.documentElement.classList.contains("dark") ? "dark" : "light");
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

const setTheme = (t: Theme) => setThemeChoice(t);

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

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, read, () => "light" as Theme);
  const seg = (t: Theme, label: string, icon: React.ReactNode) => (
    <button type="button" aria-label={label} aria-pressed={theme === t} onClick={() => setTheme(t)}
      className={cx("grid h-6 w-7 place-items-center rounded-[6px] text-ink-3", theme === t && "bg-line-strong text-ink")}>
      {icon}
    </button>
  );
  return (
    <div className="inline-flex rounded-[9px] border border-line bg-surface p-[3px]" role="group" aria-label="Theme">
      {seg("light", "Light theme", <SunIcon />)}
      {seg("dark", "Dark theme", <MoonIcon />)}
    </div>
  );
}
