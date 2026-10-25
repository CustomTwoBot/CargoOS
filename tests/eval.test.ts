import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { ExpectedFinding } from "@/fixtures/answerKey";
import type { Finding } from "@/lib/types";
import {
  allPass, caseTotals, chargeExtraction, engineMetrics, formatTable, loadScenarios, runScenario,
  type Metric, type Reconcile, type Scenario,
} from "@/scripts/evalCore";

const SCENARIOS = loadScenarios(join(__dirname, "..", "fixtures"));
const byCase = new Map(SCENARIOS.map((s) => [s.extracted.case._id, s]));

const toFinding = (caseId: string, revision: number, f: ExpectedFinding): Finding => ({
  key: `chg_${f.lineNo}`, caseId, chargeId: `chg_${f.lineNo}`, lineNo: f.lineNo, revision,
  status: f.status, ruleId: f.ruleId, billedCents: f.billedCents, expectedCents: f.expectedCents, deltaCents: f.deltaCents,
  factIds: [], evidence: [], explanation: "",
});

// Fake engine that returns the answer key for the revision it is asked for (runScenario passes revision = reply count).
const oracle: Reconcile = ({ case: c }) => {
  const s = byCase.get(c._id)!;
  const expected = c.revision === 0 ? s.key.expected.findings : s.key.expected.replies[c.revision - 1].findingsAfter;
  return expected.map((f) => toFinding(c._id, c.revision, f));
};
const tweak = (fn: (findings: Finding[], caseId: string, revision: number) => Finding[]): Reconcile =>
  (input) => fn(oracle(input), input.case._id, input.case.revision);

const run = (reconcile: Reconcile, scenarios: Scenario[] = SCENARIOS) =>
  engineMetrics(scenarios.map((s) => runScenario(s, reconcile)));
const metric = (metrics: Metric[], name: string) => metrics.find((m) => m.name === name)!;

const expectedFindingCount = SCENARIOS.reduce((n, s) => n + s.key.expected.findings.length
  + s.key.expected.replies.reduce((m, r) => m + r.findingsAfter.length, 0), 0);

describe("eval metrics", () => {
  it("a perfect engine passes every metric, with denominators from the fixtures", () => {
    const { metrics, failures } = run(oracle);
    expect(failures).toEqual([]);
    expect(allPass(metrics)).toBe(true);
    expect(metrics.map((m) => m.name)).toEqual([
      "Finding status accuracy", "False positives on legitimate lines", "Question decision",
      "Revision correctness", "Source validity", "Totals",
    ]);
    expect(metric(metrics, "Finding status accuracy")).toMatchObject({ count: expectedFindingCount, total: expectedFindingCount });
    expect(metric(metrics, "Question decision")).toMatchObject({ count: 11, total: 11 });
    // A: lines 4, 6; A-no: 4, 6; A-yes: 4, 6; A-ambig: none.
    expect(metric(metrics, "Revision correctness")).toMatchObject({ count: 6, total: 6 });
    expect(metric(metrics, "False positives on legitimate lines").count).toBe(0);
  });

  it("an engine that disputes everything fails on false positives and status accuracy", () => {
    const { metrics } = run(tweak((fs) => fs.map((f) => ({
      ...f, status: "potential_discrepancy", ruleId: "R2_RATE_MISMATCH", expectedCents: 0, deltaCents: f.billedCents,
    }))));
    const fp = metric(metrics, "False positives on legitimate lines");
    expect(fp.count).toBe(fp.total);
    expect(fp.count).toBeGreaterThan(0);
    // Only the lines the answer key itself marks R2 disputes are right.
    const r2 = SCENARIOS.flatMap((s) => [s.key.expected.findings, ...s.key.expected.replies.map((r) => r.findingsAfter)])
      .flat().filter((f) => f.status === "potential_discrepancy" && f.ruleId === "R2_RATE_MISMATCH").length;
    expect(metric(metrics, "Finding status accuracy").count).toBe(r2);
    expect(allPass(metrics)).toBe(false);
  });

  it("an engine that ignores reply facts fails revision correctness", () => {
    const { metrics, failures } = run(tweak((_fs, caseId) => oracle({
      case: { ...byCase.get(caseId)!.extracted.case, revision: 0 }, facts: [], charges: [],
    })));
    expect(metric(metrics, "Revision correctness")).toMatchObject({ count: 0, total: 6 });
    expect(failures).toContain("A after reply 1 line 4: expected needs_review -> supported, got needs_review -> needs_review");
  });

  it("a missing finding counts as wrong", () => {
    const { metrics, failures } = run(tweak((fs, caseId) => (caseId === "case_A" ? fs.filter((f) => f.lineNo !== 2) : fs)));
    expect(metric(metrics, "Finding status accuracy").count).toBe(expectedFindingCount - 2); // before + after reply
    expect(failures).toContain("A before line 2: expected supported/R4_PERMITTED_SURCHARGE, got no finding");
  });

  it("an evidence quote that is not in its document fails source validity", () => {
    const { metrics, failures } = run(tweak((fs, caseId) => caseId !== "case_A" ? fs : fs.map((f) => f.lineNo !== 1 ? f : {
      ...f, evidence: [{ docId: "doc_email", locator: "email body", quote: "Ocean freight reduced to $4,400" }],
    })));
    const sv = metric(metrics, "Source validity");
    expect(sv.total - sv.count).toBe(2); // line 1 in both revisions
    expect(failures).toContain('A: span "Ocean freight reduced to $4,400" is not in doc_email');
  });

  it("a wrong delta fails totals but not status accuracy", () => {
    const { metrics, failures } = run(tweak((fs, caseId, revision) => caseId !== "case_A" || revision !== 0 ? fs
      : fs.map((f) => (f.lineNo === 1 ? { ...f, deltaCents: 29999 } : f))));
    expect(metric(metrics, "Finding status accuracy").count).toBe(expectedFindingCount);
    expect(metric(metrics, "Totals").total - metric(metrics, "Totals").count).toBe(1);
    expect(failures).toContain("A: at stake before expected 30000, got 29999");
  });

  it("a wrong waiting line changes the question decision", () => {
    const { metrics, failures } = run(tweak((fs, caseId) => caseId !== "case_A-clean" ? fs
      : fs.map((f) => (f.lineNo === 2 ? { ...f, status: "needs_review", ruleId: "R6_NO_EVIDENCE", expectedCents: undefined } : f))));
    expect(metric(metrics, "Question decision")).toMatchObject({ count: 10, total: 11 });
    expect(failures).toContain("A-clean: question expected none, engine leaves lines [2] askable");
  });

  it("an engine that throws is reported, not crashed on", () => {
    const { metrics, failures } = run(() => { throw new Error("boom"); }, SCENARIOS.slice(0, 1));
    expect(failures).toContain("A before: reconcile threw: boom");
    expect(metric(metrics, "Finding status accuracy")).toMatchObject({ count: 0, total: 16 });
    expect(allPass(metrics)).toBe(false);
  });

  it("feeds reply facts in cumulatively and passes the prior revision", () => {
    const seen: { revision: number; facts: number; prior: number | undefined }[] = [];
    const a = SCENARIOS.find((s) => s.id === "A")!;
    runScenario(a, (input) => {
      seen.push({ revision: input.case.revision, facts: input.facts.length, prior: input.prior?.length });
      return oracle(input);
    });
    expect(seen).toEqual([
      { revision: 0, facts: a.extracted.facts.length, prior: undefined },
      { revision: 1, facts: a.extracted.facts.length + 2, prior: 8 },
    ]);
  });
});

