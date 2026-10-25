// Fixture mode (SPEC.md W3 step 1): Scenario A as the screen would get it from Convex,
// before (revision 1) or after (revision 2) the answer. Parsed with the shared Zod schemas.
import { z } from "zod";
import ui from "@/fixtures/scenarioA.ui.json";
import {
  CaseEventSchema, CaseSchema, ChargeSchema, DraftSchema, FactSchema, FindingChangeSchema, FindingSchema, QuestionSchema,
  ReplySchema, SourceDocSchema,
} from "@/lib/schemas";
import type { Draft } from "@/lib/types";
import type { DemoCase } from "./demo-case";
import { instant, type CaseInput } from "./view-model";

const FixtureSchema = z.object({
  case: CaseSchema, documents: z.array(SourceDocSchema), facts: z.array(FactSchema),
  charges: z.array(ChargeSchema), findings: z.record(z.string(), z.array(FindingSchema)),
  question: QuestionSchema, reply: ReplySchema, draft: DraftSchema, events: z.array(CaseEventSchema),
  changes: z.array(FindingChangeSchema),
});

const fx = FixtureSchema.parse(ui);

export type FixtureRevision = 1 | 2;

/** Scenario A at a revision. No draft yet: the draft appears when the operator drafts one. */
export function scenarioA(revision: FixtureRevision): CaseInput {
  const recomputed = fx.events.find((e) => e.type === "recomputed" && e.payload.revision === revision);
  if (!recomputed) throw new Error(`Fixture has no recompute for revision ${revision}`);
  const answered = revision === 2;
  return {
    case: { ...fx.case, revision },
    documents: fx.documents.filter((d) => answered || d.type !== "reply"),
    facts: fx.facts.filter((f) => answered || f.origin !== "reply"),
    charges: fx.charges,
    findings: Object.entries(fx.findings).filter(([r]) => Number(r) <= revision).flatMap(([, f]) => f),
    questions: [{ ...fx.question, status: answered ? "answered" : "open" }],
    replies: answered ? [fx.reply] : [],
    drafts: [],
    events: fx.events.filter((e) => instant(e.at) <= instant(recomputed.at)),
  };
}

/**
 * Replay of the recorded answer, one beat at a time (docs/design.md §9):
 * before → answered (reply in, rechecking) → partial (line 4 moved) → after (line 6 moved).
 */
export type ReplayStage = "before" | "answered" | "partial" | "after";
export const REPLAY_STAGES: ReplayStage[] = ["before", "answered", "partial", "after"];

export function scenarioAAt(stage: ReplayStage): CaseInput {
  if (stage === "before") return scenarioA(1);
  if (stage === "after") return scenarioA(2);
  const before = scenarioA(1), after = scenarioA(2);
  if (stage === "answered") {
    const reply = after.events.find((e) => e.type === "reply_received")!;
    return {
      ...before,
      documents: after.documents, facts: after.facts, replies: after.replies,
      questions: after.questions,
      events: after.events.filter((e) => instant(e.at) <= instant(reply.at)),
    };
  }
  // partial: only the first changed line has landed.
  const first = fx.changes[0].key;
  const recomputed = after.events.at(-1)!;
  return {
    ...after,
    findings: after.findings.map((f) =>
      f.revision === 2 && f.key !== first ? { ...before.findings.find((b) => b.key === f.key)!, revision: 2 } : f),
    events: [...after.events.slice(0, -1), { ...recomputed, payload: { ...recomputed.payload, changes: fx.changes.slice(0, 1) } }],
  };
}

/** The fixture's dispute draft (written by the agent in live mode). */
export const scenarioADraft = (): Draft => fx.draft;

/** Scenario A as a replay case: one question, answered once (docs/demo-script.md). */
export const SCENARIO_A: DemoCase = {
  id: fx.case._id,
  title: fx.case.title,
  summary: "1 invoice, 8 charges, one question",
  start: "before",
  end: "after",
  stages: REPLAY_STAGES,
  at: (stage) => scenarioAAt(stage as ReplayStage),
  answers: {
    [fx.question._id]: {
      text: fx.documents.find((d) => d.type === "reply")?.text ?? "",
      beats: [
        { at: 0, stage: "answered" },
        { at: 1600, stage: "partial", moving: "cleared" },
        { at: 3200, stage: "after", moving: fx.changes[1]?.key },
      ],
    },
  },
  draft: (x) => (x.case.revision === 2 ? fx.draft : undefined),
};
