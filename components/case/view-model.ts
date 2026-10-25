// Spec types -> what the case screen shows (docs/implementation-notes.md 8.4, docs/design.md §0, §7).
// Pure: everything the screen needs is derived here so components stay simple and testable.
import { z } from "zod";
import { FindingChangeSchema } from "@/lib/schemas";
import type {
  Case, CaseEvent, Charge, Draft, Fact, Finding, FindingChange, Question, Reply, RuleId, SourceDoc,
} from "@/lib/types";
import { capitalize, money, timeOf, whenAt } from "./format";
import { caseTotals, DISCREPANCY, groupTotals, type CaseTotals } from "./totals";

/** The case as the screen receives it: SPEC 5.3 CaseState plus replies, drafts and events. */
export type CaseInput = {
  case: Case; documents: SourceDoc[]; facts: Fact[]; charges: Charge[]; findings: Finding[];
  questions: Question[]; replies: Reply[]; drafts: Draft[]; events: CaseEvent[];
};

export type UiGroup = "dispute" | "waiting" | "cleared";
export const GROUPS: UiGroup[] = ["dispute", "waiting", "cleared"];
export const GROUP_NAME: Record<UiGroup, string> = {
  dispute: "To dispute", waiting: "Waiting on answers", cleared: "Cleared",
};

export function uiGroup(f: Pick<Finding, "status" | "userVerdict">): UiGroup {
  if (f.userVerdict === "false_positive") return "cleared";
  if (DISCREPANCY.includes(f.status)) return "dispute";
  return f.status === "needs_review" ? "waiting" : "cleared";
}

// Plain reasons per rule (docs/design.md §7.5, "you" per §0). Wording to confirm with Dev.
export const REASON: Record<RuleId, { code: string; plain: string }> = {
  R0_MATCH: { code: "R0", plain: "Matches the quote" },
  R1_DUPLICATE: { code: "R1", plain: "Billed twice" },
  R2_RATE_MISMATCH: { code: "R2", plain: "Higher than agreed" },
  R3_MATH_CURRENCY: { code: "R3", plain: "Other currency, no rate agreed" },
  R4_PERMITTED_SURCHARGE: { code: "R4", plain: "Allowed by the quote" },
  R5_EXCLUDED_SCOPE: { code: "R5", plain: "Extra the quote allows" },
  R6_NO_EVIDENCE: { code: "R6", plain: "Nobody agreed to it yet" },
  R7_CONFLICT: { code: "R7", plain: "Sources disagree" },
  R8_APPROVED: { code: "R8", plain: "Approved by you" },
  R9_REJECTED: { code: "R9", plain: "You said it was never agreed" },
};

export type RowTag = "Moved from Waiting" | "Just cleared" | "Dismissed by clerk" | "Finding confirmed by clerk";

export type Row = {
  key: string; lineNo: number; description: string; group: UiGroup;
  why: string;                // Finding.explanation, verbatim
  reason: { code: string; plain: string };
  billedCents: number; deltaCents?: number;
  tag?: RowTag;
  finding: Finding;
};

const changesOf = (e: CaseEvent): FindingChange[] => {
  const parsed = z.array(FindingChangeSchema).safeParse(e.payload.changes);
  return parsed.success ? parsed.data : [];
};

/** Findings of the case's current revision, in line order. */
export const currentFindings = (x: CaseInput) =>
  x.findings.filter((f) => f.revision === x.case.revision).sort((a, b) => a.lineNo - b.lineNo);

// Event times may carry different offsets, so compare instants, not strings.
export const instant = (iso: string) => Date.parse(iso);

const latestEvent = (events: CaseEvent[], types: CaseEvent["type"][]) =>
  [...events].filter((e) => types.includes(e.type)).sort((a, b) => instant(a.at) - instant(b.at)).at(-1);