describe("eval helpers", () => {
  it("caseTotals follows SPEC.md section 6 (dismissed lines leave At stake)", () => {
    const a = SCENARIOS.find((s) => s.id === "A")!;
    const before = a.key.expected.findings.map((f) => toFinding("case_A", 0, f));
    expect(caseTotals(before)).toEqual({ billed: 750000, agreed: 660000, atStake: 30000, waiting: 60000 });
    const dismissed = before.map((f) => (f.lineNo === 1 ? { ...f, userVerdict: "false_positive" as const } : f));
    expect(caseTotals(dismissed).atStake).toBe(0);
  });

  it("chargeExtraction matches lineNo, chargeType, amount and currency", () => {
    const a = SCENARIOS.find((s) => s.id === "A")!;
    const cny = SCENARIOS.find((s) => s.id === "A-cny")!;
    const failures: string[] = [];
    expect(chargeExtraction([{ scenario: a, charges: a.extracted.charges }, { scenario: cny, charges: cny.extracted.charges }], failures))
      .toMatchObject({ count: 16, total: 16 });
    const wrong = a.extracted.charges.map((c) => (c.lineNo === 3 ? { ...c, amountCents: 65001 } : c)).slice(0, 7);
    expect(chargeExtraction([{ scenario: a, charges: wrong }], failures)).toMatchObject({ count: 6, total: 8 });
    const usdForCny = cny.extracted.charges.map((c) => ({ ...c, currency: "USD" }));
    expect(chargeExtraction([{ scenario: cny, charges: usdForCny }], failures)).toMatchObject({ count: 7, total: 8 });
  });

  it("formatTable prints every metric with its denominator and status", () => {
    const table = formatTable([
      { name: "Finding status accuracy", count: 9, total: 10, goal: "all" },
      { name: "False positives on legitimate lines", count: 0, total: 40, goal: "zero" },
      { name: "Empty", count: 0, total: 0, goal: "all" },
    ]);
    expect(table).toContain("| Finding status accuracy | 9 / 10 | 90.0% | FAIL |");
    expect(table).toContain("| False positives on legitimate lines | 0 / 40 | 0.0% | ok |");
    expect(table).toContain("| Empty | 0 / 0 | n/a | ok |");
  });
});
