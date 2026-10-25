/// <reference types="vite/client" />
// Extraction and replies wired to the pipeline (SPEC.md 4, W4 step 5): new facts -> processChange ->
// planQuestion. Only the Claude API is mocked: it answers with the recorded replies in tests/recordings/.
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import replyFixture from "../fixtures/scenarioA.reply.facts.json";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import schema from "./schema";

// Answers each request with the recording whose system prompt matches. The requests themselves differ
// from the recorded ones (Convex ids instead of fixture ids), so only the replies are reused.
vi.mock("@anthropic-ai/sdk", async () => {
  const recordings = await Promise.all([
    import("../tests/recordings/interpretReply-A.json"),
    import("../tests/recordings/planQuestion-A.json"),
    import("../tests/recordings/extract-live-chat.json"),
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
  const caseId = await t.mutation(api.seed.resetDemo, {});
  return { t, caseId };
}

type T = Awaited<ReturnType<typeof setup>>["t"];

const drain = (t: T) => t.finishAllScheduledFunctions(vi.runAllTimers);

const latest = (t: T, caseId: Id<"cases">) => t.run(async (ctx) => {
  const c = (await ctx.db.get(caseId))!;
  const rows = await ctx.db.query("findings").withIndex("by_case_rev", (q) => q.eq("caseId", caseId).eq("revision", c.revision)).collect();
  return { revision: c.revision, findings: rows.sort((a, b) => a.lineNo - b.lineNo) };
});

const AT_STAKE = new Set<Doc<"findings">["status"]>(["potential_discrepancy", "invoice_noncompliance"]);
const atStake = (findings: Doc<"findings">[]) =>
  findings.filter((f) => AT_STAKE.has(f.status)).reduce((sum, f) => sum + (f.deltaCents ?? 0), 0);
const statusOf = (findings: Doc<"findings">[], lineNo: number) => findings.find((f) => f.lineNo === lineNo)!.status;

const events = (t: T, caseId: Id<"cases">) =>
  t.run((ctx) => ctx.db.query("events").withIndex("by_case_at", (q) => q.eq("caseId", caseId)).collect());
const questions = (t: T) => t.run((ctx) => ctx.db.query("questions").collect());

const CHAT_TEXT = [
  "9/8/26, 9:12 AM - Derek PCL: Booking confirmed for your 40HC, booked today Sep 8",
  "9/8/26, 9:15 AM - Sam Bayline: great thanks",
  "9/28/26, 10:02 AM - Derek PCL: heads up, possible congestion at LB terminal, may be extra",
  "9/28/26, 10:30 AM - Sam Bayline: ok keep me posted",
].join("\n");

const addChat = (t: T, caseId: Id<"cases">) => t.run((ctx) => ctx.db.insert("documents", {
  caseId, type: "chat", title: "whatsapp.txt", textFrom: "paste", readStatus: "reading", text: CHAT_TEXT,
}));

describe("the reply moment, end to end", () => {
  it("$300 at stake with lines 4 and 6 waiting; the canonical reply recomputes to $700 in a new revision with 2 changes", async () => {
    const { t, caseId } = await setup();
    await t.mutation(internal.pipeline.processChange, { caseId });
    await drain(t); // planQuestion asks (recorded question)

    const before = await latest(t, caseId);
    expect(before.revision).toBe(1);
    expect(atStake(before.findings)).toBe(30000);
    expect([statusOf(before.findings, 4), statusOf(before.findings, 6)]).toEqual(["needs_review", "needs_review"]);
    const [question] = await questions(t);
    expect(question).toMatchObject({ status: "open", to: "ops_lead" });
    expect(question.findingKeys.sort()).toEqual([before.findings[3].key, before.findings[5].key].sort());

    await t.mutation(api.ai.submitReply, { role: "ops_lead", personId: "sam", questionId: question._id, text: replyFixture.replyDoc.text });
    await drain(t); // interpretReply (recorded) -> applyReply -> processChange

    const after = await latest(t, caseId);
    expect(after.revision).toBe(2);
    expect(statusOf(after.findings, 4)).toBe("supported");
    expect(statusOf(after.findings, 6)).toBe("potential_discrepancy");
    expect(atStake(after.findings)).toBe(70000);

    const all = await events(t, caseId);
    const factsEvent = all.filter((e) => e.type === "facts_extracted").at(-1)!;
    const recomputed = all.filter((e) => e.type === "recomputed").at(-1)!;
    expect(recomputed.payload).toMatchObject({ revision: 2, causedByEventId: factsEvent._id });
    expect((recomputed.payload.changes as { lineNo: number }[]).map((c) => c.lineNo)).toEqual([4, 6]);
    expect(await t.run((ctx) => ctx.db.get(question._id))).toMatchObject({ status: "answered" });
    // Nothing waits any more, so no new question.
    expect((await questions(t)).length).toBe(1);
    expect(all.some((e) => e.type === "extraction_failed")).toBe(false);
  });
});

describe("extraction triggers a recompute", () => {
  it("a newly read document runs processChange with its facts_extracted event as the cause", async () => {
    const { t, caseId } = await setup();
    await t.mutation(internal.pipeline.processChange, { caseId });
    const docId = await addChat(t, caseId);
    await t.action(internal.ai.extractAndStore, { caseId, docId });
    await drain(t);

    expect(await t.run((ctx) => ctx.db.get(docId))).toMatchObject({ readStatus: "read" });
    const all = await events(t, caseId);
    const extracted = all.find((e) => e.type === "facts_extracted" && e.payload.docId === docId)!;
    const recomputed = all.filter((e) => e.type === "recomputed");
    expect(recomputed.map((e) => e.payload.revision)).toEqual([1, 2]);
    expect(recomputed[1].payload.causedByEventId).toBe(extracted._id);
    expect((await latest(t, caseId)).revision).toBe(2);
  });

  it("documents read in parallel each recompute, but only one question is asked", async () => {
    const { t, caseId } = await setup();
    const docIds = [await addChat(t, caseId), await addChat(t, caseId)];
    await t.mutation(internal.ai.extractDocuments, { caseId, docIds });
    await drain(t);

    const all = await events(t, caseId);
    expect(all.filter((e) => e.type === "recomputed")).toHaveLength(2);
    expect(all.filter((e) => e.type === "question_asked")).toHaveLength(1);
    expect(await questions(t)).toHaveLength(1);
  });

  it("asks no question while another document is still being read", async () => {
    const { t, caseId } = await setup();
    await addChat(t, caseId); // still "reading", never extracted
    const docId = await addChat(t, caseId);
    await t.action(internal.ai.extractAndStore, { caseId, docId });
    await drain(t);

    expect((await events(t, caseId)).filter((e) => e.type === "recomputed")).toHaveLength(1);
    expect(await questions(t)).toEqual([]);
  });

  it("when the last document being read fails, the held-back question is asked", async () => {
    const { t, caseId } = await setup();
    const failing = await t.run((ctx) => ctx.db.insert("documents", {
      caseId, type: "chat", title: "blank.txt", textFrom: "paste", readStatus: "reading", text: "",
    }));
    const docId = await addChat(t, caseId);
    await t.action(internal.ai.extractAndStore, { caseId, docId });
    await drain(t);
    expect(await questions(t)).toEqual([]); // waiting on blank.txt

    await t.action(internal.ai.extractAndStore, { caseId, docId: failing });
    await drain(t);
    expect(await t.run((ctx) => ctx.db.get(failing))).toMatchObject({ readStatus: "not_read" });
    expect(await questions(t)).toHaveLength(1);
  });
});

describe("a follow-up question is not doubled by the recompute", () => {
  it("an ambiguous reply opens exactly one follow-up", async () => {
    const { t, caseId } = await setup();
    await t.mutation(internal.pipeline.processChange, { caseId });
    await drain(t);
    const [question] = await questions(t);
    // The reply saved directly, so only this applyReply (not a scheduled interpretReply) acts on it.
    const docId = await t.run((ctx) => ctx.db.insert("documents", {
      caseId, type: "reply", title: "Reply from ops lead", sender: "ops_lead", text: "not sure, let me check",
    }));
    await t.mutation(internal.ai.applyReply, {
      questionId: question._id, docId, interpretation: "ambiguous", facts: [], questionStatus: "answered", dropped: [],
      followUp: { to: "ops_lead", findingKeys: question.findingKeys, text: "Yes or no for each line?", citations: [], followupOf: question._id },
    });
    await drain(t);

    const qs = await questions(t);
    expect(qs.map((q) => q.status)).toEqual(["answered", "open"]);
    expect((await events(t, caseId)).filter((e) => e.type === "recomputed").map((e) => e.payload.revision)).toEqual([1, 2]);
  });
});
