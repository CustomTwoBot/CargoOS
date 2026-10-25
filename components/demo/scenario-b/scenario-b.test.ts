import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  CaseEventSchema, CaseSchema, ChargeSchema, DraftSchema, FactSchema, FindingChangeSchema, FindingSchema, QuestionSchema,
  ReplySchema, SourceDocSchema,
} from "@/lib/schemas";
import { parseMoneyToCents } from "@/lib/engine/money";
import type { Finding, RuleId, Status } from "@/lib/types";
import { caseTotals } from "@/components/case/totals";
import { currentFindings, isRechecking, uiGroup, type CaseInput } from "@/components/case/view-model";
import { ANSWER_DRAYAGE, ANSWER_DRAYAGE_VAGUE, ANSWER_FEES, CHARGES, LINES, Q_DRAYAGE, Q_DRAYAGE_FOLLOWUP, Q_FEES } from "./data";
import { SCENARIO_B, SCENARIO_B_EVENTS, SCENARIO_B_REVISIONS, SCENARIO_B_STAGES } from "./scenario-b";

// ---- Expected results, written before the builder (one row per invoice line) ----

type Expect = [Status, RuleId, number?]; // status, rule, over-by in cents
const D = "potential_discrepancy", W = "needs_review", S = "supported", O = "outside_quote_scope";

const REV1: Record<number, Expect> = {
  1: [D, "R2_RATE_MISMATCH", 120000],     // ocean $12,300 vs $11,100 if booked by Sep 15; booked Sep 12
  2: [W, "R3_MATH_CURRENCY"],             // origin trucking in CNY
  3: [S, "R0_MATCH"],                     // origin THC $780
  4: [S, "R4_PERMITTED_SURCHARGE"],       // PSS, quote clause, no cap
  5: [D, "R4_PERMITTED_SURCHARGE", 15000], // LSS $600, capped at $450
  6: [S, "R0_MATCH"],                     // destination THC $1,950 (proforma)
  7: [D, "R2_RATE_MISMATCH", 4000],       // customs $225 vs $185
  8: [S, "R0_MATCH"],                     // ISF/doc fee $95
  9: [W, "R7_CONFLICT"],                  // drayage: email $5,550 vs proforma $5,850, same email
  10: [W, "R6_NO_EVIDENCE"],              // chassis
  11: [O, "R5_EXCLUDED_SCOPE"],           // demurrage, excluded but billable at cost
  12: [D, "R1_DUPLICATE", 195000],        // destination THC again
  13: [W, "R6_NO_EVIDENCE"],              // pre-pull
  14: [W, "R6_NO_EVIDENCE"],              // warehouse appointment handling
  15: [W, "R6_NO_EVIDENCE"],              // congestion
};
const REV2: Record<number, Expect> = {
  ...REV1,
  10: [S, "R8_APPROVED"],                 // chassis approved at $540
  13: [D, "R8_APPROVED", 15000],          // pre-pull approved only up to $300
  14: [D, "R9_REJECTED", 37500],          // nobody agreed to handling
  15: [S, "R8_APPROVED"],                 // congestion approved
};
const REV3 = REV2;                        // vague answer: nothing moves
const REV4: Record<number, Expect> = { ...REV3, 9: [D, "R8_APPROVED", 30000] }; // drayage agreed at $5,550

const EXPECTED = [REV1, REV2, REV3, REV4];

const TOTALS = [
  // billedCents adds the CNY line as if it were USD (see the report: totals.ts sums billedCents as is).
  { billedCents: 3152500, agreedCents: 1647000, atStakeCents: 334000, waitingCents: 1171500, waivedCents: 0 },
  { billedCents: 3152500, agreedCents: 1761000, atStakeCents: 386500, waitingCents: 1005000, waivedCents: 0 },
  { billedCents: 3152500, agreedCents: 1761000, atStakeCents: 386500, waitingCents: 1005000, waivedCents: 0 },
  { billedCents: 3152500, agreedCents: 2316000, atStakeCents: 416500, waitingCents: 420000, waivedCents: 0 },
];

const row = (f: Finding): Expect => (f.deltaCents === undefined ? [f.status, f.ruleId] : [f.status, f.ruleId, f.deltaCents]);
const all = SCENARIO_B_STAGES.map((s) => [s, SCENARIO_B.at(s)] as const);

