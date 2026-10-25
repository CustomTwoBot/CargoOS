"use client";
// Light by default; dark is `.dark` on <html>, remembered in localStorage (docs/design.md §3.2).
import { useSyncExternalStore } from "react";
import { cx } from "./cx";
import { MoonIcon, SunIcon } from "./glyphs";

type Theme = "light" | "dark";
const KEY = "cargoos.theme";
const listeners = new Set<() => void>();

const read = (): Theme => (document.documentElement.classList.contains("dark") ? "dark" : "light");

function setTheme(t: Theme) {
  document.documentElement.classList.toggle("dark", t === "dark");
  try { localStorage.setItem(KEY, t); } catch { /* private mode: theme just isn't remembered */ }
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

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
