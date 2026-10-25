// Demo seed and reset (SPEC.md 9, W4 step 2): Scenario A, plus Bayline's October bill (fixtures/baylineOct/).
// Loads the starting state only: case, documents, facts, charges, and one doc_added event per document.
// No findings: Dev's pipeline computes those. resetLiveDemo also schedules that first run.
import { ConvexError, v } from "convex/values";
import { z } from "zod";
import octKey from "../fixtures/baylineOct/scenario.json";
import octExtracted from "../fixtures/baylineOct/facts.json";
import answerKey from "../fixtures/scenarioA.json";
import extracted from "../fixtures/scenarioA.facts.json";
import { NewChargeSchema, NewFactSchema, SourceDocSchema } from "../lib/schemas";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalMutation, mutation, type MutationCtx } from "./_generated/server";
import { personId, role } from "./schema";

// A demo case is identified by its invoice ref; the cases table has no scenario key.
export const SCENARIO_A_REF = answerKey.case.shipmentRef;
// Bayline's October container: quote and invoice seeded, the WhatsApp chat is uploaded from the phone.
export const BAYLINE_OCT_REF = octKey.case.shipmentRef;

type Scenario = {
  id: string;
  key: { case: { title: string; shipmentRef: string; forwarder?: string; incoterm?: string }; documents: unknown[] };
  extracted: { facts: unknown[]; charges: unknown[] };
};

const SCENARIOS: Record<string, Scenario> = {
  [SCENARIO_A_REF]: { id: "Scenario A", key: answerKey, extracted },
  [BAYLINE_OCT_REF]: { id: "Bayline October", key: octKey, extracted: octExtracted },
};

// Fixtures carry no stored PDFs, so fileId is not seeded.
const FixtureDocSchema = SourceDocSchema.omit({ _id: true, caseId: true, fileId: true }).extend({ id: z.string() });

async function findCases(ctx: MutationCtx, shipmentRef: string) {
  const cases = await ctx.db.query("cases").collect();
  return cases.filter((c) => c.shipmentRef === shipmentRef);
}

/** Deletes the case and everything on it, including rules learned from it; true if any rule went. */
async function deleteCase(ctx: MutationCtx, caseId: Id<"cases">): Promise<boolean> {
  const rows = [
    ...(await ctx.db.query("documents").withIndex("by_case", (q) => q.eq("caseId", caseId)).collect()),
    ...(await ctx.db.query("facts").withIndex("by_case", (q) => q.eq("caseId", caseId)).collect()),
    ...(await ctx.db.query("charges").withIndex("by_case", (q) => q.eq("caseId", caseId)).collect()),
    ...(await ctx.db.query("findings").withIndex("by_case_rev", (q) => q.eq("caseId", caseId)).collect()),
    ...(await ctx.db.query("questions").withIndex("by_case", (q) => q.eq("caseId", caseId)).collect()),
    ...(await ctx.db.query("replies").withIndex("by_case", (q) => q.eq("caseId", caseId)).collect()),
    ...(await ctx.db.query("drafts").withIndex("by_case", (q) => q.eq("caseId", caseId)).collect()),
    ...(await ctx.db.query("events").withIndex("by_case_at", (q) => q.eq("caseId", caseId)).collect()),
  ];
  // A "Not an issue" from a deleted demo case would otherwise clear lines on the fresh seed (R10).
  const rules = (await ctx.db.query("learnedRules").collect()).filter((r) => r.sourceCaseId === caseId);
  for (const row of [...rows, ...rules]) await ctx.db.delete(row._id);
  await ctx.db.delete(caseId);
  return rules.length > 0;
}

