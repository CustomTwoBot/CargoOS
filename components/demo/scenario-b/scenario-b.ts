// Scenario B as a replay case (components/case/demo-case.ts). The story is recorded as the
// pipeline would log it (SPEC §4): documents in, facts read, a recompute per change, questions,
// answers. Every revision's findings come from the real engine (`reconcile`), never by hand.
//
// Revision 1: first check, two questions (four fees nobody agreed to; drayage sources disagree).
// Revision 2: answer to question 1 (two fees cleared, two disputed).
// Revision 3: a vague answer about drayage; nothing moves and CargoOS asks one follow-up.
// Revision 4: answer to the follow-up; drayage becomes a dispute.
import type { CaseEvent, Fact, Finding, FindingChange, Question } from "@/lib/types";
import { reconcile } from "@/lib/engine/reconcile";
import { formatUSD } from "@/lib/engine/money";
import type { Beat, DemoCase, RecordedAnswer } from "@/components/case/demo-case";
import { uiGroup, type CaseInput } from "@/components/case/view-model";
import {
  ANSWER_DRAYAGE, ANSWER_DRAYAGE_VAGUE, ANSWER_FEES, CASE, CASE_ID, CHARGES, EMAIL_FACTS, FACTS_BY_DOC, PROFORMA_FACTS,
  Q_DRAYAGE, Q_DRAYAGE_FOLLOWUP, Q_FEES, SOURCE_DOCS, type Answer, type QuestionDef,
} from "./data";
import { diffFindings } from "./diff";
import { draftFor } from "./draft";

// ---- Question wording (numbers filled in by code) ----

const billed = (key: string) => formatUSD(CHARGES.find((c) => c._id === key)!.amountCents);
const usd = (f: Fact) => formatUSD(f.amountCents!);

const QUESTION_TEXT: Record<string, string> = {
  [Q_FEES._id]: `Invoice lines 10, 13, 14 and 15 bill chassis usage (${billed("b_chg_10")}), pre-pull and yard storage `
    + `(${billed("b_chg_13")}), warehouse appointment handling (${billed("b_chg_14")}) and an Oakland congestion fee `
    + `(${billed("b_chg_15")}). None of them is in the quote, the Sep 9 email or the proforma; the WhatsApp chat only says `
    + "a congestion fee 'may apply'. Did anyone agree to any of these?",
  [Q_DRAYAGE._id]: `Line 9 bills drayage Oakland -> Reno at ${billed("b_chg_9")}. The Sep 9 email says ${usd(EMAIL_FACTS[1])} `
    + `for the three containers, but the proforma attached to the same email says ${usd(PROFORMA_FACTS[1])}. Which one was agreed?`,
  [Q_DRAYAGE_FOLLOWUP._id]: `Thanks. To recheck line 9 we need one number: was drayage Oakland -> Reno agreed at `
    + `${usd(EMAIL_FACTS[1])} or at ${usd(PROFORMA_FACTS[1])} for the three containers?`,
};

// ---- The recorded run ----

const at = (hms: string) => `2026-10-24T${hms}-07:00`;

type Recompute = { revision: number; findings: Finding[]; changes: FindingChange[]; eventId: string };

const events: CaseEvent[] = [];
const recomputes: Recompute[] = [];
const asked = new Map<string, string>();   // question id -> question_asked event id
const answered = new Map<string, string>(); // question id -> reply_received event id

const log = (time: string, actor: CaseEvent["actor"], type: CaseEvent["type"], payload: Record<string, unknown>) => {
  const e: CaseEvent = { _id: `b_evt_${events.length + 1}`, caseId: CASE_ID, at: at(time), actor, type, payload };
  events.push(e);
  return e;
};

const baseFacts = SOURCE_DOCS.flatMap((d) => FACTS_BY_DOC[d._id]);
const ANSWERS = [ANSWER_FEES, ANSWER_DRAYAGE_VAGUE, ANSWER_DRAYAGE];

