// Eval harness (SPEC.md 7.5).
//   npm run eval       engine-only: fixture facts -> reconcile() -> answer keys. Runs in CI; exits 1 if any metric misses.
//   npm run eval:full  real extraction through lib/ai, then the engine. Manual only (costs API calls);
//                      writes eval-results.md and never runs in CI.
// Modules owned by teammates are loaded only if they exist, so this stays green before they land.
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { CLAUDE_MODEL } from "../lib/ai/config";
import { NewChargeSchema, NewFactSchema } from "../lib/schemas";
import type { Charge, Fact } from "../lib/types";
import {
  allPass, chargeExtraction, engineMetrics, formatTable, loadScenarios, runScenario, sourceValidity,
  type Inputs, type Metric, type Reconcile, type Scenario, type ScenarioRun,
} from "./evalCore";

const ROOT = process.cwd();
const RECONCILE_PATH = join(ROOT, "lib", "engine", "reconcile.ts");
const EXTRACT_PATH = join(ROOT, "lib", "ai", "extract.ts");
const MAX_FAILURES_SHOWN = 40;

// Non-literal import paths, so typecheck passes before the module exists.
async function loadFunction<T>(path: string, name: string): Promise<T> {
  const mod: Record<string, unknown> = await import(pathToFileURL(path).href);
  const fn = mod[name];
  if (typeof fn !== "function") throw new Error(`${path} does not export a function named ${name}`);
  return fn as T;
}

function report(title: string, metrics: Metric[], failures: string[]): string {
  const lines = [title, "", formatTable(metrics)];
  if (failures.length > 0) {
    lines.push("", `Failures (${failures.length}):`, ...failures.slice(0, MAX_FAILURES_SHOWN).map((f) => `- ${f}`));
    if (failures.length > MAX_FAILURES_SHOWN) lines.push(`- ... and ${failures.length - MAX_FAILURES_SHOWN} more`);
  }
  return lines.join("\n");
}

async function engineOnly(): Promise<number> {
  if (!existsSync(RECONCILE_PATH)) {
    console.log("eval (engine-only): engine not implemented yet, skipping");
    return 0;
  }
  const reconcile = await loadFunction<Reconcile>(RECONCILE_PATH, "reconcile");
  const scenarios = loadScenarios(join(ROOT, "fixtures"));
  const { metrics, failures } = engineMetrics(scenarios.map((s) => runScenario(s, reconcile)));
  console.log(report(`eval (engine-only): ${scenarios.length} scenarios`, metrics, failures));
  return allPass(metrics) ? 0 : 1;
}

// SPEC.md 5.4 extraction output; charges may omit docId (code fills it in).
const ExtractionSchema = z.object({
  facts: z.array(NewFactSchema),
  charges: z.array(NewChargeSchema.extend({ docId: z.string().optional() })),
});
type ExtractDocument = (doc: Scenario["extracted"]["documents"][number]) => Promise<unknown>;

async function extractScenario(s: Scenario, extract: ExtractDocument, failures: string[]): Promise<Inputs> {
  const caseId = s.extracted.case._id;
  const facts: Fact[] = [];
  const charges: Charge[] = [];
  for (const doc of s.extracted.documents) {
    try {
      const out = ExtractionSchema.parse(await extract(doc));
      out.facts.forEach((f, i) => facts.push({ ...f, _id: `${doc._id}_fact_${i}`, caseId }));
      out.charges.forEach((c) => charges.push({ ...c, _id: `chg_${c.lineNo}`, caseId, docId: c.docId ?? doc._id }));
    } catch (e) {
      failures.push(`${s.id} ${doc._id}: extraction failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { facts, charges };
}

async function full(): Promise<number> {
  if (process.env.CI) {
    console.error("eval (full): refusing to run in CI; it calls the Claude API. Use `npm run eval` in CI.");
    return 1;
  }
  if (!existsSync(EXTRACT_PATH)) {
    console.log("eval (full): lib/ai/extract.ts not implemented yet, skipping");
    return 0;
  }
  const extract = await loadFunction<ExtractDocument>(EXTRACT_PATH, "extractDocument");
  const reconcile = existsSync(RECONCILE_PATH) ? await loadFunction<Reconcile>(RECONCILE_PATH, "reconcile") : null;
  const scenarios = loadScenarios(join(ROOT, "fixtures"));

  const failures: string[] = [];
  const extracted: { scenario: Scenario; inputs: Inputs }[] = [];
  for (const s of scenarios) {
    console.log(`extracting ${s.id}...`);
    extracted.push({ scenario: s, inputs: await extractScenario(s, extract, failures) });
  }

  const metrics: Metric[] = [chargeExtraction(extracted.map((e) => ({ scenario: e.scenario, charges: e.inputs.charges })), failures)];
  if (reconcile) {
    const result = engineMetrics(extracted.map((e) => runScenario(e.scenario, reconcile, e.inputs)));
    metrics.push(...result.metrics);
    failures.push(...result.failures);
  } else {
    // Without the engine, source validity can still be checked on the extracted spans.
    const runs: ScenarioRun[] = extracted.map((e) => ({ scenario: e.scenario, inputs: e.inputs, revisions: [], failures: [] }));
    metrics.push(sourceValidity(runs, failures));
  }

  const date = new Date().toISOString();
  const body = report(`eval (full): ${scenarios.length} scenarios`, metrics, failures);
  const notes = [
    "Notes:",
    "- Synthetic fixtures only (Scenario A + SPEC.md 7.4 variations), with answer keys we wrote.",
    "- Replies use the recorded reply facts from the fixtures, not live interpretReply.",
    "- Question decision is the engine's askable waiting lines (R3/R6/R7), not live planQuestion.",
    reconcile ? "" : "- Engine not implemented yet: only charge extraction and source validity were measured.",
  ].filter(Boolean);
  writeFileSync(join(ROOT, "eval-results.md"),
    [`# Eval results`, "", `- Date: ${date}`, `- Model: ${CLAUDE_MODEL}`, `- Mode: full`, "", body, "", ...notes, ""].join("\n"));
  console.log(body);
  console.log("\nSaved eval-results.md");
  // Full mode measures real extraction; it reports rather than gates.
  return 0;
}

const mode = process.argv.includes("--full") ? full : engineOnly;
mode().then((code) => process.exit(code), (e: unknown) => {
  console.error(e);
  process.exit(1);
});