describe("Scenario B findings come from the engine", () => {
  it("has four revisions", () => {
    expect(SCENARIO_B_REVISIONS.map((r) => r.revision)).toEqual([1, 2, 3, 4]);
  });

  it.each(EXPECTED.map((e, i) => [i + 1, e] as const))("revision %i lands each line on the intended rule", (rev, expected) => {
    const findings = SCENARIO_B_REVISIONS[rev - 1].findings;
    expect(Object.fromEntries(findings.map((f) => [f.lineNo, row(f)]))).toEqual(expected);
    expect(findings.every((f) => f.revision === rev)).toBe(true);
  });

  it.each(TOTALS.map((t, i) => [i + 1, t] as const))("revision %i totals", (rev, totals) => {
    expect(caseTotals(SCENARIO_B_REVISIONS[rev - 1].findings)).toEqual(totals);
  });

  it("each recompute lists exactly the lines that moved", () => {
    expect(SCENARIO_B_REVISIONS.map((r) => r.changes.map((c) => c.lineNo))).toEqual([
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], [10, 13, 14, 15], [], [9],
    ]);
    const second = SCENARIO_B_REVISIONS[1].changes;
    expect(second.map((c) => [c.from?.status, c.to.status, c.to.deltaCents])).toEqual([
      [W, S, undefined], [W, D, 15000], [W, D, 37500], [W, S, undefined],
    ]);
    expect(second.flatMap((c) => c.causedByFactIds)).toEqual(ANSWER_FEES.reply.factIds.slice(1, 3).concat(
      ANSWER_FEES.reply.factIds[3], ANSWER_FEES.reply.factIds[0]));
  });
});

describe("Scenario B sources", () => {
  const snapshotEnd = SCENARIO_B.at(SCENARIO_B.end);
  const text = new Map(snapshotEnd.documents.map((d) => [d._id, d.text]));
  const inDoc = (span: { docId: string; quote: string }) => text.get(span.docId)?.includes(span.quote) ?? false;

  it("every fact, charge, citation and evidence quote is an exact substring of its document", () => {
    const spans = [
      ...snapshotEnd.facts.map((f) => f.span),
      ...snapshotEnd.charges.map((c) => c.span),
      ...snapshotEnd.questions.flatMap((q) => q.citations),
      ...all.flatMap(([, x]) => x.findings.flatMap((f) => f.evidence)),
    ];
    expect(spans.length).toBeGreaterThan(40);
    expect(spans.filter((s) => !inDoc(s))).toEqual([]);
  });

  it("answer facts come from the reply document, stated by the ops lead", () => {
    for (const a of [ANSWER_FEES, ANSWER_DRAYAGE_VAGUE, ANSWER_DRAYAGE]) {
      expect(a.doc.type).toBe("reply");
      for (const f of a.facts) {
        expect([f.origin, f.statedBy, f.span.docId, f.effectiveAt]).toEqual(["reply", "ops_lead", a.doc._id, a.doc.sentAt]);
      }
    }
    expect(ANSWER_DRAYAGE_VAGUE.facts).toEqual([]);
  });

  it("each invoice line's printed amount is its amount in cents", () => {
    expect(LINES.map((l) => parseMoneyToCents(l.printed))).toEqual(CHARGES.map((c) => c.amountCents));
    expect(CHARGES.filter((c) => c.currency !== "USD").map((c) => c.lineNo)).toEqual([2]);
  });

  it("every snapshot matches the shared Zod schemas", () => {
    const Snapshot = z.object({
      case: CaseSchema, documents: z.array(SourceDocSchema), facts: z.array(FactSchema), charges: z.array(ChargeSchema),
      findings: z.array(FindingSchema), questions: z.array(QuestionSchema), replies: z.array(ReplySchema),
      drafts: z.array(DraftSchema), events: z.array(CaseEventSchema),
    });
    for (const [, x] of all) expect(() => Snapshot.parse(x)).not.toThrow();
  });
});