function recompute(time: string, cause: CaseEvent, answers: Answer[]) {
  const prior = recomputes.at(-1)?.findings ?? [];
  const revision = recomputes.length + 1;
  const findings = reconcile({
    case: { ...CASE, revision: revision - 1 },
    facts: [...baseFacts, ...answers.flatMap((a) => a.facts)],
    charges: CHARGES, prior,
    documents: [...SOURCE_DOCS, ...answers.map((a) => a.doc)],
  });
  const changes = diffFindings(prior, findings, cause._id);
  const e = log(time, "system", "recomputed", { revision, changes });
  recomputes.push({ revision, findings, changes, eventId: e._id });
}

function ask(time: string, q: QuestionDef) {
  const e = log(time, "agent", "question_asked", {
    questionId: q._id, to: q.to, findingKeys: q.findingKeys, ...(q.followupOf ? { followupOf: q.followupOf } : {}),
  });
  asked.set(q._id, e._id);
}

function reply(time: string, a: Answer, read: string) {
  const { reply: r, doc } = a;
  const e = log(time, "ops_lead", "reply_received", {
    questionId: r.questionId, replyId: r._id, docId: doc._id, interpretation: r.interpretation, factIds: r.factIds,
  });
  answered.set(r.questionId, e._id);
  log(read, "agent", "facts_extracted", {
    docId: doc._id, replyId: r._id, questionId: r.questionId, interpretation: r.interpretation, factIds: r.factIds,
    dropped: [], questionStatus: "answered",
  });
  return e;
}

SOURCE_DOCS.forEach((d, i) => log(`13:40:0${i}`, "system", "doc_added", { docId: d._id }));
SOURCE_DOCS.forEach((d, i) => log(`13:40:1${i}`, "agent", "facts_extracted", {
  docId: d._id, factIds: FACTS_BY_DOC[d._id].map((f) => f._id),
  chargeIds: CHARGES.filter((c) => c.docId === d._id).map((c) => c._id),
}));
recompute("13:40:16", events.at(-1)!, []);
ask("13:41:00", Q_FEES);
ask("13:41:05", Q_DRAYAGE);
const BEFORE = events.length;

const r1 = reply("14:20:00", ANSWER_FEES, "14:20:02");
const Q1_IN = events.length;
recompute("14:20:04", r1, ANSWERS.slice(0, 1));

const r2 = reply("14:31:00", ANSWER_DRAYAGE_VAGUE, "14:31:02");
const Q2_IN = events.length;
ask("14:31:03", Q_DRAYAGE_FOLLOWUP);
recompute("14:31:04", r2, ANSWERS.slice(0, 2));

const r3 = reply("14:44:00", ANSWER_DRAYAGE, "14:44:02");
const Q3_IN = events.length;
recompute("14:44:04", r3, ANSWERS);

// ---- Snapshots ----

/** A stage = the events logged so far, the revision shown, and how many of its changes have landed. */
type StageDef = { id: string; upTo: number; revision: number; landed?: number };

const upToRecompute = (revision: number) => events.findIndex((e) => e._id === recomputes[revision - 1].eventId) + 1;

/** Answer beats: the reply arrives ("rechecking"), then each changed line lands, 1.6 s apart. */
function answerStages(prefix: string, upTo: number, revision: number) {
  const changes = recomputes[revision - 1].changes;
  const stages: StageDef[] = [{ id: `${prefix}-answered`, upTo, revision: revision - 1 }];
  for (let k = 1; k < changes.length; k++) stages.push({ id: `${prefix}-moved-${k}`, upTo: upToRecompute(revision), revision, landed: k });
  return stages;
}

const STAGE_DEFS: StageDef[] = [
  { id: "before", upTo: BEFORE, revision: 1 },
  ...answerStages("q1", Q1_IN, 2),
  { id: "after-q1", upTo: upToRecompute(2), revision: 2 },
  ...answerStages("q2", Q2_IN, 3),
  { id: "after-q2", upTo: upToRecompute(3), revision: 3 },
  ...answerStages("q3", Q3_IN, 4),
  { id: "after", upTo: upToRecompute(4), revision: 4 },
];

