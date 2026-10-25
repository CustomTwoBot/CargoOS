/// <reference types="vite/client" />
// Dispute approval (SPEC.md 9 W4 step 13, 10 rule 5): maya requests, sam accepts or rejects; the gate is on
// the server. Runs on the real pipeline after the canonical reply ($700 at stake). Only the Claude API is
// mocked: it answers with the recorded replies in tests/recordings/, as in aiPipeline.test.ts.
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import replyFixture from "../fixtures/scenarioA.reply.facts.json";
import { formatUSD } from "../lib/ai/money";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

// The draftDispute recording names lines by fixture keys ("chg_1"); the live request uses Convex ids.
// Its line keys are mapped, in order, to the keys in this request, which draftDispute checks exactly.
vi.mock("@anthropic-ai/sdk", async () => {
  const recordings = await Promise.all([
    import("../tests/recordings/interpretReply-A.json"),
    import("../tests/recordings/planQuestion-A.json"),
    import("../tests/recordings/draftDispute-A.json"),
  ]);
  const bySystem = new Map<string, { user: string; reply: { stopReason: string | null; text: string } }>(
    recordings.map((r) => [r.default.calls[0].request.system, { user: r.default.calls[0].request.user, reply: r.default.calls[0].reply }]),
  );
  const lineKeys = (user: unknown): string[] => {
    if (typeof user !== "string") return [];
    try {
      return ((JSON.parse(user) as { disputedLines?: { key: string }[] }).disputedLines ?? []).map((l) => l.key);
    } catch {
      return [];
    }
  };
  class APIError extends Error { status?: number }
  class Anthropic {
    static APIError = APIError;
    beta = {
      messages: {
        create: async ({ system, messages }: { system: string; messages: { content: unknown }[] }) => {
          const recording = bySystem.get(system);
          if (!recording) throw new Error("No recording for this prompt");
          const live = lineKeys(messages[0]?.content);
          const text = lineKeys(recording.user).reduce((t, key, i) => (live[i] ? t.split(`"${key}"`).join(`"${live[i]}"`) : t), recording.reply.text);
          return { stop_reason: recording.reply.stopReason, content: [{ type: "text", text }] };
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

// Scenario A after the first run (question asked) and, by default, after the canonical reply: $700 at stake.
async function setup({ reply = true } = {}) {
  const t = convexTest(schema, modules);
  const caseId = await t.mutation(internal.seed.seedScenarioA, {});
  await t.mutation(internal.pipeline.processChange, { caseId });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  const [question] = await t.run((ctx) => ctx.db.query("questions").withIndex("by_case", (q) => q.eq("caseId", caseId)).collect());
  if (reply) {
    await t.mutation(api.ai.submitReply, { role: "ops_lead", personId: "sam", questionId: question._id, text: replyFixture.replyDoc.text });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
  }
  return { t, caseId, questionId: question._id };
}

type T = Awaited<ReturnType<typeof setup>>["t"];

const drain = (t: T) => t.finishAllScheduledFunctions(vi.runAllTimers);
const events = (t: T, caseId: Id<"cases">) =>
  t.run((ctx) => ctx.db.query("events").withIndex("by_case_at", (q) => q.eq("caseId", caseId)).collect());
const drafts = (t: T, caseId: Id<"cases">) =>
  t.run((ctx) => ctx.db.query("drafts").withIndex("by_case", (q) => q.eq("caseId", caseId)).collect());
const getDraft = (t: T, draftId: Id<"drafts">) => t.run((ctx) => ctx.db.get(draftId));

// Keys of the lines in To dispute after the reply: line 1 (ocean freight, +$300) and line 6 (rush handling, +$400).
const disputedKeys = (t: T, caseId: Id<"cases">) => t.run(async (ctx) => {
  const c = (await ctx.db.get(caseId))!;
  const rows = await ctx.db.query("findings").withIndex("by_case_rev", (q) => q.eq("caseId", caseId).eq("revision", c.revision)).collect();
  return rows.filter((f) => f.lineNo === 1 || f.lineNo === 6).sort((a, b) => a.lineNo - b.lineNo).map((f) => f.key);
});

describe("requestApproval", () => {
  it("maya requests: a pending draft with requestedBy maya, empty wording, and the disputed lines", async () => {
    const { t, caseId } = await setup();
    const draftId = await t.mutation(api.drafts.requestApproval, { caseId, personId: "maya" });

    expect(await getDraft(t, draftId)).toMatchObject({
      status: "pending_approval", requestedBy: "maya", createdBy: "clerk", to: "forwarder", subject: "", body: "",
      findingKeys: await disputedKeys(t, caseId), totalDisputedCents: 70000,
    });
    expect((await t.run((ctx) => ctx.db.get(caseId)))!.status).toBe("ready_for_approval");
    const requested = (await events(t, caseId)).filter((e) => e.type === "approval_requested");
    expect(requested.map((e) => [e.actor, e.payload.draftId, e.payload.personId])).toEqual([["clerk", draftId, "maya"]]);
  });

  it("leo (uploader only) is refused and nothing is created", async () => {
    const { t, caseId } = await setup();
    await expect(t.mutation(api.drafts.requestApproval, { caseId, personId: "leo" })).rejects.toThrow(/clerk/);
    expect(await drafts(t, caseId)).toEqual([]);
  });

  it("a second request while one is pending returns the same draft", async () => {
    const { t, caseId } = await setup();
    const first = await t.mutation(api.drafts.requestApproval, { caseId, personId: "maya" });
    expect(await t.mutation(api.drafts.requestApproval, { caseId, personId: "maya" })).toBe(first);
    expect(await drafts(t, caseId)).toHaveLength(1);
    expect((await events(t, caseId)).filter((e) => e.type === "approval_requested")).toHaveLength(1);
  });
});

describe("the approval gate", () => {
  it("maya can't approve or reject: approval_blocked, draft unchanged", async () => {
    const { t, caseId } = await setup();
    const draftId = await t.mutation(api.drafts.requestApproval, { caseId, personId: "maya" });
    const before = await getDraft(t, draftId);

    expect(await t.mutation(api.drafts.approveDraft, { draftId, personId: "maya" })).toEqual({ ok: false, reason: "Requires the owner" });
    expect(await t.mutation(api.drafts.rejectDraft, { draftId, personId: "maya", reason: "no" })).toEqual({ ok: false, reason: "Requires the owner" });
    await drain(t);

    expect(await getDraft(t, draftId)).toEqual(before);
    const blocked = (await events(t, caseId)).filter((e) => e.type === "approval_blocked");
    expect(blocked.map((e) => [e.payload.personId, e.payload.action, e.payload.reason])).toEqual([
      ["maya", "approve", "Requires the owner"], ["maya", "reject", "Requires the owner"],
    ]);
    expect((await events(t, caseId)).some((e) => e.type === "approved" || e.type === "draft_created")).toBe(false);
  });

  it("sam can't approve a dispute he requested himself", async () => {
    const { t, caseId } = await setup();
    const draftId = await t.mutation(api.drafts.requestApproval, { caseId, personId: "sam" });
    const before = await getDraft(t, draftId);

    expect(await t.mutation(api.drafts.approveDraft, { draftId, personId: "sam" }))
      .toEqual({ ok: false, reason: "The requester can't approve their own request" });
    await drain(t);

    expect(await getDraft(t, draftId)).toEqual(before);
    const [blocked] = (await events(t, caseId)).filter((e) => e.type === "approval_blocked");
    expect(blocked.payload).toMatchObject({ draftId, personId: "sam", reason: "The requester can't approve their own request" });
  });
});

describe("approveDraft", () => {
  it("sam approves maya's request: approvedBy sam, and the seller message is drafted into it with code-inserted amounts", async () => {
    const { t, caseId } = await setup();
    const draftId = await t.mutation(api.drafts.requestApproval, { caseId, personId: "maya" });
    expect(await t.mutation(api.drafts.approveDraft, { draftId, personId: "sam" })).toEqual({ ok: true });
    await drain(t); // draftDispute (recorded wording) -> saveDraft fills this draft

    const c = (await t.run((ctx) => ctx.db.get(caseId)))!;
    expect(c.status).toBe("approved");
    const all = await drafts(t, caseId);
    expect(all).toHaveLength(1);
    const draft = all[0];
    expect(draft).toMatchObject({
      _id: draftId, status: "approved", approvedBy: "sam", requestedBy: "maya",
      subject: `Disputed charges on invoice ${c.shipmentRef}`,
      findingKeys: await disputedKeys(t, caseId), totalDisputedCents: 70000,
    });
    expect(draft.body).toContain(`Line 1, Ocean freight 40HC Ningbo-Long Beach: billed ${formatUSD(480000)}, agreed ${formatUSD(450000)}, over by ${formatUSD(30000)}.`);
    expect(draft.body).toContain(`over by ${formatUSD(40000)}.`);
    expect(draft.body).toContain(`Total disputed: ${formatUSD(70000)}. Corrected invoice total: ${formatUSD(680000)}.`);

    const evs = await events(t, caseId);
    expect(evs.filter((e) => e.type === "approved").map((e) => [e.actor, e.payload.personId])).toEqual([["controller", "sam"]]);
    expect(evs.filter((e) => e.type === "draft_created").map((e) => e.payload.draftId)).toEqual([draftId]);
    expect(evs.some((e) => e.type === "extraction_failed")).toBe(false);
  });

  it("a decided draft can't be approved again", async () => {
    const { t, caseId } = await setup();
    const draftId = await t.mutation(api.drafts.requestApproval, { caseId, personId: "maya" });
    await t.mutation(api.drafts.approveDraft, { draftId, personId: "sam" });
    await expect(t.mutation(api.drafts.approveDraft, { draftId, personId: "sam" })).rejects.toThrow(/not waiting for approval/);
  });
});

describe("rejectDraft", () => {
  it("an empty reason is refused; sam rejects with a reason; nothing is drafted; maya can request again", async () => {
    const { t, caseId } = await setup();
    const draftId = await t.mutation(api.drafts.requestApproval, { caseId, personId: "maya" });
    for (const reason of ["", "   "]) {
      await expect(t.mutation(api.drafts.rejectDraft, { draftId, personId: "sam", reason })).rejects.toThrow(/reason is required/);
    }
    expect((await getDraft(t, draftId))!.status).toBe("pending_approval");

    const reason = "It wasn't agreed upfront, but they really did expedite it for us. Let's pay it this time.";
    expect(await t.mutation(api.drafts.rejectDraft, { draftId, personId: "sam", reason: `  ${reason} ` })).toEqual({ ok: true });
    await drain(t);

    expect(await getDraft(t, draftId)).toMatchObject({ status: "rejected", rejectedBy: "sam", rejectionReason: reason, subject: "", body: "" });
    expect((await t.run((ctx) => ctx.db.get(caseId)))!.status).toBe("open");
    const evs = await events(t, caseId);
    expect(evs.filter((e) => e.type === "draft_rejected").map((e) => [e.actor, e.payload.personId, e.payload.reason]))
      .toEqual([["controller", "sam", reason]]);
    expect(evs.some((e) => e.type === "draft_created" || e.type === "approved")).toBe(false);

    const again = await t.mutation(api.drafts.requestApproval, { caseId, personId: "maya" });
    expect(again).not.toBe(draftId);
    expect(await getDraft(t, again)).toMatchObject({ status: "pending_approval", requestedBy: "maya" });
  });
});

describe("submitReply checks its person", () => {
  it("leo is refused; sam answers and is recorded on the reply event", async () => {
    const { t, caseId, questionId } = await setup({ reply: false });
    await expect(t.mutation(api.ai.submitReply, { role: "ops_lead", personId: "leo", questionId, text: replyFixture.replyDoc.text }))
      .rejects.toThrow(/leo does not hold the ops_lead role/);
    expect((await events(t, caseId)).some((e) => e.type === "reply_received")).toBe(false);

    const docId = await t.mutation(api.ai.submitReply, { role: "ops_lead", personId: "sam", questionId, text: replyFixture.replyDoc.text });
    const [received] = (await events(t, caseId)).filter((e) => e.type === "reply_received");
    expect(received.payload).toMatchObject({ questionId, docId, personId: "sam" });
  });
});
