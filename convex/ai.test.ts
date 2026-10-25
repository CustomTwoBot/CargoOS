/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

// No API key: every Claude call fails fast without touching the network.
beforeEach(() => {
  vi.stubEnv("ANTHROPIC_API_KEY", "");
  vi.useFakeTimers();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

type Line = { lineNo: number; status: "supported" | "needs_review" | "potential_discrepancy"; ruleId: "R0_MATCH" | "R6_NO_EVIDENCE" | "R2_RATE_MISMATCH"; deltaCents?: number };
const A_BEFORE: Line[] = [
  { lineNo: 1, status: "potential_discrepancy", ruleId: "R2_RATE_MISMATCH", deltaCents: 30000 },
  { lineNo: 4, status: "needs_review", ruleId: "R6_NO_EVIDENCE" },
  { lineNo: 6, status: "needs_review", ruleId: "R6_NO_EVIDENCE" },
];

// Seeds Scenario A and writes findings the way the pipeline would (it doesn't exist yet).
async function setup(lines: Line[] = A_BEFORE) {
  const t = convexTest(schema, modules);
  const caseId = await t.mutation(api.seed.resetDemo, {});
  await t.run(async (ctx) => {
    const charges = await ctx.db.query("charges").withIndex("by_case", (q) => q.eq("caseId", caseId)).collect();
    for (const l of lines) {
      const c = charges.find((x) => x.lineNo === l.lineNo)!;
      await ctx.db.insert("findings", {
        key: c._id, caseId, chargeId: c._id, lineNo: l.lineNo, revision: 0, status: l.status, ruleId: l.ruleId,
        billedCents: c.amountCents, deltaCents: l.deltaCents, factIds: [], evidence: [], explanation: "",
      });
    }
  });
  return { t, caseId };
}

type Test = Awaited<ReturnType<typeof setup>>["t"];

const events = (t: Test, caseId: Id<"cases">) => t.run(async (ctx) =>
  (await ctx.db.query("events").withIndex("by_case_at", (q) => q.eq("caseId", caseId)).collect()).filter((e) => e.type !== "doc_added"));

async function askQuestion(t: Test, caseId: Id<"cases">) {
  const keys = await t.run(async (ctx) => (await ctx.db.query("findings").collect()).filter((f) => f.status === "needs_review").map((f) => f.key));
  return (await t.mutation(internal.ai.saveQuestion, { caseId, question: { to: "ops_lead", findingKeys: keys, text: "Did anyone agree to lines 4 and 6?", citations: [] } }))!;
}

describe("planQuestion action", () => {
  it("on a Claude failure writes extraction_failed and changes nothing else", async () => {
    const { t, caseId } = await setup();
    await t.action(internal.ai.planQuestion, { caseId });
    const evs = await events(t, caseId);
    expect(evs.map((e) => [e.type, e.payload.stage])).toEqual([["extraction_failed", "planQuestion"]]);
    expect(evs[0].payload.error).toContain("ANTHROPIC_API_KEY");
    expect(await t.run((ctx) => ctx.db.query("questions").collect())).toEqual([]);
    expect((await t.run((ctx) => ctx.db.get(caseId)))!.status).toBe("open");
  });

  it("does nothing (and never calls Claude) when no line can be asked about", async () => {
    const { t, caseId } = await setup([{ lineNo: 1, status: "potential_discrepancy", ruleId: "R2_RATE_MISMATCH", deltaCents: 30000 }]);
    await t.action(internal.ai.planQuestion, { caseId });
    expect(await events(t, caseId)).toEqual([]);
  });

  it("saveQuestion writes question_asked, sets awaiting_answer, and never opens a second question for a line", async () => {
    const { t, caseId } = await setup();
    const questionId = await askQuestion(t, caseId);
    expect(await askQuestion(t, caseId)).toBeNull();
    expect((await events(t, caseId)).map((e) => e.type)).toEqual(["question_asked"]);
    expect(await t.run((ctx) => ctx.db.get(questionId))).toMatchObject({ status: "open", to: "ops_lead" });
    expect((await t.run((ctx) => ctx.db.get(caseId)))!.status).toBe("awaiting_answer");
  });
});

describe("submitReply + interpretReply action", () => {
  it("only the person asked can reply", async () => {
    const { t, caseId } = await setup();
    const questionId = await askQuestion(t, caseId);
    await expect(t.mutation(api.ai.submitReply, { role: "clerk", questionId, text: "yes" })).rejects.toThrow("Only the ops lead");
  });

  it("saves the reply, then on a Claude failure logs it and leaves the question open with no new facts", async () => {
    const { t, caseId } = await setup();
    const questionId = await askQuestion(t, caseId);
    const factsBefore = (await t.run((ctx) => ctx.db.query("facts").collect())).length;
    const docId = await t.mutation(api.ai.submitReply, { role: "ops_lead", questionId, text: "approved the $200 congestion fee on WhatsApp, nobody agreed to $400 rush handling" });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(await t.run((ctx) => ctx.db.get(docId))).toMatchObject({ type: "reply", sender: "ops_lead" });
    expect((await events(t, caseId)).map((e) => [e.type, e.payload.stage])).toEqual([
      ["question_asked", undefined], ["reply_received", undefined], ["extraction_failed", "interpretReply"],
    ]);
    expect(await t.run((ctx) => ctx.db.get(questionId))).toMatchObject({ status: "open" });
    expect((await t.run((ctx) => ctx.db.query("facts").collect())).length).toBe(factsBefore);
  });

  it("applyReply saves facts and the reply, answers the question, and opens at most one follow-up", async () => {
    const { t, caseId } = await setup();
    const questionId = await askQuestion(t, caseId);
    const docId = await t.mutation(api.ai.submitReply, { role: "ops_lead", questionId, text: "I think we discussed something?" });
    const replyId = await t.mutation(internal.ai.applyReply, {
      questionId, docId, interpretation: "ambiguous", facts: [], questionStatus: "answered", dropped: [],
      followUp: { to: "ops_lead", findingKeys: ["a"], text: "Yes or no?", citations: [], followupOf: questionId },
    });
    const questions = await t.run((ctx) => ctx.db.query("questions").collect());
    expect(questions.map((q) => [q.status, q.followupOf])).toEqual([["answered", undefined], ["open", questionId]]);
    expect(await t.run((ctx) => ctx.db.get(replyId!))).toMatchObject({ interpretation: "ambiguous", factIds: [] });
    expect((await events(t, caseId)).map((e) => e.type)).toEqual(["question_asked", "reply_received", "facts_extracted", "question_asked"]);

    const docId2 = await t.mutation(api.ai.submitReply, { role: "ops_lead", questionId: questions[1]._id, text: "no, nobody agreed to either" });
    await t.mutation(internal.ai.applyReply, {
      questionId: questions[1]._id, docId: docId2, interpretation: "no", questionStatus: "answered", dropped: [],
      facts: [{ kind: "rejection", chargeType: "handling", effectiveAt: "2026-10-24T14:05:00-07:00", statedBy: "ops_lead", origin: "reply", span: { docId: docId2, locator: "reply", quote: "nobody agreed to either" } }],
    });
    expect((await t.run((ctx) => ctx.db.query("facts").collect())).filter((f) => f.origin === "reply")).toHaveLength(1);
    expect((await t.run((ctx) => ctx.db.get(caseId)))!.status).toBe("open");
  });
});

describe("createDraft + draftDispute action", () => {
  it("the ops lead cannot draft, and there must be something at stake", async () => {
    const { t, caseId } = await setup();
    await expect(t.mutation(api.ai.createDraft, { role: "ops_lead", caseId })).rejects.toThrow("cannot draft");
    const clean = await setup([{ lineNo: 3, status: "supported", ruleId: "R0_MATCH" }]);
    await expect(clean.t.mutation(api.ai.createDraft, { role: "clerk", caseId: clean.caseId })).rejects.toThrow("nothing to dispute");
  });

  it("on a Claude failure logs extraction_failed and writes no draft", async () => {
    const { t, caseId } = await setup();
    await t.mutation(api.ai.createDraft, { role: "clerk", caseId });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect((await events(t, caseId)).map((e) => [e.type, e.payload.stage])).toEqual([["extraction_failed", "draftDispute"]]);
    expect(await t.run((ctx) => ctx.db.query("drafts").collect())).toEqual([]);
  });

  it("saveDraft stores a draft only (nothing is sent) and writes draft_created", async () => {
    const { t, caseId } = await setup();
    const draftId = await t.mutation(internal.ai.saveDraft, {
      caseId, createdBy: "clerk", subject: "s", body: "b", findingKeys: ["k"], totalDisputedCents: 70000,
    });
    expect(await t.run((ctx) => ctx.db.get(draftId))).toMatchObject({ status: "draft", to: "forwarder", createdBy: "clerk" });
    expect((await events(t, caseId)).map((e) => [e.type, e.actor])).toEqual([["draft_created", "clerk"]]);
  });
});
