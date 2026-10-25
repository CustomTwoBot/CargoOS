// Inbox inputs for tests and the temporary preview: Scenario A at several stages, plus a second
// synthetic case (two questions, then a one-line dispute) built from Scenario A's documents.
// Maya requests approval, Sam accepts or rejects (SPEC "Changes on Oct 24 evening"). The decision
// fields are lib/types Draft's (SPEC §5.5). Synthetic data; nothing here is a real shipment.
import type { DemoCase } from "@/components/case/demo-case";
import { SCENARIO_A, scenarioA, scenarioAAt, scenarioADraft } from "@/components/case/fixture";
import type { CaseInput } from "@/components/case/view-model";
import type { CaseEvent, Draft, Question, Reply, SourceDoc } from "@/lib/types";
import type { InboxCase } from "./items";

const FORWARDER = "Pacific Crest Logistics";

const event = (caseId: string, n: number, at: string, actor: CaseEvent["actor"], type: CaseEvent["type"], payload: Record<string, unknown>): CaseEvent =>
  ({ _id: `${caseId}_ev_${n}`, caseId, at, actor, type, payload });

export type Decision = "requested" | "accepted" | "rejected";

/** The demo story's reason (SPEC "Changes on Oct 24 evening", 13). */
export const DEMO_REJECTION = "It wasn't agreed upfront, but they really did expedite it for us. Let's pay it this time.";

/** Scenario A with its dispute requested by `requestedBy` at 2:07 PM, then accepted or rejected by Sam at 2:10 PM. */
export function scenarioAWithDraft(decision: Decision = "requested", requestedBy = "maya"): CaseInput {
  const x = scenarioAAt("after");
  const d = scenarioADraft();
  const at = "2026-10-24T14:10:00-07:00";
  const draft: Draft = {
    ...d, requestedBy,
    status: decision === "requested" ? "pending_approval" : decision === "accepted" ? "approved" : "rejected",
    ...(decision === "accepted" && { approvedBy: "sam" }),
    ...(decision === "rejected" && { rejectedBy: "sam", rejectionReason: DEMO_REJECTION }),
  };
  const events = [...x.events,
    event("case_A", 1, "2026-10-24T14:07:00-07:00", "clerk", "draft_created", { draftId: d._id, findingKeys: d.findingKeys, totalDisputedCents: d.totalDisputedCents }),
    event("case_A", 2, "2026-10-24T14:07:05-07:00", "clerk", "approval_requested", { draftId: d._id, personId: requestedBy }),
    ...(decision === "accepted" ? [event("case_A", 3, at, "controller", "approved", { draftId: d._id, personId: "sam" })] : []),
    ...(decision === "rejected" ? [event("case_A", 3, at, "controller", "draft_rejected", { draftId: d._id, personId: "sam", reason: DEMO_REJECTION })] : []),
  ];
  return { ...x, drafts: [draft], events };
}

// Case B: a 20GP from Yantian, same forwarder. Asked about lines 4 and 6 separately, yesterday and this morning.
const B = "case_B";
const B_TITLE = "Bayline 20GP Yantian-Oakland";

const QB: Question[] = [
  { _id: "qB_1", caseId: B, to: "ops_lead", findingKeys: ["chg_4"], citations: [], status: "open",
    createdAt: "2026-10-23T09:10:00-07:00",
    text: "Invoice line 4 bills a $200 port congestion fee. The quote and the emails don't mention it. Did anyone agree to pay it?" },
  { _id: "qB_2", caseId: B, to: "ops_lead", findingKeys: ["chg_6"], citations: [], status: "open",
    createdAt: "2026-10-24T08:30:00-07:00",
    text: "Invoice line 6 bills $400 rush handling. Nobody asked for rush handling in the quote, the emails or the chat. Was it agreed?" },
];

const ANSWERS: Record<string, string> = {
  qB_1: "Yes, Derek told me about the congestion fee on the phone and I said fine.",
  qB_2: "No, we never asked for rush handling.",
};

const replyDoc = (q: Question, at: string): SourceDoc =>
  ({ _id: `doc_${q._id}_reply`, caseId: B, type: "reply", title: "Your answer", sender: "ops_lead", sentAt: at, text: ANSWERS[q._id] });

