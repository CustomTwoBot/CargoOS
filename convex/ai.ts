// Convex wiring for the Claude agent (SPEC.md 9, W2 step 7): planQuestion, interpretReply, draftDispute.
// Actions call lib/ai; small internal mutations write the results and an append-only event each.
// On any failure: an extraction_failed event, nothing else changes (lines stay needs_review), no throw.
import { ConvexError, v, type Infer } from "convex/values";
import { draftDispute as draftWithClaude, disputedFindings } from "../lib/ai/draftDispute";
import { interpretReply as interpretWithClaude, resolveReply } from "../lib/ai/interpretReply";
import { planQuestion as planWithClaude } from "../lib/ai/planQuestion";
import type { CaseState } from "../lib/ai/types";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalAction, internalMutation, internalQuery, mutation, type MutationCtx } from "./_generated/server";
import schema, { personId, role, sourceSpan } from "./schema";

const newQuestion = v.object({
  to: role,
  findingKeys: v.array(v.string()),
  text: v.string(),
  citations: v.array(sourceSpan),
  followupOf: v.optional(v.id("questions")),
});
const newFact = schema.tables.facts.validator.omit("caseId", "supersedes");

const now = () => new Date().toISOString();
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

async function logEvent(ctx: MutationCtx, caseId: Id<"cases">, actor: Doc<"events">["actor"], type: Doc<"events">["type"], payload: Record<string, unknown>) {
  await ctx.db.insert("events", { caseId, at: now(), actor, type, payload });
}

// ---- State and failures ----

export const caseState = internalQuery({
  args: { caseId: v.id("cases") },
  handler: async (ctx, { caseId }): Promise<CaseState | null> => {
    const c = await ctx.db.get(caseId);
    if (!c) return null;
    return {
      case: c,
      documents: await ctx.db.query("documents").withIndex("by_case", (q) => q.eq("caseId", caseId)).collect(),
      facts: await ctx.db.query("facts").withIndex("by_case", (q) => q.eq("caseId", caseId)).collect(),
      charges: await ctx.db.query("charges").withIndex("by_case", (q) => q.eq("caseId", caseId)).collect(),
      questions: await ctx.db.query("questions").withIndex("by_case", (q) => q.eq("caseId", caseId)).collect(),
      findings: await ctx.db.query("findings")
        .withIndex("by_case_rev", (q) => q.eq("caseId", caseId).eq("revision", c.revision)).collect(),
    };
  },
});

export const logFailure = internalMutation({
  args: { caseId: v.id("cases"), stage: v.string(), error: v.string(), details: v.optional(v.record(v.string(), v.any())) },
  handler: async (ctx, { caseId, stage, error, details }) => {
    await logEvent(ctx, caseId, "agent", "extraction_failed", { stage, error, ...details });
  },
});

// ---- planQuestion ----

// Scheduled by the pipeline when a needs_review line has no open question.
export const planQuestion = internalAction({
  args: { caseId: v.id("cases") },
  handler: async (ctx, { caseId }): Promise<null> => {
    const state: CaseState | null = await ctx.runQuery(internal.ai.caseState, { caseId });
    if (!state) return null;
    try {
      const question = await planWithClaude(state, state.findings);
      if (question) {
        await ctx.runMutation(internal.ai.saveQuestion, { caseId, question: question as Infer<typeof newQuestion> });
      }
    } catch (e) {
      await ctx.runMutation(internal.ai.logFailure, { caseId, stage: "planQuestion", error: message(e) });
    }
    return null;
  },
});

async function insertQuestion(ctx: MutationCtx, caseId: Id<"cases">, question: Infer<typeof newQuestion>) {
  const questionId = await ctx.db.insert("questions", { ...question, caseId, status: "open", createdAt: now() });
  await logEvent(ctx, caseId, "agent", "question_asked", {
    questionId, to: question.to, findingKeys: question.findingKeys, followupOf: question.followupOf,
  });
  await ctx.db.patch(caseId, { status: "awaiting_answer" });
  return questionId;
}

export const saveQuestion = internalMutation({
  args: { caseId: v.id("cases"), question: newQuestion },
  handler: async (ctx, { caseId, question }) => {
    // Re-check inside the transaction: never more than one open question per finding.
    const open = await ctx.db.query("questions").withIndex("by_case", (q) => q.eq("caseId", caseId)).collect();
    const covered = new Set(open.filter((q) => q.status === "open").flatMap((q) => q.findingKeys));
    if (question.findingKeys.some((k) => covered.has(k))) return null;
    return await insertQuestion(ctx, caseId, question);
  },
});

// ---- Replies ----

// The ops-lead inbox calls this. Saves the reply as a document and interprets it in the background.
export const submitReply = mutation({
  args: { role, personId, questionId: v.id("questions"), text: v.string() },
  handler: async (ctx, { role: actor, questionId, text }) => {
    const question = await ctx.db.get(questionId);
    if (!question) throw new ConvexError("Question not found");
    if (question.status !== "open") throw new ConvexError("This question is no longer open");
    if (actor !== question.to) throw new ConvexError(`Only the ${question.to.replace("_", " ")} can answer this question`);
    if (text.trim() === "") throw new ConvexError("Reply is empty");

    const sentAt = now();
    const docId = await ctx.db.insert("documents", {
      caseId: question.caseId, type: "reply", title: "Reply from ops lead", sender: actor, sentAt, text,
    });
    await logEvent(ctx, question.caseId, actor, "reply_received", { questionId, docId });
    await ctx.scheduler.runAfter(0, internal.ai.interpretReply, { questionId, docId });
    return docId;
  },
});

