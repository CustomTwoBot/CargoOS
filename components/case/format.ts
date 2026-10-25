// Display formatting only (docs/design.md §4). Amounts arrive as integer cents from the engine.
import { formatUSD } from "@/lib/engine/money";

const MINUS = "−";

/** 480000 -> "$4,800"; -30000 -> "−$300" (real minus sign). */
export function money(cents: number): string {
  const s = formatUSD(Math.abs(cents));
  return cents < 0 ? `${MINUS}${s}` : s;
}

/** Over-by column: +$300, −$50, or "—" for zero / no delta. */
export function delta(cents: number | undefined): string {
  if (!cents) return "—";
  return cents > 0 ? `+${money(cents)}` : money(cents);
}

const TZ = "America/Los_Angeles";
const dayKey = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: TZ });
const clock = (d: Date) => d.toLocaleTimeString("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit" });
const shortDate = (d: Date) => d.toLocaleDateString("en-US", { timeZone: TZ, month: "short", day: "numeric" });

/** "today at 1:50 PM" or "Oct 24 at 1:50 PM", in Pacific time. */
export function whenAt(iso: string, now: Date): string {
  const d = new Date(iso);
  return `${dayKey(d) === dayKey(now) ? "today" : shortDate(d)} at ${clock(d)}`;
}

/** "1:50 PM", in Pacific time. */
export function timeOf(iso: string): string {
  return clock(new Date(iso));
}

export const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
