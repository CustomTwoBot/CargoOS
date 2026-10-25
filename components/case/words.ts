// The one vocabulary both panes use for a line's result (docs/design.md §0.4 п.9): the status is a
// short coloured word next to a dark line name, never an icon. The canvas owns this file; the
// thread imports it so a line reads the same on both sides.
import { inCurrency } from "./format";
import type { Row } from "./view-model";

export type Tone = "dispute" | "waiting" | "cleared" | "muted";
export type Word = { text: string; tone: Tone };

/** Tailwind text colour for a tone. */
export const TONE_TEXT: Record<Tone, string> = {
  dispute: "text-dispute", waiting: "text-waiting", cleared: "text-cleared", muted: "text-ink-3",
};

/**
 * The Result word for a line. `asked` is who CargoOS asks, as this screen names them: "you" on the
 * screen of the person who answers, "Sam" elsewhere.
 */
export function resultWord(row: Row, asked: string): Word {
  const f = row.finding;
  if (f.userVerdict === "false_positive") return { text: "Not an issue", tone: "muted" };
  if (row.group === "cleared") return { text: "Matches", tone: "cleared" };
  if (row.group === "dispute") {
    if (f.ruleId === "R1_DUPLICATE") return { text: "Billed twice", tone: "dispute" };
    return row.deltaCents ? { text: `${inCurrency(row.deltaCents, row.currency)} over`, tone: "dispute" } : { text: "To dispute", tone: "dispute" };
  }
  if (row.currency !== "USD") return { text: "Waiting for rate", tone: "waiting" };
  if (f.routeTo === "ops_lead") return { text: `Asked ${asked}`, tone: "waiting" };
  return { text: "Waiting", tone: "waiting" };
}
