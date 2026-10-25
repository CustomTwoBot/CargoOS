// What the operator has to decide, one tab each (docs/design.md §0, layout A "tabs per issue").
// Pure: derived from the case so the tabs and the Overview list always agree.
import type { Draft, Question } from "@/lib/types";
import { delta, money } from "./format";
import { groupsOf, latestChanges, latestDraft, latestQuestion, toRows, totalsOf, type CaseInput, type Row, type UiGroup } from "./view-model";

export type Issue =
  | { id: string; kind: "line"; row: Row; title: string; amount: string; isNew: boolean }
  | { id: "question"; kind: "question"; question: Question; rows: Row[]; title: string; amount: string }
  | { id: "dispute"; kind: "dispute"; draft: Draft; title: string; amount: string };

export function issuesOf(x: CaseInput): Issue[] {
  const rows = toRows(x);
  const out: Issue[] = rows
    .filter((r) => r.group === "dispute")
    .map((r) => ({ id: r.key, kind: "line", row: r, title: r.description, amount: delta(r.deltaCents), isNew: r.tag === "Moved from Waiting" }));
  const q = latestQuestion(x);
  if (q?.status === "open") {
    const asked = rows.filter((r) => q.findingKeys.includes(r.key) && r.group === "waiting");
    out.push({ id: "question", kind: "question", question: q, rows: asked, title: "Your answer",
      amount: money(totalsOf(x).waitingCents) });
  }
  const d = latestDraft(x);
  if (d) out.push({ id: "dispute", kind: "dispute", draft: d, title: "Dispute", amount: money(d.totalDisputedCents) });
  return out;
}

/** "5 charges match what was agreed", with their billed subtotal. */
export function clearedSummary(x: CaseInput) {
  const g = groupsOf(toRows(x)).find((v) => v.group === "cleared")!;
  return { count: g.rows.length, billed: money(g.billedCents) };
}

export type ChangeNote = { key: string; text: string; to: UiGroup; amount?: string };

/** One short note per line the latest recheck moved, for the banner on the Overview. */
export function changeNotes(x: CaseInput): ChangeNote[] {
  const rows = new Map(toRows(x).map((r) => [r.key, r]));
  return latestChanges(x).map((c) => {
    const name = rows.get(c.key)?.description ?? `Line ${c.lineNo}`;
    return c.to === "dispute"
      ? { key: c.key, text: `${name} is now to dispute`, to: c.to, amount: delta(c.deltaCents) }
      : c.to === "cleared" ? { key: c.key, text: `${name} is cleared`, to: c.to }
      : { key: c.key, text: `${name} is waiting`, to: c.to };
  });
}
