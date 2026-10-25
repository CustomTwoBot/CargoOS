/// <reference types="vite/client" />
// resetLiveDemo for Bayline's October bill (fixtures/baylineOct/): its own reset, next to Scenario A.
// Only the Claude API is mocked; it has no recording for this case, so planQuestion logs a failure.
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import octKey from "../fixtures/baylineOct/scenario.json";
import { api } from "./_generated/api";
import schema from "./schema";
import { BAYLINE_OCT_REF, SCENARIO_A_REF } from "./seed";

vi.mock("@anthropic-ai/sdk", async () => {
  const recordings = await Promise.all([import("../tests/recordings/planQuestion-A.json")]);
  const bySystem = new Map<string, { stopReason: string | null; text: string }>(
    recordings.map((r) => [r.default.calls[0].request.system, r.default.calls[0].reply]),
  );
  class APIError extends Error { status?: number }
  class Anthropic {
    static APIError = APIError;
    beta = {
      messages: {
        create: async ({ system }: { system: string }) => {
          const reply = bySystem.get(system);
          if (!reply) throw new Error("No recording for this prompt");
          return { stop_reason: reply.stopReason, content: [{ type: "text", text: reply.text }] };
        },
      },
    };
  }
  return { default: Anthropic };
});

const modules = import.meta.glob("./**/*.ts");

beforeEach(() => {
  vi.stubEnv("ANTHROPIC_API_KEY", "test-key-not-used"); // the SDK is mocked; nothing reaches the network
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-25T17:30:00Z"));
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

type T = ReturnType<typeof convexTest>;
const reset = (t: T, shipmentRef?: string) =>
  t.mutation(api.seed.resetLiveDemo, shipmentRef ? { personId: "maya", shipmentRef } : { personId: "maya" });
const statusOf = (findings: { lineNo: number; status: string }[]) => findings.map((f) => [f.lineNo, f.status]);

describe("resetLiveDemo for the October bill", () => {
  it("seeds the quote and invoice, then checks them: $100 at stake, lines 4 and 5 waiting", async () => {
    const t = convexTest(schema, modules);
    expect(BAYLINE_OCT_REF).toBe(octKey.case.shipmentRef);
    const caseId = await reset(t, BAYLINE_OCT_REF);
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const view = (await t.query(api.cases.getCaseView, { caseId }))!;
    expect(view.case).toMatchObject({ shipmentRef: "PCL-INV-1103", forwarder: "Pacific Crest Logistics", revision: 1 });
    expect(view.documents.map((d) => [d.title, d.readStatus])).toEqual([["Quote Q-PCL-1001", "read"], ["Invoice PCL-INV-1103", "read"]]);
    expect(statusOf(view.findings)).toEqual([
      [1, "supported"], [2, "supported"], [3, "supported"], [4, "needs_review"],
      [5, "needs_review"], [6, "potential_discrepancy"], [7, "supported"], [8, "supported"],
    ]);
    expect([view.totals.billed, view.totals.atStake, view.totals.waiting]).toEqual([725000, 10000, 55000]);
    expect(await t.query(api.cases.getDemoCase, { shipmentRef: BAYLINE_OCT_REF })).toBe(caseId);
  });

  it("resets only itself: Scenario A keeps its case and its progress", async () => {
    const t = convexTest(schema, modules);
    const a = await reset(t);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const first = await reset(t, BAYLINE_OCT_REF);
    const second = await reset(t, BAYLINE_OCT_REF);
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(second).not.toBe(first);
    expect(await t.query(api.cases.getDemoCase, {})).toBe(a);
    expect(await t.query(api.cases.getDemoCase, { shipmentRef: SCENARIO_A_REF })).toBe(a);
    const refs = await t.run(async (ctx) => (await ctx.db.query("cases").collect()).map((c) => c.shipmentRef).sort());
    expect(refs).toEqual(["PCL-INV-1012", "PCL-INV-1103"]);
    expect((await t.query(api.cases.getCaseView, { caseId: a }))!.case.revision).toBe(1);
  });

  it("refuses any case that isn't a demo bill", async () => {
    const t = convexTest(schema, modules);
    await expect(reset(t, "CASE-ABC123")).rejects.toThrow("Only the demo bills can be reset");
  });

  it("drops a rule learned on the old bill, so the fresh one starts with the same lines waiting", async () => {
    const t = convexTest(schema, modules);
    const old = await reset(t, BAYLINE_OCT_REF);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const congestion = await t.run(async (ctx) =>
      (await ctx.db.query("charges").withIndex("by_case", (q) => q.eq("caseId", old)).collect()).find((c) => c.lineNo === 4)!);
    await t.mutation(api.pipeline.dismissFinding, { role: "clerk", personId: "maya", caseId: old, key: congestion._id });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(await t.run((ctx) => ctx.db.query("learnedRules").collect())).toHaveLength(1);

    const fresh = await reset(t, BAYLINE_OCT_REF);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(await t.run((ctx) => ctx.db.query("learnedRules").collect())).toEqual([]);
    const view = (await t.query(api.cases.getCaseView, { caseId: fresh }))!;
    expect(view.findings.find((f) => f.lineNo === 4)).toMatchObject({ status: "needs_review", ruleId: "R6_NO_EVIDENCE" });
  });
});