describe("Scenario B events look like the pipeline's", () => {
  it("are in time order, Pacific, with one recompute per change", () => {
    const times = SCENARIO_B_EVENTS.map((e) => Date.parse(e.at));
    expect(times).toEqual([...times].sort((a, b) => a - b));
    expect(SCENARIO_B_EVENTS.every((e) => e.at.endsWith("-07:00"))).toBe(true);
    expect(SCENARIO_B_EVENTS.map((e) => e.type)).toEqual([
      ...Array(5).fill("doc_added"), ...Array(5).fill("facts_extracted"), "recomputed", "question_asked", "question_asked",
      "reply_received", "facts_extracted", "recomputed",
      "reply_received", "facts_extracted", "question_asked", "recomputed",
      "reply_received", "facts_extracted", "recomputed",
    ]);
  });

  it("recomputed events carry { revision, changes } that parse as FindingChange[]", () => {
    const recomputed = SCENARIO_B_EVENTS.filter((e) => e.type === "recomputed");
    expect(recomputed.map((e) => e.payload.revision)).toEqual([1, 2, 3, 4]);
    for (const e of recomputed) expect(z.array(FindingChangeSchema).safeParse(e.payload.changes).success).toBe(true);
  });

  it("the follow-up question points at the drayage question", () => {
    const followUp = SCENARIO_B.at("after-q2").questions.find((q) => q._id === Q_DRAYAGE_FOLLOWUP._id);
    expect(followUp).toMatchObject({ followupOf: Q_DRAYAGE._id, status: "open", findingKeys: ["b_chg_9"] });
  });
});

describe("Scenario B replay", () => {
  const openIds = (x: CaseInput) => x.questions.filter((q) => q.status === "open").map((q) => q._id);

  it("every beat's stage exists, the first beat is the reply arriving, beats move forward", () => {
    for (const [id, answer] of Object.entries(SCENARIO_B.answers)) {
      expect(answer.beats.every((b) => SCENARIO_B.stages.includes(b.stage)), id).toBe(true);
      expect(answer.beats[0]).toEqual({ at: 0, stage: expect.stringMatching(/-answered$/) });
      const ats = answer.beats.map((b) => b.at);
      expect(ats).toEqual([...ats].sort((a, b) => a - b));
      expect(SCENARIO_B.stages.indexOf(answer.beats.at(-1)!.stage)).toBeGreaterThan(SCENARIO_B.stages.indexOf(answer.beats[0].stage));
    }
    expect(SCENARIO_B.stages).toContain(SCENARIO_B.start);
    expect(SCENARIO_B.stages).toContain(SCENARIO_B.end);
    expect(() => SCENARIO_B.at("nope")).toThrow();
  });

  it("each answer is recorded for a question that is open when it plays", () => {
    for (const [id, answer] of Object.entries(SCENARIO_B.answers)) {
      const before = SCENARIO_B.stages[SCENARIO_B.stages.indexOf(answer.beats[0].stage) - 1];
      expect(openIds(SCENARIO_B.at(before))).toContain(id);
    }
  });

  it("each moving beat brings the line (or the Cleared row) that just landed into view", () => {
    const q1 = SCENARIO_B.answers[Q_FEES._id].beats.slice(1).map((b) => b.moving);
    expect(q1).toEqual(["cleared", "b_chg_13", "b_chg_14", "cleared"]);
    expect(SCENARIO_B.answers[Q_DRAYAGE._id].beats.slice(1).map((b) => b.moving)).toEqual([undefined]);
    expect(SCENARIO_B.answers[Q_DRAYAGE_FOLLOWUP._id].beats.slice(1).map((b) => b.moving)).toEqual(["b_chg_9"]);
  });

  it("shows rechecking only while an answer is in and not yet recomputed", () => {
    const rechecking = all.filter(([, x]) => isRechecking(x)).map(([s]) => s);
    expect(rechecking).toEqual(["q1-answered", "q2-answered", "q3-answered"]);
  });

  it("lands the first answer's lines one at a time", () => {
    const groups = (s: string) => currentFindings(SCENARIO_B.at(s)).filter((f) => [10, 13, 14, 15].includes(f.lineNo)).map((f) => uiGroup(f));
    expect(["q1-answered", "q1-moved-1", "q1-moved-2", "q1-moved-3", "after-q1"].map(groups)).toEqual([
      ["waiting", "waiting", "waiting", "waiting"],
      ["cleared", "waiting", "waiting", "waiting"],
      ["cleared", "dispute", "waiting", "waiting"],
      ["cleared", "dispute", "dispute", "waiting"],
      ["cleared", "dispute", "dispute", "cleared"],
    ]);
  });

  it("opens with two questions and ends with none", () => {
    expect(openIds(SCENARIO_B.at("before"))).toEqual([Q_FEES._id, Q_DRAYAGE._id]);
    expect(openIds(SCENARIO_B.at("after-q1"))).toEqual([Q_DRAYAGE._id]);
    expect(openIds(SCENARIO_B.at("after-q2"))).toEqual([Q_DRAYAGE_FOLLOWUP._id]);
    expect(openIds(SCENARIO_B.at("after"))).toEqual([]);
    expect(SCENARIO_B.at("after").case).toMatchObject({ revision: 4, status: "open" });
  });
});

