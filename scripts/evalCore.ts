// Eval comparison and metrics (SPEC.md 7.5). Pure apart from loadScenarios, which reads fixtures.
// The engine is passed in, so this file is tested with a fake reconcile (tests/eval.test.ts).
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  AnswerKeySchema, FactsFixtureSchema, ReplyFixtureSchema,
  type AnswerKey, type ExpectedFinding, type FactsFixture, type ReplyFixture,
} from "../fixtures/answerKey";
import type { Case, Charge, Fact, Finding, SourceSpan, Status } from "../lib/types";

// SPEC.md 5.3 signature.
export type Reconcile = (input: { case: Case; facts: Fact[]; charges: Charge[]; prior?: Finding[] }) => Finding[];

export interface Scenario {
  id: string;
  key: AnswerKey;
  extracted: FactsFixture;
  replies: ReplyFixture[];
}

export interface Inputs {
  facts: Fact[];
  charges: Charge[];
}

interface Revision {
  label: string;
  expected: ExpectedFinding[];
  actual: Finding[] | null; // null when reconcile threw
}

export interface ScenarioRun {
  scenario: Scenario;
  inputs: Inputs;
  revisions: Revision[]; // [before, after reply 1, after reply 2, ...]
  failures: string[];
}

export interface Metric {
  name: string;
  count: number; // correct items, or for "zero" metrics the number of bad items
  total: number;
  goal: "all" | "zero";
}

const DISPUTED = new Set<Status>(["potential_discrepancy", "invoice_noncompliance"]);
const CLEARED = new Set<Status>(["supported", "outside_quote_scope"]);
const ASKABLE_RULES = new Set(["R3_MATH_CURRENCY", "R6_NO_EVIDENCE", "R7_CONFLICT"]);

// ---- Loading ----

export function loadScenarios(fixturesDir: string): Scenario[] {
  const read = (path: string): unknown => JSON.parse(readFileSync(path, "utf8"));
  const scenarios: Scenario[] = [{
    id: "A",
    key: AnswerKeySchema.parse(read(join(fixturesDir, "scenarioA.json"))),
    extracted: FactsFixtureSchema.parse(read(join(fixturesDir, "scenarioA.facts.json"))),
    replies: [ReplyFixtureSchema.parse(read(join(fixturesDir, "scenarioA.reply.facts.json")))],
  }];
  const variationsDir = join(fixturesDir, "variations");
  for (const id of readdirSync(variationsDir).sort()) {
    const dir = join(variationsDir, id);
    const replyFiles = readdirSync(dir).filter((f) => /^reply\d*\.facts\.json$/.test(f))
      .sort((a, b) => a.length - b.length || a.localeCompare(b));
    scenarios.push({
      id,
      key: AnswerKeySchema.parse(read(join(dir, "scenario.json"))),
      extracted: FactsFixtureSchema.parse(read(join(dir, "facts.json"))),
      replies: replyFiles.map((f) => ReplyFixtureSchema.parse(read(join(dir, f)))),
    });
  }
  return scenarios;
}

// ---- Running ----

// Runs the engine before any reply, then once per reply with that reply's facts added.
export function runScenario(scenario: Scenario, reconcile: Reconcile, inputs?: Inputs): ScenarioRun {
  const used = inputs ?? { facts: scenario.extracted.facts, charges: scenario.extracted.charges };
  const failures: string[] = [];
  const expected = [scenario.key.expected.findings, ...scenario.key.expected.replies.map((r) => r.findingsAfter)];
  const revisions: Revision[] = [];
  let facts = used.facts;
  let prior: Finding[] | undefined;

  for (let i = 0; i < expected.length; i++) {
    if (i > 0) facts = [...facts, ...(scenario.replies[i - 1]?.facts ?? [])];
    const label = i === 0 ? "before" : `after reply ${i}`;
    let actual: Finding[] | null = null;
    try {
      actual = reconcile({ case: { ...scenario.extracted.case, revision: i }, facts, charges: used.charges, prior });
    } catch (e) {
      failures.push(`${scenario.id} ${label}: reconcile threw: ${e instanceof Error ? e.message : String(e)}`);
    }
    revisions.push({ label, expected: expected[i], actual });
    prior = actual ?? undefined;
  }
  return { scenario, inputs: used, revisions, failures };
}

// ---- Totals (SPEC.md section 6) ----

