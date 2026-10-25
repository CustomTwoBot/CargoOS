// Whether this screen was set up on /start, and the workspace name it chose (docs/design.md §0.5).
// There is no login: setting up picks one of the seeded people (lib/people.ts) for this device and
// names the workspace. Stored in localStorage, read in try/catch like the theme and the person.
import { useSyncExternalStore } from "react";
import { setDevicePerson } from "@/components/shell/person";

const SETUP_KEY = "cargoos.setup";
export const DEFAULT_WORKSPACE = "Bayline Home Goods";

export type Setup = { workspace: string; at: string };

const listeners = new Set<() => void>();
let cache: { raw: string | null; value: Setup | null } = { raw: null, value: null };

function read(): Setup | null {
  let raw: string | null = null;
  try { raw = localStorage.getItem(SETUP_KEY); } catch { /* private mode */ }
  if (raw === cache.raw) return cache.value;
  let value: Setup | null = null;
  try {
    const v = raw ? JSON.parse(raw) : null;
    value = v && typeof v.workspace === "string" ? { workspace: v.workspace, at: String(v.at ?? "") } : null;
  } catch { value = null; }
  cache = { raw, value };
  return value;
}

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

/** The stored setup, or null when this screen was never set up. Null on the server. */
export const readSetup = (): Setup | null => read();

/** Sets this screen up: the person who uses it and the workspace name. */
export function saveSetup(personId: string, workspace: string) {
  setDevicePerson(personId);
  const value: Setup = { workspace: workspace.trim() || DEFAULT_WORKSPACE, at: new Date().toISOString() };
  try { localStorage.setItem(SETUP_KEY, JSON.stringify(value)); } catch { /* not remembered */ }
  listeners.forEach((l) => l());
}

/** Forget the setup (Settings → This device → Start over). */
export function clearSetup() {
  try { localStorage.removeItem(SETUP_KEY); } catch { /* nothing stored */ }
  listeners.forEach((l) => l());
}

export function useSetup(): Setup | null {
  return useSyncExternalStore(subscribe, read, () => null);
}

/** The workspace name to show: the one chosen on /start, else the demo's. */
export const useWorkspaceName = () => useSetup()?.workspace ?? DEFAULT_WORKSPACE;
