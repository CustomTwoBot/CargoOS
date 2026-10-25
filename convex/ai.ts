// Convex wiring for the Claude agent (SPEC.md 9, W2 step 7): extraction, planQuestion, interpretReply, draftDispute.
// Actions call lib/ai; small internal mutations write the results and an append-only event each.
// On any failure: an extraction_failed event, nothing else changes (lines stay needs_review), no throw.
import { ConvexError, v, type Infer } from "convex/values";
import { draftDispute as draftWithClaude, disputedFindings } from "../lib/ai/draftDispute";
import { extractDocument } from "../lib/ai/extract";
import { interpretReply as interpretWithClaude, resolveReply } from "../lib/ai/interpretReply";
import { planQuestion as planWithClaude } from "../lib/ai/planQuestion";
import { transcribeImage } from "../lib/ai/transcribe";
import { holdsRole } from "../lib/people";
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
const newCharge = schema.tables.charges.validator.omit("caseId");

const now = () => new Date().toISOString();
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

async function logEvent(ctx: MutationCtx, caseId: Id<"cases">, actor: Doc<"events">["actor"], type: Doc<"events">["type"], payload: Record<string, unknown>) {
  return await ctx.db.insert("events", { caseId, at: now(), actor, type, payload });
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

// ---- Extraction (SPEC.md 9, W2 step 3) ----

// Marks the documents as being read and extracts them in parallel, one action each.
export const extractDocuments = internalMutation({
  args: { caseId: v.id("cases"), docIds: v.array(v.id("documents")) },
  handler: async (ctx, { caseId, docIds }) => {
    for (const docId of docIds) {
      const doc = await ctx.db.get(docId);
      if (!doc || doc.caseId !== caseId || doc.readStatus === "read") continue;
      await ctx.db.patch(docId, { readStatus: "reading" });
      await ctx.scheduler.runAfter(0, internal.ai.extractAndStore, { caseId, docId });
    }
  },
});

// One document: get its text (read the file, or transcribe an image once), extract, check, save.
export const extractAndStore = internalAction({
  args: { caseId: v.id("cases"), docId: v.id("documents") },
  handler: async (ctx, { caseId, docId }): Promise<null> => {
    const doc: Doc<"documents"> | null = await ctx.runQuery(internal.ai.getDocument, { docId });
    if (!doc || doc.caseId !== caseId || doc.readStatus === "read") return null; // never read twice
    const fail = async (stage: string, error: string) => {
      await ctx.runMutation(internal.ai.markNotRead, { docId, error });
      await ctx.runMutation(internal.ai.logFailure, { caseId, stage, error, details: { docId } });
    };
    try {
      let text = doc.text;
      if (text.trim() === "" && doc.fileId) {
        if (doc.textFrom === "image") {
          const prepared = await ctx.runAction(internal.files.prepareImageFile, { fileId: doc.fileId });
          if (!prepared.ok) { await fail("transcribe", prepared.reason); return null; }
          const transcription = await transcribeImage(prepared.image);
          if (!transcription.readable) { await fail("transcribe", `Not readable: ${transcription.reason}`); return null; }
          text = transcription.text;
          // Saved before extraction, so a retry never transcribes the image again.
          await ctx.runMutation(internal.ai.saveDocText, { docId, text });
        } else if (doc.textFrom === "pdf" || doc.textFrom === "eml" || doc.textFrom === "txt") {
          const file = await ctx.runAction(internal.files.readFileText, { fileId: doc.fileId, textFrom: doc.textFrom });
          if (!file.ok) { await fail("read_file", file.reason); return null; }
          text = file.text;
          await ctx.runMutation(internal.ai.saveDocText, { docId, text, sentAt: file.sentAt, sender: file.sender });
        }
      }
      if (text.trim() === "") { await fail("extract", "The document has no text."); return null; }

      const latest: Doc<"documents"> | null = await ctx.runQuery(internal.ai.getDocument, { docId });
      const extraction = await extractDocument({ ...(latest ?? doc), text });
      await ctx.runMutation(internal.ai.saveExtraction, {
        caseId, docId,
        facts: extraction.facts as Infer<typeof newFact>[],
        charges: extraction.charges as Infer<typeof newCharge>[],
        dropped: extraction.dropped,
      });
    } catch (e) {
      await fail("extract", message(e));
    }
    return null;
  },
});

export const getDocument = internalQuery({
  args: { docId: v.id("documents") },
  handler: (ctx, { docId }) => ctx.db.get(docId),
});

export const saveDocText = internalMutation({
  args: { docId: v.id("documents"), text: v.string(), sentAt: v.optional(v.string()), sender: v.optional(v.string()) },
  handler: async (ctx, { docId, text, sentAt, sender }) => {
    const doc = await ctx.db.get(docId);
    if (!doc) return;
    // Keep metadata the uploader set; fill it from the file (e.g. an email's Date / From) otherwise.
    await ctx.db.patch(docId, { text, ...(sentAt && !doc.sentAt ? { sentAt } : {}), ...(sender && !doc.sender ? { sender } : {}) });
  },
});

export const markNotRead = internalMutation({
  args: { docId: v.id("documents"), error: v.string() },
  handler: async (ctx, { docId, error }) => {
    const doc = await ctx.db.get(docId);
    if (!doc) return;
    await ctx.db.patch(docId, { readStatus: "not_read", readError: error });
    // No new facts, so no recompute; but if this was the last document being read, the question
    // planQuestion held back can be asked now (it re-checks reading and open questions itself).
    await ctx.scheduler.runAfter(0, internal.ai.planQuestion, { caseId: doc.caseId });
  },
});

export const saveExtraction = internalMutation({
  args: { caseId: v.id("cases"), docId: v.id("documents"), facts: v.array(newFact), charges: v.array(newCharge), dropped: v.array(v.string()) },
  handler: async (ctx, { caseId, docId, facts, charges, dropped }) => {
    const factIds = [];
    for (const fact of facts) factIds.push(await ctx.db.insert("facts", { ...fact, caseId }));
    const chargeIds = [];
    for (const charge of charges) chargeIds.push(await ctx.db.insert("charges", { ...charge, caseId }));
    await ctx.db.patch(docId, { readStatus: "read", readError: undefined });
    const eventId = await logEvent(ctx, caseId, "agent", "facts_extracted", { docId, factIds, chargeIds, dropped });
    // Scheduled in the same transaction, so it runs exactly when the facts are saved. processChange
    // schedules planQuestion, which waits until no document in the case is still "reading".
    await ctx.scheduler.runAfter(0, internal.pipeline.processChange, { caseId, eventId });
  },
});

// ---- planQuestion ----

// Scheduled by the pipeline when a needs_review line has no open question.
export const planQuestion = internalAction({
  args: { caseId: v.id("cases") },
  handler: async (ctx, { caseId }): Promise<null> => {
    const state: CaseState | null = await ctx.runQuery(internal.ai.caseState, { caseId });
    if (!state) return null;
    // Wait until every document is read: an invoice read before its quote would look unsupported.
    if (state.documents.some((d) => d.readStatus === "reading")) return null;
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
  handler: async (ctx, { role: actor, personId: person, questionId, text }) => {
    const question = await ctx.db.get(questionId);
    if (!question) throw new ConvexError("Question not found");
    if (question.status !== "open") throw new ConvexError("This question is no longer open");
    if (actor !== question.to) throw new ConvexError(`Only the ${question.to.replace("_", " ")} can answer this question`);
    // TODO(Pranav): make personId required once every caller passes it (convex/ai.test.ts still calls without one).
    if (person !== undefined && !holdsRole(person, question.to)) {
      throw new ConvexError(`${person} does not hold the ${question.to} role, so they can't answer this question`);
    }
    if (text.trim() === "") throw new ConvexError("Reply is empty");

    const sentAt = now();
    const docId = await ctx.db.insert("documents", {
      caseId: question.caseId, type: "reply", title: "Reply from ops lead", sender: actor, sentAt, text,
    });
    await logEvent(ctx, question.caseId, actor, "reply_received", { questionId, docId, personId: person });
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
    const eventId = await logEvent(ctx, caseId, "agent", "facts_extracted", { docId, replyId, questionId, interpretation, factIds, dropped, questionStatus });

    if (followUp) await insertQuestion(ctx, caseId, followUp);
    else await ctx.db.patch(caseId, { status: "open" });
    // The reply's facts recompute the findings. A follow-up is saved first, so processChange sees its
    // lines covered and doesn't plan a second question.
    await ctx.scheduler.runAfter(0, internal.pipeline.processChange, { caseId, eventId });
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

// With draftId (an approved dispute, convex/drafts.ts), fills that draft instead of creating one.
export const draftDispute = internalAction({
  args: { caseId: v.id("cases"), role, draftId: v.optional(v.id("drafts")) },
  handler: async (ctx, { caseId, role: createdBy, draftId }): Promise<null> => {
    const state: CaseState | null = await ctx.runQuery(internal.ai.caseState, { caseId });
    if (!state) return null;
    try {
      const draft = await draftWithClaude(state.findings, state);
      await ctx.runMutation(internal.ai.saveDraft, { caseId, createdBy, draftId, ...draft });
    } catch (e) {
      await ctx.runMutation(internal.ai.logFailure, { caseId, stage: "draftDispute", error: message(e) });
    }
    return null;
  },
});

export const saveDraft = internalMutation({
  args: {
    caseId: v.id("cases"), createdBy: role, draftId: v.optional(v.id("drafts")),
    subject: v.string(), body: v.string(), findingKeys: v.array(v.string()), totalDisputedCents: v.number(),
  },
  handler: async (ctx, { caseId, createdBy, draftId: existingId, ...draft }) => {
    let draftId = existingId;
    if (draftId) {
      const existing = await ctx.db.get(draftId);
      if (!existing || existing.caseId !== caseId) throw new Error("saveDraft: the draft to fill is not on this case");
      await ctx.db.patch(draftId, draft);
    } else {
      draftId = await ctx.db.insert("drafts", { caseId, to: "forwarder", status: "draft", createdBy, ...draft });
    }
    await logEvent(ctx, caseId, createdBy, "draft_created", { draftId, findingKeys: draft.findingKeys, totalDisputedCents: draft.totalDisputedCents });
    return draftId;
  },
});