export function caseTotals(findings: Pick<Finding, "status" | "billedCents" | "expectedCents" | "deltaCents" | "userVerdict">[]) {
  let billed = 0, agreed = 0, atStake = 0, waiting = 0;
  for (const f of findings) {
    billed += f.billedCents;
    if (f.status === "needs_review") waiting += f.billedCents;
    else if (CLEARED.has(f.status)) agreed += f.billedCents;
    else agreed += f.expectedCents ?? 0;
    if (DISPUTED.has(f.status) && f.userVerdict !== "false_positive") atStake += f.deltaCents ?? 0;
  }
  return { billed, agreed, atStake, waiting };
}

// ---- Metrics ----

const normalize = (s: string) => s.replace(/\s+/g, " ").trim();
const findLine = (fs: Finding[] | null, lineNo: number) => fs?.find((f) => f.lineNo === lineNo);

function findingStatus(runs: ScenarioRun[], failures: string[]): Metric {
  let count = 0, total = 0;
  for (const run of runs) {
    for (const rev of run.revisions) {
      for (const exp of rev.expected) {
        total++;
        const got = findLine(rev.actual, exp.lineNo);
        if (got && got.status === exp.status && got.ruleId === exp.ruleId) count++;
        else if (rev.actual) {
          failures.push(`${run.scenario.id} ${rev.label} line ${exp.lineNo}: expected ${exp.status}/${exp.ruleId}, got ${got ? `${got.status}/${got.ruleId}` : "no finding"}`);
        }
      }
    }
  }
  return { name: "Finding status accuracy", count, total, goal: "all" };
}

// Legitimate = any line the answer key does not put in To dispute.
function falsePositives(runs: ScenarioRun[], failures: string[]): Metric {
  let count = 0, total = 0;
  for (const run of runs) {
    for (const rev of run.revisions) {
      if (!rev.actual) continue;
      for (const exp of rev.expected.filter((f) => !DISPUTED.has(f.status))) {
        total++;
        const got = findLine(rev.actual, exp.lineNo);
        if (got && DISPUTED.has(got.status)) {
          count++;
          failures.push(`${run.scenario.id} ${rev.label} line ${exp.lineNo}: legitimate line put in To dispute (${got.ruleId})`);
        }
      }
    }
  }
  return { name: "False positives on legitimate lines", count, total, goal: "zero" };
}

// Engine-side check of the question decision: the askable waiting lines (R3, R6, R7) must be
// non-empty exactly when a question is expected, and must equal the lines it covers.
function questionDecision(runs: ScenarioRun[], failures: string[]): Metric {
  let count = 0;
  for (const run of runs) {
    const before = run.revisions[0].actual;
    const q = run.scenario.key.expected.question;
    const askable = (before ?? [])
      .filter((f) => f.status === "needs_review" && ASKABLE_RULES.has(f.ruleId))
      .map((f) => f.lineNo).sort((a, b) => a - b);
    const ok = before !== null && (q.shouldAsk ? JSON.stringify(askable) === JSON.stringify(q.coversLines) : askable.length === 0);
    if (ok) count++;
    else if (before) failures.push(`${run.scenario.id}: question expected ${q.shouldAsk ? `lines ${q.coversLines.join(", ")}` : "none"}, engine leaves lines [${askable.join(", ")}] askable`);
  }
  return { name: "Question decision", count, total: runs.length, goal: "all" };
}

function revisionCorrectness(runs: ScenarioRun[], failures: string[]): Metric {
  let count = 0, total = 0;
  for (const run of runs) {
    for (let i = 1; i < run.revisions.length; i++) {
      const prev = run.revisions[i - 1], next = run.revisions[i];
      for (const exp of next.expected) {
        const was = prev.expected.find((f) => f.lineNo === exp.lineNo);
        if (!was || was.status === exp.status) continue;
        total++;
        const gotPrev = findLine(prev.actual, exp.lineNo), gotNext = findLine(next.actual, exp.lineNo);
        if (gotPrev?.status === was.status && gotNext?.status === exp.status) count++;
        else failures.push(`${run.scenario.id} ${next.label} line ${exp.lineNo}: expected ${was.status} -> ${exp.status}, got ${gotPrev?.status ?? "none"} -> ${gotNext?.status ?? "none"}`);
      }
    }
  }
  return { name: "Revision correctness", count, total, goal: "all" };
}

