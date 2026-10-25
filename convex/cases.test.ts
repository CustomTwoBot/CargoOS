/// <reference types="vite/client" />
// getCaseView / getDemoCase over the Scenario A reply moment (SPEC.md 10). Only the Claude API is mocked:
// it answers with the recorded replies in tests/recordings/, as in aiPipeline.test.ts.
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import replyFixture from "../fixtures/scenarioA.reply.facts.json";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

vi.mock("@anthropic-ai/sdk", async () => {
  const recordings = await Promise.all([
    import("../tests/recordings/interpretReply-A.json"),
    import("../tests/recordings/planQuestion-A.json"),
  ]);
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
  vi.setSystemTime(new Date("2026-10-24T21:05:00Z"));
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

async function setup() {
  const t = convexTest(schema, modules);
  const caseId: Id<"cases"> = await t.mutation(internal.seed.seedScenarioA, {});
  await t.mutation(internal.pipeline.processChange, { caseId });
  await t.finishAllScheduledFunctions(vi.runAllTimers); // planQuestion asks (recorded question)
  return { t, caseId };
}

const statusOf = (findings: { lineNo: number; status: string }[], lineNo: number) =>
  findings.find((f) => f.lineNo === lineNo)!.status;

describe("getCaseView", () => {
  it("after the first run: $300 at stake, lines 4 and 6 waiting, revision 1", async () => {
    const { t, caseId } = await setup();
    const view = (await t.query(api.cases.getCaseView, { caseId }))!;

    expect(view.case.revision).toBe(1);
    expect(view.findings.every((f) => f.revision === 1)).toBe(true);
    expect(view.totals.atStake).toBe(30000);
    expect([statusOf(view.findings, 4), statusOf(view.findings, 6)]).toEqual(["needs_review", "needs_review"]);
    const { billed, agreed, atStake, waiting, waived } = view.totals;
    expect(agreed + atStake + waiting + waived).toBe(billed);
    expect(view.questions).toHaveLength(1);
    expect(view.draft).toBeNull();
    const ats = view.events.map((e) => e.at);
    expect(ats).toEqual([...ats].sort());
  });

  it("after the canonical reply: $700 at stake, line 4 supported, line 6 disputed, revision 2, changes on 4 and 6", async () => {
    const { t, caseId } = await setup();
    const [question] = (await t.query(api.cases.getCaseView, { caseId }))!.questions;
    await t.mutation(api.ai.submitReply, { role: "ops_lead", personId: "sam", questionId: question._id, text: replyFixture.replyDoc.text });
    await t.finishAllScheduledFunctions(vi.runAllTimers); // interpretReply (recorded) -> applyReply -> processChange

    const view = (await t.query(api.cases.getCaseView, { caseId }))!;
    expect(view.case.revision).toBe(2);
    expect(view.findings.every((f) => f.revision === 2)).toBe(true);
    expect(view.totals.atStake).toBe(70000);
    expect(statusOf(view.findings, 4)).toBe("supported");
    expect(statusOf(view.findings, 6)).toBe("potential_discrepancy");
    expect(view.changes.map((c) => c.lineNo)).toEqual([4, 6]);
    expect(view.replies).toHaveLength(1);
  });

  it("returns null for a case that doesn't exist", async () => {
    const { t, caseId } = await setup();
    await t.run((ctx) => ctx.db.delete(caseId));
    expect(await t.query(api.cases.getCaseView, { caseId })).toBeNull();
  });
});

describe("getDemoCase", () => {
  it("returns the seeded Scenario A case id", async () => {
    const t = convexTest(schema, modules);
    expect(await t.query(api.cases.getDemoCase, {})).toBeNull();
    const caseId = await t.mutation(internal.seed.seedScenarioA, {});
    expect(await t.query(api.cases.getDemoCase, {})).toBe(caseId);
  });
});