const reply = (q: Question): Reply =>
  ({ _id: `${q._id}_reply`, caseId: B, questionId: q._id, from: "ops_lead", docId: `doc_${q._id}_reply`, interpretation: q._id === "qB_1" ? "yes" : "no", factIds: [] });

const ANSWERED_AT: Record<string, string> = { qB_1: "2026-10-24T10:02:00-07:00", qB_2: "2026-10-24T10:04:00-07:00" };

const DRAFT_B: Draft = {
  _id: "draft_B", caseId: B, to: "forwarder", status: "pending_approval", createdBy: "clerk", requestedBy: "maya",
  subject: "Invoice PCL-INV-2210: 1 disputed line ($400)",
  findingKeys: ["chg_6"], totalDisputedCents: 40000,
  body: "Hi Derek,\n\nThanks for invoice PCL-INV-2210. Before we pay, we need to raise one line:\n\nLine 6, rush handling: billed $400. Nobody on our side asked for rush handling, and it is not in quote Q-PCL-0902. Over by $400.\n\nCould you send a corrected invoice without line 6?\n\nThanks,\nMaya",
};

export type CaseBStage = "asking" | "one_answered" | "drafted" | "approved";

/** The synthetic second case at a stage. */
export function caseB(stage: CaseBStage): CaseInput {
  const rechecked = stage !== "asking" && stage !== "one_answered";
  const base = scenarioA(rechecked ? 2 : 1);
  const answered = (q: Question) => stage !== "asking" && (q._id === "qB_1" || rechecked);
  const questions = QB.map((q) => ({ ...q, status: answered(q) ? "answered" as const : "open" as const }));
  const done = questions.filter((q) => q.status === "answered");
  // The clerk dismissed line 1 here (the ocean rate was renegotiated by phone), so only line 6 is disputed.
  const findings = base.findings.map((f) => (rechecked && f.revision === 2 && f.key === "chg_1" ? { ...f, userVerdict: "false_positive" as const } : f));
  const events = [
    ...base.events.filter((e) => e.type !== "question_asked" && e.type !== "reply_received").map((e) => ({ ...e, caseId: B })),
    ...QB.map((q, i) => event(B, 10 + i, q.createdAt, "agent", "question_asked", { questionId: q._id })),
    ...done.map((q, i) => event(B, 20 + i, ANSWERED_AT[q._id], "ops_lead", "reply_received", { questionId: q._id })),
  ];
  const draft = stage === "approved" ? { ...DRAFT_B, status: "approved" as const, approvedBy: "sam" } : DRAFT_B;
  if (rechecked) {
    events.push(event(B, 30, "2026-10-24T11:40:00-07:00", "clerk", "draft_created", { draftId: DRAFT_B._id }));
    events.push(event(B, 31, "2026-10-24T11:40:05-07:00", "clerk", "approval_requested", { draftId: DRAFT_B._id, personId: "maya" }));
  }
  if (stage === "approved") events.push(event(B, 32, "2026-10-24T11:52:00-07:00", "controller", "approved", { draftId: DRAFT_B._id, personId: "sam" }));
  return {
    ...base,
    case: { ...base.case, _id: B, title: B_TITLE, shipmentRef: "PCL-INV-2210" },
    documents: [...base.documents.filter((d) => d.type !== "reply"), ...done.map((q) => replyDoc(q, ANSWERED_AT[q._id]))],
    findings, questions, replies: done.map(reply), events,
    drafts: rechecked ? [draft] : [],
  };
}

/** Case B as a DemoCase, so it plugs into the same inputs as Scenario A. Its stages are snapshots only. */
export const CASE_B: DemoCase = {
  id: B, title: B_TITLE, summary: "1 invoice, 8 charges, two questions",
  start: "asking", end: "drafted", stages: ["asking", "one_answered", "drafted", "approved"],
  at: (stage) => caseB(stage as CaseBStage),
  answers: {},
  draft: (x) => x.drafts.at(-1),
};

export const inboxCase = (demo: DemoCase, x: CaseInput): InboxCase => ({ demo, x, forwarder: FORWARDER });

/** Both cases at once: A before the answer, B with both questions open (three questions in all). */
export const allAsking = (): InboxCase[] => [inboxCase(SCENARIO_A, scenarioAAt("before")), inboxCase(CASE_B, caseB("asking"))];