async function insertScenario(ctx: MutationCtx, s: Scenario): Promise<Id<"cases">> {
  const caseId = await ctx.db.insert("cases", { ...s.key.case, baseCurrency: "USD", revision: 0, status: "open" });

  // Fixture doc ids ("doc_quote") -> Convex ids, so spans point at real documents.
  const docIds = new Map<string, Id<"documents">>();
  for (const raw of s.key.documents) {
    const { id, ...doc } = FixtureDocSchema.parse(raw);
    // Seeded documents come pre-extracted, so they count as read (extraction never runs on them).
    const docId = await ctx.db.insert("documents", { ...doc, caseId, readStatus: "read" });
    docIds.set(id, docId);
    // Deterministic timestamp so a reset always yields the same state.
    await ctx.db.insert("events", {
      caseId, at: doc.sentAt ?? "2026-10-24T00:00:00-07:00", actor: "system", type: "doc_added", payload: { docId },
    });
  }
  const docId = (fixtureId: string) => {
    const id = docIds.get(fixtureId);
    if (!id) throw new Error(`${s.id} fixture references unknown document ${fixtureId}`);
    return id;
  };

  for (const raw of s.extracted.facts) {
    const fact = NewFactSchema.parse(raw);
    await ctx.db.insert("facts", { ...fact, caseId, span: { ...fact.span, docId: docId(fact.span.docId) } });
  }
  for (const raw of s.extracted.charges) {
    const charge = NewChargeSchema.parse(raw);
    await ctx.db.insert("charges", {
      ...charge, caseId, docId: docId(charge.docId), span: { ...charge.span, docId: docId(charge.span.docId) },
    });
  }
  return caseId;
}

/**
 * Deletes the demo case for `shipmentRef` and seeds it again. When a rule learned from the old case
 * went with it, the forwarder's other open cases are rechecked without it.
 */
async function reseed(ctx: MutationCtx, shipmentRef: string): Promise<Id<"cases">> {
  let droppedRule = false;
  for (const c of await findCases(ctx, shipmentRef)) droppedRule = (await deleteCase(ctx, c._id)) || droppedRule;
  const scenario = SCENARIOS[shipmentRef];
  const caseId = await insertScenario(ctx, scenario);
  if (droppedRule && scenario.key.case.forwarder) {
    const forwarder = scenario.key.case.forwarder.trim().toLowerCase();
    const others = (await ctx.db.query("cases").collect()).filter((c) =>
      c._id !== caseId && c.status !== "approved" && c.forwarder?.trim().toLowerCase() === forwarder);
    for (const c of others) await ctx.scheduler.runAfter(0, internal.pipeline.processChange, { caseId: c._id });
  }
  return caseId;
}

// Seeds Scenario A if it is not there yet; returns the existing case otherwise.
export const seedScenarioA = internalMutation({
  args: {},
  handler: async (ctx) => {
    const [existing] = await findCases(ctx, SCENARIO_A_REF);
    return existing ? existing._id : await insertScenario(ctx, SCENARIOS[SCENARIO_A_REF]);
  },
});

// Deletes everything for the Scenario A case and re-seeds the starting state.
// `npx convex run seed:resetDemo` works without a role; the UI reset button passes the current one.
export const resetDemo = mutation({
  args: { role: v.optional(role), personId },
  handler: async (ctx) => await reseed(ctx, SCENARIO_A_REF),
});

// The reset the live UI and the presenter use: resetDemo, then the first pipeline run (findings
// revision 1 and the question). A run still queued from an earlier reset finds its case deleted and does nothing.
// `shipmentRef` picks the demo case (Scenario A when left out); any other case can't be reset.
export const resetLiveDemo = mutation({
  args: { personId: v.optional(v.string()), shipmentRef: v.optional(v.string()) },
  handler: async (ctx, { shipmentRef = SCENARIO_A_REF }) => {
    if (!SCENARIOS[shipmentRef]) throw new ConvexError("Only the demo bills can be reset");
    const caseId = await reseed(ctx, shipmentRef);
    await ctx.scheduler.runAfter(0, internal.pipeline.processChange, { caseId });
    return caseId;
  },
});
