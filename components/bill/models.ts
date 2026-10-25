// Pure models for the bill page and the bills list (docs/design.md §0.5): the pay / hold / ask
// split, how CargoOS read an answer (M3), and the approval track (P3). Every amount comes from the
// engine's totals or from findings; this file only regroups them.
import type { CaseEvent, Fact, Person, Question } from "@/lib/types";
import { personById } from "@/lib/people";
import { delta, money, timeOf } from "@/components/case/format";
import { caseTotals } from "@/components/case/totals";
import {
  currencyOf, instant, isRechecking, latestChanges, latestDraft, latestQuestion, toRows, totalsOf, type CaseInput, type UiGroup,
} from "@/components/case/view-model";
import { OWNER, firstName } from "@/components/shell/person";
import { BOOKKEEPER, bookkeeperName, type Step } from "@/components/app/next-step";

/** Pay = what matches the agreement (agreed + lines accepted as not an issue); Hold = at stake; Ask = waiting. */
export type Split = { pay: number; hold: number; ask: number; billed: number };

export function splitOf(x: CaseInput): Split {
  const t = totalsOf(x);
  return { pay: t.agreedCents + t.waivedCents, hold: t.atStakeCents, ask: t.waitingCents, billed: t.billedCents };
}

/** The hero sentence, as three parts so the amount can be highlighted. */
export function heroOf(s: Split): { before: string; amount: string; after: string } {
  if (s.billed === 0) return { before: "", amount: "Nothing billed yet", after: "" };
  if (s.pay === s.billed) return { before: "You can safely pay ", amount: `all ${money(s.billed)}`, after: "." };
  if (s.pay === 0) return { before: "Hold ", amount: money(s.billed), after: " until the questions are answered." };
  return { before: "You can safely pay ", amount: money(s.pay), after: ` of ${money(s.billed)}.` };
}

/** The amount in the hero sentence as cents, so it can count to a new value; undefined when there is none. */
export function heroCount(s: Split): { cents: number; prefix: string } | undefined {
  if (s.billed === 0) return undefined;
  if (s.pay === s.billed) return { cents: s.billed, prefix: "all " };
  return { cents: s.pay === 0 ? s.billed : s.pay, prefix: "" };
}

/** "Good morning" / "Good afternoon" / "Good evening" for the hour on this device. */
export function greeting(now: Date | null): string {
  const h = (now ?? new Date(2026, 9, 24, 14)).getHours();
  return h < 5 ? "Good evening" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

// ---- How CargoOS read an answer (M3) ------------------------------------

export type Reading = {
  key: string; lineNo: number; description: string; billedCents: number;
  verdict: "agreed" | "not_agreed" | "unsure";
  /** The words of the answer that led to the reading, verbatim. */
  quote?: string;
  /** The amount the answer approved, when it named one. */
  amountCents?: number;
};

/** The facts an answer produced, from the latest reply to `q` (or its follow-up). */
const replyFacts = (x: CaseInput, q: Question): Fact[] => {
  const replies = x.replies.filter((r) => r.questionId === q._id || x.questions.some((f) => f.followupOf === q._id && f._id === r.questionId));
  const ids = new Set(replies.flatMap((r) => r.factIds));
  const fromReplies = x.facts.filter((f) => ids.has(f._id));
  // Recorded snapshots may carry reply facts without a Reply row yet.
  return fromReplies.length ? fromReplies : x.facts.filter((f) => f.origin === "reply");
};

/** Per line the question covered: what the answer said about it. */
export function readingOf(x: CaseInput, q: Question): Reading[] {
  const facts = replyFacts(x, q);
  const charges = new Map(x.charges.map((c) => [c._id, c]));
  const rows = toRows(x);
  return q.findingKeys.flatMap((key) => {
    const row = rows.find((r) => r.key === key);
    if (!row) return [];
    const type = charges.get(row.finding.chargeId)?.chargeType;
    const fact = facts.find((f) => f.chargeType === type && (f.kind === "approval" || f.kind === "rejection"));
    return [{
      key, lineNo: row.lineNo, description: row.description, billedCents: row.billedCents,
      verdict: !fact ? "unsure" : fact.kind === "approval" ? "agreed" : "not_agreed",
      quote: fact?.span.quote, amountCents: fact?.amountCents,
    } satisfies Reading];
  });
}

/** The latest answered question with its reply text, for the "how CargoOS read your answer" card. */
export function lastAnswer(x: CaseInput): { question: Question; text?: string; at?: string } | undefined {
  const answered = x.questions.filter((q) => q.status !== "open" && x.replies.some((r) => r.questionId === q._id))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt)).at(-1);
  if (!answered) return undefined;
  const reply = x.replies.filter((r) => r.questionId === answered._id).at(-1);
  const doc = reply && x.documents.find((d) => d._id === reply.docId);
  return { question: answered, text: doc?.text, at: doc?.sentAt };
}

// ---- After a recheck (M1 motion) ---------------------------------------

/** Pay / Hold / Ask of the previous revision, from the engine's totals of its findings. */
export function previousSplitOf(x: CaseInput): Split | undefined {
  const prev = x.findings.filter((f) => f.revision === x.case.revision - 1);
  if (!prev.length) return undefined;
  const t = caseTotals(prev, currencyOf(x));
  return { pay: t.agreedCents + t.waivedCents, hold: t.atStakeCents, ask: t.waitingCents, billed: t.billedCents };
}

export type MovedLine = { key: string; lineNo: number; description: string; from: UiGroup; to: UiGroup; amount: string };

