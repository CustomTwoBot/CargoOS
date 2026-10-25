/// <reference types="vite/client" />
// resetLiveDemo: the reset plus the first pipeline run (SPEC.md 10). Only the Claude API is mocked:
// planQuestion answers with the recorded question in tests/recordings/, as in cases.test.ts.
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

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
  vi.setSystemTime(new Date("2026-10-24T21:05:00Z"));
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

const statusOf = (findings: { lineNo: number; status: string }[], lineNo: number) =>
  findings.find((f) => f.lineNo === lineNo)!.status;

describe("resetLiveDemo", () => {
  it("revision 1 with $300 at stake, lines 4 and 6 waiting, and one question", async () => {
    const t = convexTest(schema, modules);
    const caseId = await t.mutation(api.seed.resetLiveDemo, {});
    await t.finishAllScheduledFunctions(vi.runAllTimers); // processChange -> planQuestion (recorded question)

    const view = (await t.query(api.cases.getCaseView, { caseId }))!;
    expect(view.case).toMatchObject({ revision: 1, forwarder: "Pacific Crest Logistics" });
    expect(view.findings.every((f) => f.revision === 1)).toBe(true);
    expect(view.totals.atStake).toBe(30000);
    expect([statusOf(view.findings, 4), statusOf(view.findings, 6)]).toEqual(["needs_review", "needs_review"]);
    expect(view.questions).toHaveLength(1);
  });

  it("a run scheduled before a second reset does nothing; the new case is recomputed once", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.seed.resetLiveDemo, {});
    const caseId = await t.mutation(api.seed.resetLiveDemo, { personId: "sam" });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const all = await t.run((ctx) => ctx.db.query("events").collect());
    expect(all.filter((e) => e.type === "recomputed").map((e) => [e.caseId, e.payload.revision])).toEqual([[caseId, 1]]);
  });
});