export const interpretReply = internalAction({
  args: { questionId: v.id("questions"), docId: v.id("documents") },
  handler: async (ctx, { questionId, docId }): Promise<null> => {
    const ids: { caseId: Id<"cases"> } | null = await ctx.runQuery(internal.ai.questionCase, { questionId });
    if (!ids) return null;
    const state: CaseState | null = await ctx.runQuery(internal.ai.caseState, { caseId: ids.caseId });
    const question = state?.questions.find((q) => q._id === questionId);
    const replyDoc = state?.documents.find((d) => d._id === docId);
    if (!state || !question || !replyDoc) return null;
    try {
      const reply = await interpretWithClaude(question, replyDoc, state);
      const { questionStatus, followUp } = resolveReply(question, reply, state.questions);
      await ctx.runMutation(internal.ai.applyReply, {
        questionId, docId,
        interpretation: reply.interpretation,
        facts: reply.facts as Infer<typeof newFact>[],
        questionStatus,
        followUp: (followUp ?? undefined) as Infer<typeof newQuestion> | undefined,
        dropped: reply.dropped,
      });
    } catch (e) {
      await ctx.runMutation(internal.ai.logFailure, { caseId: ids.caseId, stage: "interpretReply", error: message(e), details: { questionId, docId } });
    }
    return null;
  },
});

export const questionCase = internalQuery({
  args: { questionId: v.id("questions") },
  handler: async (ctx, { questionId }) => {
    const q = await ctx.db.get(questionId);
    return q ? { caseId: q.caseId } : null;
  },
});

export const applyReply = internalMutation({
  args: {
    questionId: v.id("questions"),
    docId: v.id("documents"),
    interpretation: v.union(v.literal("yes"), v.literal("partial"), v.literal("no"), v.literal("ambiguous")),
    facts: v.array(newFact),
    questionStatus: v.union(v.literal("open"), v.literal("answered"), v.literal("closed_unresolved")),
    followUp: v.optional(newQuestion),
    dropped: v.array(v.string()),
  },
  handler: async (ctx, { questionId, docId, interpretation, facts, questionStatus, followUp, dropped }) => {
    const question = await ctx.db.get(questionId);
    if (!question) return null;
    const caseId = question.caseId;
    const factIds = [];
    for (const fact of facts) factIds.push(await ctx.db.insert("facts", { ...fact, caseId }));
    const replyId = await ctx.db.insert("replies", { caseId, questionId, from: question.to, docId, interpretation, factIds });
    await ctx.db.patch(questionId, { status: questionStatus });
    await logEvent(ctx, caseId, "agent", "facts_extracted", { docId, replyId, questionId, interpretation, factIds, dropped, questionStatus });

    if (followUp) await insertQuestion(ctx, caseId, followUp);
    else await ctx.db.patch(caseId, { status: "open" });
    // TODO(Dev): schedule internal.pipeline.processChange here once convex/pipeline.ts lands, so the new
    // facts recompute the findings.
    return replyId;
  },
});

// ---- Dispute draft ----

// "Draft dispute" button. Claude writes the wording in the background; nothing is ever sent.
export const createDraft = mutation({
  args: { role, personId, caseId: v.id("cases") },
  handler: async (ctx, { role: actor, caseId }) => {
    if (actor === "ops_lead") throw new ConvexError("The ops lead cannot draft disputes");
    const c = await ctx.db.get(caseId);
    if (!c) throw new ConvexError("Case not found");
    const findings = await ctx.db.query("findings")
      .withIndex("by_case_rev", (q) => q.eq("caseId", caseId).eq("revision", c.revision)).collect();
    if (disputedFindings(findings).length === 0) throw new ConvexError("Nothing is at stake, so there is nothing to dispute");
    await ctx.scheduler.runAfter(0, internal.ai.draftDispute, { caseId, role: actor });
    return null;
  },
});

export const draftDispute = internalAction({
  args: { caseId: v.id("cases"), role },
  handler: async (ctx, { caseId, role: createdBy }): Promise<null> => {
    const state: CaseState | null = await ctx.runQuery(internal.ai.caseState, { caseId });
    if (!state) return null;
    try {
      const draft = await draftWithClaude(state.findings, state);
      await ctx.runMutation(internal.ai.saveDraft, { caseId, createdBy, ...draft });
    } catch (e) {
      await ctx.runMutation(internal.ai.logFailure, { caseId, stage: "draftDispute", error: message(e) });
    }
    return null;
  },
});

export const saveDraft = internalMutation({
  args: {
    caseId: v.id("cases"), createdBy: role,
    subject: v.string(), body: v.string(), findingKeys: v.array(v.string()), totalDisputedCents: v.number(),
  },
  handler: async (ctx, { caseId, createdBy, ...draft }) => {
    const draftId = await ctx.db.insert("drafts", { caseId, to: "forwarder", status: "draft", createdBy, ...draft });
    await logEvent(ctx, caseId, createdBy, "draft_created", { draftId, findingKeys: draft.findingKeys, totalDisputedCents: draft.totalDisputedCents });
    return draftId;
  },
});