/** The lines the latest recheck moved, each with the amount it now counts for. Empty while rechecking. */
export function movedLines(x: CaseInput): MovedLine[] {
  if (isRechecking(x)) return [];
  const rows = new Map(toRows(x).map((r) => [r.key, r]));
  return latestChanges(x).map((c) => {
    const row = rows.get(c.key);
    const amount = c.to === "dispute" ? delta(c.deltaCents) : money(row?.billedCents ?? 0);
    return { key: c.key, lineNo: c.lineNo, description: row?.description ?? `Line ${c.lineNo}`, from: c.from, to: c.to, amount };
  });
}

export type RecheckLine = { key: string; lineNo: number; description: string; moved?: MovedLine };

/** The lines the latest question covered, each marked once the recheck has moved it. */
export function recheckLinesOf(x: CaseInput): RecheckLine[] {
  const q = latestQuestion(x);
  if (!q) return [];
  const rows = new Map(toRows(x).map((r) => [r.key, r]));
  const moved = new Map(movedLines(x).map((m) => [m.key, m]));
  return q.findingKeys.flatMap((key) => {
    const row = rows.get(key);
    return row ? [{ key, lineNo: row.lineNo, description: row.description, moved: moved.get(key) }] : [];
  });
}

// ---- Approval track (P3) -------------------------------------------------

export type TrackState = "done" | "now" | "later" | "bad";
export type TrackStep = { key: string; who: string; whoId?: string; title: string; sub: string; state: TrackState };

const latest = (events: CaseEvent[], type: CaseEvent["type"]) =>
  events.filter((e) => e.type === type).sort((a, b) => instant(a.at) - instant(b.at)).at(-1);

const personName = (id: unknown, fallback: Person) => firstName(typeof id === "string" ? personById(id) ?? fallback : fallback);

/** The five steps of a bill: checked → answered → asked to approve → decided → message. */
export function trackOf(x: CaseInput, step: Step, forwarder: string): TrackStep[] {
  const checked = latest(x.events, "recomputed");
  const replied = latest(x.events, "reply_received");
  const requested = latest(x.events, "approval_requested");
  const d = latestDraft(x);
  const asker = d?.requestedBy ?? (requested?.payload.personId as string | undefined);
  const out: TrackStep[] = [];

  out.push(checked
    ? { key: "checked", who: "C", title: `Checked ${x.findings.filter((f) => f.revision === x.case.revision).length} lines`, sub: `CargoOS · ${timeOf(checked.at)}`, state: "done" }
    : { key: "checked", who: "C", title: "Reading documents", sub: "CargoOS", state: "now" });

  if (x.questions.length) {
    const open = x.questions.some((q) => q.status === "open");
    out.push(open
      ? { key: "answer", who: firstName(OWNER).charAt(0), whoId: OWNER.id, title: "Answer CargoOS", sub: `${firstName(OWNER)} · waiting`, state: "now" }
      : { key: "answer", who: firstName(OWNER).charAt(0), whoId: OWNER.id, title: "Answered", sub: `${firstName(OWNER)}${replied ? ` · ${timeOf(replied.at)}` : ""}`, state: "done" });
  }

  const askedName = personName(asker, OWNER);
  // The bookkeeper's turn, whether this screen is theirs (request) or the owner's (waitRequest).
  const asking = step.kind === "request" || step.kind === "waitRequest";
  out.push(d && d.status !== "draft"
    ? { key: "ask", who: askedName.charAt(0), whoId: asker, title: "Asked to approve", sub: `${askedName}${requested ? ` · ${timeOf(requested.at)}` : ""} · ${money(d.totalDisputedCents)}`, state: "done" }
    : { key: "ask", who: bookkeeperName().charAt(0), whoId: BOOKKEEPER?.id, title: "Ask to approve", sub: asking ? `${bookkeeperName()} · now` : bookkeeperName(), state: asking ? "now" : "later" });

  const decided = latest(x.events, d?.status === "rejected" ? "draft_rejected" : "approved");
  out.push(
    d?.status === "approved" ? { key: "decide", who: "S", whoId: d.approvedBy ?? OWNER.id, title: "Accepted", sub: `${personName(d.approvedBy, OWNER)}${decided ? ` · ${timeOf(decided.at)}` : ""}`, state: "done" }
    : d?.status === "rejected" && step.kind === "rejected" ? { key: "decide", who: "S", whoId: d.rejectedBy ?? OWNER.id, title: "Rejected", sub: `${personName(d.rejectedBy, OWNER)} · back to ${askedName}`, state: "bad" }
    : d?.status === "pending_approval" ? { key: "decide", who: step.kind === "selfBlocked" ? "?" : "S", whoId: step.kind === "selfBlocked" ? undefined : OWNER.id,
        title: step.kind === "selfBlocked" ? "Another owner decides" : "Accept or reject", sub: step.kind === "selfBlocked" ? `${askedName} asked, so not ${askedName}` : `${firstName(OWNER)} · waiting`, state: "now" }
    : { key: "decide", who: "S", whoId: OWNER.id, title: "Accept or reject", sub: firstName(OWNER), state: "later" });

  out.push({ key: "write", who: "S", whoId: OWNER.id, title: `Write to ${forwarder.split(" ")[0]}`, sub: d?.status === "approved" ? `${firstName(OWNER)} · nothing is sent` : "Nothing is sent", state: d?.status === "approved" ? "now" : "later" });
  return out;
}