/** Keys whose group changed in the latest recompute, with the group they came from. */
export function movedFrom(x: CaseInput): Map<string, UiGroup> {
  const last = latestEvent(x.events, ["recomputed"]);
  const moved = new Map<string, UiGroup>();
  if (!last) return moved;
  for (const c of changesOf(last)) {
    if (c.from && uiGroup(c.from) !== uiGroup(c.to)) moved.set(c.key, uiGroup(c.from));
  }
  return moved;
}

export function toRows(x: CaseInput): Row[] {
  const charges = new Map(x.charges.map((c) => [c._id, c]));
  const moved = movedFrom(x);
  return currentFindings(x).map((f) => {
    const group = uiGroup(f);
    const from = moved.get(f.key);
    const tag: RowTag | undefined =
      f.userVerdict === "false_positive" ? "Dismissed by clerk"
      : f.userVerdict === "confirmed" ? "Finding confirmed by clerk"
      : from && group === "cleared" ? "Just cleared"
      : from === "waiting" ? "Moved from Waiting"
      : undefined;
    return {
      key: f.key, lineNo: f.lineNo, description: charges.get(f.chargeId)?.description ?? `Line ${f.lineNo}`,
      group, why: f.explanation, reason: REASON[f.ruleId],
      billedCents: f.billedCents, deltaCents: f.deltaCents, tag, finding: f,
    };
  });
}

export type GroupView = { group: UiGroup; rows: Row[]; billedCents: number; overCents: number };

export const groupsOf = (rows: Row[]): GroupView[] =>
  GROUPS.map((group) => {
    const inGroup = rows.filter((r) => r.group === group);
    return { group, rows: inGroup, ...groupTotals(inGroup.map((r) => r.finding)) };
  });

/** Spec count line: "1 to dispute · 2 waiting on answers · 5 cleared". */
export function countLine(rows: Row[]): string {
  const n = (g: UiGroup) => rows.filter((r) => r.group === g).length;
  return `${n("dispute")} to dispute · ${n("waiting")} waiting on answers · ${n("cleared")} cleared`;
}

export const totalsOf = (x: CaseInput): CaseTotals => caseTotals(currentFindings(x));

export const latestQuestion = (x: CaseInput): Question | undefined =>
  [...x.questions].sort((a, b) => a.createdAt.localeCompare(b.createdAt)).at(-1);

export const latestDraft = (x: CaseInput): Draft | undefined => x.drafts.at(-1);

const answeredAt = (x: CaseInput) => latestEvent(x.events, ["reply_received"])?.at;

/** Case status pill (docs/design.md §0). */
export function casePill(x: CaseInput): { label: string; tone: "waiting" | "neutral" } {
  const q = latestQuestion(x), d = latestDraft(x);
  if (isRechecking(x)) return { label: "Rechecking", tone: "neutral" };
  if (q?.status === "open") return { label: "Waiting for your answer", tone: "waiting" };
  if (d?.status === "approved") return { label: "Approved", tone: "neutral" };
  if (d && (d.status === "draft" || d.status === "pending_approval")) return { label: "Ready to approve", tone: "neutral" };
  return { label: totalsOf(x).atStakeCents > 0 ? "Ready to dispute" : "Nothing to dispute", tone: "neutral" };
}

/** Line above the bar: when the engine last checked and why. */
export function checkedLine(x: CaseInput, now: Date): string {
  const last = latestEvent(x.events, ["recomputed"]);
  if (!last) return "Not checked yet";
  const reply = answeredAt(x);
  return reply && instant(reply) <= instant(last.at) ? `Updated at ${timeOf(last.at)} after your answer` : `Checked ${whenAt(last.at, now)}`;
}

/** A change is in flight: new input arrived after the latest recompute. */
export function isRechecking(x: CaseInput): boolean {
  const input = latestEvent(x.events, ["doc_added", "reply_received", "charge_edited", "facts_extracted"]);
  const done = latestEvent(x.events, ["recomputed", "extraction_failed"]);
  return !!input && (!done || instant(input.at) > instant(done.at));
}

export type Change = { key: string; lineNo: number; from: UiGroup; to: UiGroup; deltaCents?: number; quotes: string[] };

