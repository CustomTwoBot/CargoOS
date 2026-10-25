import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadScenarios } from "@/scripts/evalCore";
import { diffFindings } from "@/lib/engine/diff";
import { reconcile } from "@/lib/engine/reconcile";
import { caseTotals } from "@/lib/engine/totals";
import type { Case, Fact, Finding, LearnedRule } from "@/lib/types";

// B-repeat stand-in until fixtures/cases/B-repeat lands (SPEC §7.6): a second Pacific Crest case
// built from Scenario A's lines, where rush handling (line 6) has no written agreement.
const scenarios = loadScenarios(join(import.meta.dirname, "..", "..", "fixtures"));
const A = scenarios.find((s) => s.id === "A")!;
const caseB: Case = { ...A.extracted.case, _id: "case_B", forwarder: "Pacific Crest Logistics", revision: 0 };
const docs = A.extracted.documents;

// The rule Scenario A line 6 saves when Maya marks it Not an issue (SPEC §6 "Learned rules").
const ruleFromA: LearnedRule = {
  _id: "rule_handling", forwarder: "Pacific Crest Logistics", chargeType: "handling", maxAmountCents: 40000,
  createdBy: "maya", createdAt: "2026-10-24T21:40:00-07:00", sourceCaseId: "case_A", sourceChargeId: "chg_6",
};

function run(opts: { case?: Case; rules?: LearnedRule[]; extraFacts?: Fact[]; prior?: Finding[] } = {}): Finding[] {
  return reconcile({
    case: opts.case ?? caseB, facts: [...A.extracted.facts, ...(opts.extraFacts ?? [])], charges: A.extracted.charges,
    documents: docs, learnedRules: opts.rules, prior: opts.prior,
  });
}
const line = (fs: Finding[], n: number) => fs.find((f) => f.lineNo === n)!;

describe("R10 learned rules (SPEC §6, §9 W1 step 8)", () => {
  it("without rules, rush handling waits (R6)", () => {
    expect(line(run(), 6)).toMatchObject({ status: "needs_review", ruleId: "R6_NO_EVIDENCE" });
  });

  it("with the Scenario A rule, rush handling is cleared by R10 with the SPEC explanation", () => {
    const f = line(run({ rules: [ruleFromA] }), 6);
    expect(f).toMatchObject({
      status: "supported", ruleId: "R10_LEARNED", billedCents: 40000, expectedCents: 40000,
      factIds: [], evidence: [], learnedRuleId: "rule_handling",
      explanation: "You accepted this charge from Pacific Crest Logistics on Oct 24.",
    });
    expect(f).not.toHaveProperty("deltaCents");
    expect(f).not.toHaveProperty("missing");
    expect(f).not.toHaveProperty("routeTo");
  });

  it("nothing else changes, and nothing waits any more", () => {
    const without = run(), withRule = run({ rules: [ruleFromA] });
    expect(diffFindings(without, withRule, "evt_rule").map((c) => c.lineNo)).toEqual([6]);
    expect(withRule.filter((f) => f.status === "needs_review").map((f) => f.lineNo)).toEqual([4]);
  });

  it("an amount over the cap stays R6; no cap clears any amount", () => {
    expect(line(run({ rules: [{ ...ruleFromA, maxAmountCents: 30000 }] }), 6).ruleId).toBe("R6_NO_EVIDENCE");
    expect(line(run({ rules: [{ ...ruleFromA, maxAmountCents: undefined }] }), 6).ruleId).toBe("R10_LEARNED");
  });

  it("a rule never applies in its source case", () => {
    const caseA: Case = { ...caseB, _id: "case_A" };
    expect(line(run({ case: caseA, rules: [ruleFromA] }), 6).ruleId).toBe("R6_NO_EVIDENCE");
  });

  it("a different forwarder is not cleared; the same forwarder in other casing is", () => {
    expect(line(run({ case: { ...caseB, forwarder: "Harbor Gate Freight" }, rules: [ruleFromA] }), 6).ruleId).toBe("R6_NO_EVIDENCE");
    expect(line(run({ case: { ...caseB, forwarder: "pacific crest logistics " }, rules: [ruleFromA] }), 6).ruleId).toBe("R10_LEARNED");
  });

  it("a case with no forwarder never uses learned rules", () => {
    expect(line(run({ case: { ...caseB, forwarder: undefined }, rules: [ruleFromA] }), 6).ruleId).toBe("R6_NO_EVIDENCE");
  });

  it("written evidence always wins over a rule (R2, R4, R9)", () => {
    const rules: LearnedRule[] = (["ocean_freight", "pss", "handling"] as const).map((chargeType, i) => ({
      ...ruleFromA, _id: `rule_${i}`, chargeType, maxAmountCents: undefined,
    }));
    const rejection: Fact = {
      _id: "fact_reject_handling", caseId: "case_B", kind: "rejection", chargeType: "handling", statedBy: "ops_lead",
      effectiveAt: "2026-11-04T10:00:00-07:00", origin: "reply",
      span: { docId: "doc_reply_b", locator: "reply", quote: "nobody agreed to rush handling" },
    };
    const fs = run({ rules, extraFacts: [rejection] });
    expect(line(fs, 1).ruleId).toBe("R2_RATE_MISMATCH");
    expect(line(fs, 2).ruleId).toBe("R4_PERMITTED_SURCHARGE");
    expect(line(fs, 6).ruleId).toBe("R9_REJECTED");
  });

  it("undo (rule removed) puts the line back to R6, and the diff reports it", () => {
    const withRule = run({ rules: [ruleFromA] });
    const undone = run({ rules: [], prior: withRule });
    expect(line(undone, 6).ruleId).toBe("R6_NO_EVIDENCE");
    expect(diffFindings(withRule, undone, "evt_undo")).toEqual([
      { key: "chg_6", lineNo: 6, from: { status: "supported" }, to: { status: "needs_review" }, causedByEventId: "evt_undo", causedByFactIds: [] },
    ]);
  });

  it("when two rules match, the newest one decides", () => {
    const older = { ...ruleFromA, _id: "rule_old", createdAt: "2026-10-20T09:00:00-07:00" };
    expect(line(run({ rules: [ruleFromA, older] }), 6).learnedRuleId).toBe("rule_handling");
    expect(line(run({ rules: [older, ruleFromA] }), 6).learnedRuleId).toBe("rule_handling");
  });

  it("totals count an R10 line like any supported line", () => {
    const t = caseTotals(run({ rules: [ruleFromA] }));
    expect(t).toMatchObject({ waiting: 20000, atStake: 30000 });
    expect(t.agreed + t.atStake + t.waiting + t.waived).toBe(t.billed);
  });

  it("Scenario A and every variation are unchanged when no rules are passed (eval stays exact)", () => {
    for (const s of scenarios) {
      const base = { case: s.extracted.case, facts: s.extracted.facts, charges: s.extracted.charges };
      expect(reconcile({ ...base, learnedRules: [] }), s.id).toEqual(reconcile(base));
    }
  });
});