describe("Scenario B draft", () => {
  const end = SCENARIO_B.at(SCENARIO_B.end);
  const draft = SCENARIO_B.draft(end)!;
  const disputed = currentFindings(end).filter((f) => f.status === "potential_discrepancy");

  it("is only offered once no question is open", () => {
    const offered = all.filter(([, x]) => SCENARIO_B.draft(x)).map(([s]) => s);
    expect(offered).toEqual(["after"]);
  });

  it("disputes exactly the disputed lines, for the case's At stake", () => {
    expect(draft.findingKeys).toEqual(disputed.map((f) => f.key));
    expect(draft.findingKeys.map((k) => k.replace("b_chg_", ""))).toEqual(["1", "5", "7", "9", "12", "13", "14"]);
    expect(draft.totalDisputedCents).toBe(disputed.reduce((s, f) => s + f.deltaCents!, 0));
    expect(draft.totalDisputedCents).toBe(416500);
    expect(draft.subject).toBe("Invoice KBL-INV-2291: 7 disputed lines ($4,165)");
    expect(draft).toMatchObject({ to: "forwarder", status: "draft", createdBy: "clerk" });
  });

  it("states each line's billed and over-by amounts from its finding", () => {
    const fmt = (c: number) => `$${(c / 100).toLocaleString("en-US")}`;
    for (const f of disputed) {
      const line = draft.body.split("\n").find((l) => l.startsWith(`Line ${f.lineNo},`));
      expect(line, `line ${f.lineNo}`).toContain(`billed ${fmt(f.billedCents)}.`);
      expect(line).toMatch(new RegExp(`Over by \\${fmt(f.deltaCents!)}\\.$`));
    }
    expect(draft.body).toContain("Total disputed: $4,165.");
    expect(draft.body).toContain("The lines we agree with come to $23,160.");
    expect(draft.body).toContain("Line 2 (Origin trucking Kunshan-Shanghai port) is billed in CNY");
  });

  it("every dollar amount in the body comes from the findings or their cited quotes", () => {
    const end4 = caseTotals(currentFindings(end));
    const quotes = disputed.flatMap((f) => f.evidence.map((e) => e.quote)).join(" ");
    const known = new Set([
      ...disputed.flatMap((f) => [f.billedCents, f.deltaCents!]),
      end4.atStakeCents, end4.agreedCents + end4.waivedCents,
    ].map((c) => `$${(c / 100).toLocaleString("en-US")}`));
    const amounts = [...draft.body.matchAll(/\$[\d,]+(?:\.\d+)?/g)].map((m) => m[0]);
    expect(amounts.filter((a) => !known.has(a) && !quotes.includes(a))).toEqual([]);
  });

  it("drops a line the operator dismissed", () => {
    const dismissed = {
      ...end, findings: end.findings.map((f) => (f.revision === 4 && f.lineNo === 7 ? { ...f, userVerdict: "false_positive" as const } : f)),
    };
    const d = SCENARIO_B.draft(dismissed)!;
    expect(d.findingKeys).not.toContain("b_chg_7");
    expect(d.totalDisputedCents).toBe(416500 - 4000);
    expect(d.body).toContain("The lines we agree with come to $23,200.");
  });
});