/** Group moves in the latest recompute, each with the quotes of the facts that caused it. */
export function latestChanges(x: CaseInput): Change[] {
  const last = latestEvent(x.events, ["recomputed"]);
  if (!last) return [];
  const facts = new Map(x.facts.map((f) => [f._id, f]));
  return changesOf(last)
    .filter((c) => c.from && uiGroup(c.from) !== uiGroup(c.to))
    .map((c) => ({
      key: c.key, lineNo: c.lineNo, from: uiGroup(c.from!), to: uiGroup(c.to), deltaCents: c.to.deltaCents,
      quotes: c.causedByFactIds.flatMap((id) => facts.get(id)?.span.quote ?? []),
    }));
}

/** "At stake $300 → $700. Waiting for answers $600 → $0." against the previous revision. */
export function changeSummary(x: CaseInput): string | undefined {
  const prev = x.findings.filter((f) => f.revision === x.case.revision - 1);
  if (!prev.length) return undefined;
  const a = caseTotals(prev), b = totalsOf(x);
  return `At stake ${money(a.atStakeCents)} → ${money(b.atStakeCents)}. Waiting for answers ${money(a.waitingCents)} → ${money(b.waitingCents)}.`;
}

const SOURCE_LABEL: Partial<Record<SourceDoc["type"], string>> = {
  email: "email", chat: "chat", proforma: "proforma", reply: "your answer", other: "note",
};

/** "Invoice PCL-INV-1012, checked against Quote Q-PCL-0902, email, chat." Dates live in the timeline; this stays one line. */
export function checkedAgainst(x: CaseInput): string {
  const invoice = x.documents.find((d) => d.type === "freight_invoice");
  const sources = x.documents
    .filter((d) => d.type !== "freight_invoice")
    .sort((a, b) => instant(a.sentAt ?? "") - instant(b.sentAt ?? ""))
    .map((d) => (d.type === "quote" ? d.title : SOURCE_LABEL[d.type] ?? d.title));
  const head = invoice?.title ?? "Invoice";
  return sources.length ? `${head}, checked against ${sources.join(", ")}.` : `${head}.`;
}

export type Step = { state: "done" | "current" | "todo"; title: string; sub: string };

/** The four step cards: checked, answer, draft, approve (docs/design.md §0, §7.4). */
export function stepsOf(x: CaseInput, now: Date): Step[] {
  const rows = toRows(x), t = totalsOf(x), q = latestQuestion(x), d = latestDraft(x);
  const docsRead = x.documents.filter((doc) => doc.type !== "reply").length;
  const disputeLines = rows.filter((r) => r.group === "dispute").length;
  const lines = (n: number) => `${n} ${n === 1 ? "line" : "lines"}`;
  const waitingOnYou = q?.status === "open";

  const answer: Step = !q ? { state: "done", title: "No questions needed", sub: "Every charge has evidence" }
    : waitingOnYou ? { state: "current", title: "Waiting for your answer", sub: `1 question, ${q.findingKeys.length} charges` }
    : q.status === "answered" ? { state: "done", title: "You answered", sub: capitalize(whenAt(answeredAt(x) ?? q.createdAt, now)) }
    : { state: "done", title: "Question closed", sub: "Lines stay waiting" };

  const draft: Step = d ? { state: "done", title: "Dispute drafted", sub: `${money(d.totalDisputedCents)}, ${lines(d.findingKeys.length)}` }
    : { state: !waitingOnYou && t.atStakeCents > 0 ? "current" : "todo", title: "Draft dispute", sub: `${money(t.atStakeCents)}, ${lines(disputeLines)}` };

  const approve: Step = d?.status === "approved" ? { state: "done", title: "Approved", sub: "Not sent" }
    : { state: d ? "current" : "todo", title: "Approve", sub: "Nothing is sent" };

  return [
    { state: "done", title: `Checked ${x.charges.length} charges`, sub: `${docsRead} documents read` },
    answer, draft, approve,
  ];
}
