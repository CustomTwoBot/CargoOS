// What a bill needs next, and from whom (docs/design.md §0.5). Pure: the bills list, the bill page's
// next-step card and the approval track all read this, so they always agree. Money comes from the
// engine through `totalsOf`; nothing here adds amounts.
import type { Draft, Person, Question } from "@/lib/types";
import { money } from "@/components/case/format";
import { openQuestions } from "@/components/case/issues";
import { isRechecking, latestDraft, totalsOf, type CaseInput } from "@/components/case/view-model";
import { decisionBlocked } from "@/components/case/case-store";
import { OWNER, firstName, isUploaderOnly } from "@/components/shell/person";
import { PEOPLE, personById } from "@/lib/people";

export type Step =
  | { kind: "reading"; total: number; read: number }
  | { kind: "rechecking" }
  | { kind: "answer"; question: Question }
  | { kind: "waitAnswer"; question: Question }
  | { kind: "request"; draft?: Draft }
  /** An owner, with money on hold and nothing requested yet: the bookkeeper asks, the owner decides. */
  | { kind: "waitRequest" }
  | { kind: "waitDecision"; draft: Draft }
  | { kind: "decide"; draft: Draft }
  | { kind: "selfBlocked"; draft: Draft }
  | { kind: "accepted"; draft: Draft }
  | { kind: "rejected"; draft: Draft }
  | { kind: "clear" }
  | { kind: "documents" };

export type BillGroup = "check" | "waiting" | "done";

const holds = (p: Person, role: Person["roles"][number]) => p.roles.includes(role);
const nameOf = (id?: string) => (id ? firstName(personById(id) ?? OWNER) : firstName(OWNER));

/** Who asks for approval: the seeded person who reviews lines but can't approve ("Maya"). */
export const BOOKKEEPER = PEOPLE.find((p) => p.roles.includes("clerk") && !p.roles.includes("controller"));
export const bookkeeperName = () => (BOOKKEEPER ? firstName(BOOKKEEPER) : "The bookkeeper");

/** The one thing that happens next on this bill, seen by `viewer`. */
export function nextStep(x: CaseInput, viewer: Person): Step {
  if (isUploaderOnly(viewer)) return { kind: "documents" };
  const reading = x.documents.filter((d) => d.readStatus === "reading").length;
  if (reading > 0 || (x.documents.length > 0 && x.findings.length === 0)) {
    return { kind: "reading", total: x.documents.length, read: x.documents.length - reading };
  }
  if (isRechecking(x)) return { kind: "rechecking" };
  const q = openQuestions(x)[0];
  if (q) return holds(viewer, "ops_lead") ? { kind: "answer", question: q } : { kind: "waitAnswer", question: q };
  const d = latestDraft(x);
  if (d?.status === "pending_approval") {
    const blocked = decisionBlocked(viewer, d);
    if (!blocked) return { kind: "decide", draft: d };
    return holds(viewer, "controller") && d.requestedBy === viewer.id ? { kind: "selfBlocked", draft: d } : { kind: "waitDecision", draft: d };
  }
  if (d?.status === "approved") return { kind: "accepted", draft: d };
  const atStake = totalsOf(x).atStakeCents;
  if (d?.status === "rejected" && atStake > 0) return { kind: "rejected", draft: d };
  // Whoever asks can never approve (CLAUDE.md rule 8), so an owner doesn't ask themselves: they wait for the bookkeeper.
  if (atStake > 0 && holds(viewer, "controller")) return { kind: "waitRequest" };
  if (atStake > 0 && holds(viewer, "clerk")) return { kind: "request", draft: d };
  return { kind: "clear" };
}

/** Where the bill sits in the list's tabs for `viewer`. */
export function groupOf(step: Step, viewer: Person): BillGroup {
  switch (step.kind) {
    case "answer": case "decide": case "request": case "reading": case "rechecking": case "documents": return "check";
    case "rejected": return step.draft.requestedBy === viewer.id || holds(viewer, "clerk") ? "check" : "waiting";
    case "accepted": return holds(viewer, "controller") ? "check" : "done";
    case "waitAnswer": case "waitDecision": case "selfBlocked": case "waitRequest": return "waiting";
    case "clear": return "done";
  }
}

export type Tone = "ask" | "hold" | "pay" | "muted";

/** One line of status for the list and the page header, in words. */
export function statusOf(x: CaseInput, step: Step): { label: string; sub: string; tone: Tone; action: string } {
  const t = totalsOf(x);
  switch (step.kind) {
    case "documents": return { label: `${x.documents.length} documents`, sub: "Add what was agreed from your phone or laptop", tone: "muted", action: "Add documents" };
    case "reading": return { label: "Reading documents", sub: `${step.read} of ${step.total} read`, tone: "muted", action: "Open" };
    case "rechecking": return { label: "Rechecking", sub: "Lines move when the check finishes", tone: "muted", action: "Open" };
    case "answer": return { label: questionLabel(x), sub: `CargoOS asked you about ${linesOf(step.question)}`, tone: "ask", action: "Answer" };
    case "waitAnswer": return { label: `Waiting for ${firstName(OWNER)}’s answer`, sub: `${linesOf(step.question)} · ${money(t.waitingCents)}`, tone: "muted", action: "Open" };
    case "request": return { label: `Ready to dispute ${money(t.atStakeCents)}`, sub: `Ask ${firstName(OWNER)} to approve`, tone: "hold", action: "Review" };
    case "waitRequest": return { label: `Waiting for ${bookkeeperName()} to ask`, sub: `${money(t.atStakeCents)} on hold`, tone: "muted", action: "Open" };
    case "decide": return { label: `${nameOf(step.draft.requestedBy)} asks you to approve`, sub: `Dispute ${money(step.draft.totalDisputedCents)}`, tone: "hold", action: "Decide" };
    case "waitDecision": return { label: `Waiting for ${firstName(OWNER)}`, sub: `You asked to dispute ${money(step.draft.totalDisputedCents)}`, tone: "muted", action: "Open" };
    case "selfBlocked": return { label: "Another owner decides", sub: `You asked to dispute ${money(step.draft.totalDisputedCents)}`, tone: "muted", action: "Open" };
    case "accepted": return { label: `Dispute ${money(step.draft.totalDisputedCents)} accepted`, sub: "Write to the forwarder, then pay the rest", tone: "pay", action: "Write" };
    case "rejected": return { label: `${firstName(OWNER)} rejected the dispute`, sub: step.draft.rejectionReason ? `“${step.draft.rejectionReason}”` : "See why", tone: "hold", action: "See why" };
    case "clear": return { label: "Safe to pay in full", sub: t.waivedCents ? "Every line is cleared or accepted" : "Every line matches what was agreed", tone: "pay", action: "Review" };
  }
}

const linesOf = (q: Question) => {
  const n = q.findingKeys.length;
  return n === 1 ? "1 line" : `${n} lines`;
};

const questionLabel = (x: CaseInput) => {
  const n = openQuestions(x).length;
  return n === 1 ? "Answer 1 question" : `Answer ${n} questions`;
};
