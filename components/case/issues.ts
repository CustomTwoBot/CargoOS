// What the operator has to decide, one tab each (docs/design.md §0, layout A "tabs per issue").
// Pure: derived from the case so the tabs and the Overview list always agree.
import type { Draft, Question } from "@/lib/types";
import { delta, inCurrency, money } from "./format";
import { groupTotals } from "./totals";
import { currencyOf, groupsOf, latestChanges, latestDraft, toRows, type CaseInput, type Row, type UiGroup } from "./view-model";

export type Issue =
  | { id: string; kind: "line"; row: Row; title: string; amount: string; isNew: boolean }
  | { id: string; kind: "question"; question: Question; rows: Row[]; title: string; amount: string }
  | { id: "dispute"; kind: "dispute"; draft: Draft; title: string; amount: string };

/** Open questions, oldest first. */
export const openQuestions = (x: CaseInput): Question[] =>
  x.questions.filter((q) => q.status === "open").sort((a, b) => a.createdAt.localeCompare(b.createdAt));

/** "Your answer" when the case only ever had one question; else "Question 2", "Follow-up". Stable as questions get answered. */
export function questionTitle(x: CaseInput, q: Question): string {
  if (q.followupOf) return "Follow-up";
  const asked = x.questions.filter((o) => !o.followupOf).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return asked.length > 1 ? `Question ${asked.findIndex((o) => o._id === q._id) + 1}` : "Your answer";
}

export function issuesOf(x: CaseInput): Issue[] {
  const rows = toRows(x);
  const open = openQuestions(x);
  const asked = new Set(open.flatMap((q) => q.findingKeys));
  const out: Issue[] = rows
    .filter((r) => r.group === "dispute")
    .map((r) => ({ id: r.key, kind: "line", row: r, title: r.description, amount: delta(r.deltaCents), isNew: r.tag === "Moved from Waiting" }));
  // A waiting line no open question covers (e.g. billed in another currency) still needs a decision.
  rows.filter((r) => r.group === "waiting" && !asked.has(r.key)).forEach((r) => out.push({
    id: r.key, kind: "line", row: r, title: r.description, amount: inCurrency(r.billedCents, r.currency), isNew: false }));
  open.forEach((q) => {
    const asked = rows.filter((r) => q.findingKeys.includes(r.key) && r.group === "waiting");
    out.push({ id: q._id, kind: "question", question: q, rows: asked,
      title: questionTitle(x, q),
      amount: money(groupTotals(asked.map((r) => r.finding), currencyOf(x)).billedCents) });
  });
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