// Input spans (facts, charges, reply facts) plus every evidence span the engine returns.
export function sourceValidity(runs: ScenarioRun[], failures: string[]): Metric {
  let count = 0, total = 0;
  for (const run of runs) {
    const docs = new Map([...run.scenario.extracted.documents, ...run.scenario.replies.map((r) => r.replyDoc)].map((d) => [d._id, d.text]));
    const spans: SourceSpan[] = [
      ...run.inputs.facts.map((f) => f.span),
      ...run.inputs.charges.map((c) => c.span),
      ...run.scenario.replies.flatMap((r) => r.facts.map((f) => f.span)),
      ...run.revisions.flatMap((r) => (r.actual ?? []).flatMap((f) => f.evidence)),
    ];
    for (const span of spans) {
      total++;
      const text = docs.get(span.docId);
      if (text !== undefined && normalize(text).includes(normalize(span.quote))) count++;
      else failures.push(`${run.scenario.id}: span "${span.quote}" is not in ${span.docId}`);
    }
  }
  return { name: "Source validity", count, total, goal: "all" };
}

function totalsMetric(runs: ScenarioRun[], failures: string[]): Metric {
  let count = 0, total = 0;
  for (const run of runs) {
    const t = run.scenario.key.expected.totals;
    const final = run.revisions.length > 1 ? run.revisions[run.revisions.length - 1] : null;
    const checks: [string, Finding[] | null, keyof ReturnType<typeof caseTotals>, number | undefined][] = [
      ["billed before", run.revisions[0].actual, "billed", t.billedCents],
      ["agreed before", run.revisions[0].actual, "agreed", t.agreedBeforeCents],
      ["at stake before", run.revisions[0].actual, "atStake", t.atStakeBeforeCents],
      ["waiting before", run.revisions[0].actual, "waiting", t.waitingBeforeCents],
    ];
    if (final) {
      checks.push(
        ["billed after", final.actual, "billed", t.billedCents],
        ["agreed after", final.actual, "agreed", t.agreedAfterCents],
        ["at stake after", final.actual, "atStake", t.atStakeAfterCents],
        ["waiting after", final.actual, "waiting", t.waitingAfterCents],
      );
    }
    for (const [label, findings, field, want] of checks) {
      if (want === undefined) continue;
      total++;
      const got = findings ? caseTotals(findings)[field] : undefined;
      if (got === want) count++;
      else if (findings) failures.push(`${run.scenario.id}: ${label} expected ${want}, got ${got}`);
    }
  }
  return { name: "Totals", count, total, goal: "all" };
}

// Full mode only: extracted charges against the answer key.
export function chargeExtraction(scenarios: { scenario: Scenario; charges: Charge[] }[], failures: string[]): Metric {
  let count = 0, total = 0;
  for (const { scenario, charges } of scenarios) {
    for (const exp of scenario.key.expected.charges) {
      total++;
      const got = charges.find((c) => c.lineNo === exp.lineNo);
      const ok = got && got.chargeType === exp.chargeType && got.amountCents === exp.amountCents
        && got.currency === (exp.currency ?? "USD");
      if (ok) count++;
      else failures.push(`${scenario.id} line ${exp.lineNo}: expected ${exp.chargeType} ${exp.amountCents}, got ${got ? `${got.chargeType} ${got.amountCents} ${got.currency}` : "nothing"}`);
    }
  }
  return { name: "Charge extraction", count, total, goal: "all" };
}

export function engineMetrics(runs: ScenarioRun[]): { metrics: Metric[]; failures: string[] } {
  const failures = runs.flatMap((r) => r.failures);
  const metrics = [
    findingStatus(runs, failures),
    falsePositives(runs, failures),
    questionDecision(runs, failures),
    revisionCorrectness(runs, failures),
    sourceValidity(runs, failures),
    totalsMetric(runs, failures),
  ];
  return { metrics, failures };
}

export const passes = (m: Metric) => (m.goal === "zero" ? m.count === 0 : m.count === m.total);
export const allPass = (metrics: Metric[]) => metrics.every(passes);

export function formatTable(metrics: Metric[]): string {
  const rows = metrics.map((m) => {
    const rate = m.total === 0 ? "n/a" : `${((m.count / m.total) * 100).toFixed(1)}%`;
    return `| ${m.name} | ${m.count} / ${m.total} | ${rate} | ${passes(m) ? "ok" : "FAIL"} |`;
  });
  return ["| Metric | Result | Rate | Status |", "| --- | --- | --- | --- |", ...rows].join("\n");
}