const QUESTIONS = [Q_FEES, Q_DRAYAGE, Q_DRAYAGE_FOLLOWUP];

function snapshot({ upTo, revision, landed }: StageDef): CaseInput {
  const seen = new Set(events.slice(0, upTo).map((e) => e._id));
  const isIn = (a: Answer) => seen.has(answered.get(a.reply.questionId) ?? "");
  const answers = ANSWERS.filter(isIn);
  const questions: Question[] = QUESTIONS.filter((q) => seen.has(asked.get(q._id) ?? "")).map((q) => ({
    ...q, text: QUESTION_TEXT[q._id], status: seen.has(answered.get(q._id) ?? "") ? "answered" : "open",
  }));

  const top = recomputes[revision - 1];
  let findings = recomputes.slice(0, revision).flatMap((r) => r.findings);
  let evs = events.slice(0, upTo);
  if (landed !== undefined) {
    // Mid-replay: lines whose change has not landed yet still show the previous revision.
    const waiting = new Set(top.changes.slice(landed).map((c) => c.key));
    const prev = new Map(recomputes[revision - 2].findings.map((f) => [f.key, f]));
    findings = findings.map((f) => (f.revision === revision && waiting.has(f.key) ? { ...prev.get(f.key)!, revision } : f));
    evs = evs.map((e) => (e._id === top.eventId ? { ...e, payload: { ...e.payload, changes: top.changes.slice(0, landed) } } : e));
  }

  return {
    case: { ...CASE, revision, status: questions.some((q) => q.status === "open") ? "awaiting_answer" : "open" },
    documents: [...SOURCE_DOCS, ...answers.map((a) => a.doc)],
    facts: [...baseFacts, ...answers.flatMap((a) => a.facts)],
    charges: CHARGES,
    findings,
    questions,
    replies: answers.map((a) => a.reply),
    drafts: [],
    events: evs,
  };
}

const SNAPSHOTS = new Map(STAGE_DEFS.map((s) => [s.id, snapshot(s)]));

/** The bring-into-view target for a landed change: the folded Cleared row, or the line itself. */
const movingOf = (c: FindingChange) => (uiGroup(c.to) === "cleared" ? "cleared" : c.key);

function beatsFor(prefix: string, revision: number, last: string): Beat[] {
  const changes = recomputes[revision - 1].changes;
  const steps = STAGE_DEFS.filter((s) => s.id.startsWith(`${prefix}-moved-`)).map((s) => s.id);
  const after = [...steps, last];
  return [
    { at: 0, stage: `${prefix}-answered` },
    ...after.map((stage, i) => ({ at: 1600 * (i + 1), stage, moving: changes[i] && movingOf(changes[i]) })),
  ];
}

const recorded = (a: Answer, beats: Beat[]): RecordedAnswer => ({ text: a.doc.text, beats });

export const SCENARIO_B_STAGES = STAGE_DEFS.map((s) => s.id);

/** For tests: each revision's engine output and its diff. */
export const SCENARIO_B_REVISIONS: readonly Recompute[] = recomputes;
export const SCENARIO_B_EVENTS: readonly CaseEvent[] = events;

export const SCENARIO_B: DemoCase = {
  id: CASE_ID,
  title: CASE.title,
  summary: "1 invoice, 15 charges, two questions and a follow-up",
  start: "before",
  end: "after",
  stages: SCENARIO_B_STAGES,
  at: (stage) => {
    const s = SNAPSHOTS.get(stage);
    if (!s) throw new Error(`Scenario B has no stage "${stage}"`);
    return s;
  },
  answers: {
    [Q_FEES._id]: recorded(ANSWER_FEES, beatsFor("q1", 2, "after-q1")),
    [Q_DRAYAGE._id]: recorded(ANSWER_DRAYAGE_VAGUE, beatsFor("q2", 3, "after-q2")),
    [Q_DRAYAGE_FOLLOWUP._id]: recorded(ANSWER_DRAYAGE, beatsFor("q3", 4, "after")),
  },
  draft: draftFor,
};
