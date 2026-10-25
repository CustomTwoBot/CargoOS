// Scenario A seed and demo reset (SPEC.md 9, W4 step 2).
// Loads the starting state only: case, documents, facts, charges, and one doc_added event per document.
// No findings: Dev's pipeline computes those.
import { v } from "convex/values";
import { z } from "zod";
import answerKey from "../fixtures/scenarioA.json";
import extracted from "../fixtures/scenarioA.facts.json";
import { NewChargeSchema, NewFactSchema, SourceDocSchema } from "../lib/schemas";
import type { Id } from "./_generated/dataModel";
import { internalMutation, mutation, type MutationCtx } from "./_generated/server";
import { personId, role } from "./schema";

// Scenario A is identified by its invoice ref; the cases table has no scenario key.
export const SCENARIO_A_REF = answerKey.case.shipmentRef;

// Fixtures carry no stored PDFs, so fileId is not seeded.
const FixtureDocSchema = SourceDocSchema.omit({ _id: true, caseId: true, fileId: true }).extend({ id: z.string() });

async function findScenarioCases(ctx: MutationCtx) {
  const cases = await ctx.db.query("cases").collect();
  return cases.filter((c) => c.shipmentRef === SCENARIO_A_REF);
}

async function deleteCase(ctx: MutationCtx, caseId: Id<"cases">) {
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
  for (const row of rows) await ctx.db.delete(row._id);
  await ctx.db.delete(caseId);
}

async function insertScenarioA(ctx: MutationCtx): Promise<Id<"cases">> {
  const caseId = await ctx.db.insert("cases", { ...answerKey.case, baseCurrency: "USD", revision: 0, status: "open" });

  // Fixture doc ids ("doc_quote") -> Convex ids, so spans point at real documents.
  const docIds = new Map<string, Id<"documents">>();
  for (const raw of answerKey.documents) {
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
    if (!id) throw new Error(`Scenario A fixture references unknown document ${fixtureId}`);
    return id;
  };

  for (const raw of extracted.facts) {
    const fact = NewFactSchema.parse(raw);
    await ctx.db.insert("facts", { ...fact, caseId, span: { ...fact.span, docId: docId(fact.span.docId) } });
  }
  for (const raw of extracted.charges) {
    const charge = NewChargeSchema.parse(raw);
    await ctx.db.insert("charges", {
      ...charge, caseId, docId: docId(charge.docId), span: { ...charge.span, docId: docId(charge.span.docId) },
    });
  }
  return caseId;
}

// Seeds Scenario A if it is not there yet; returns the existing case otherwise.
export const seedScenarioA = internalMutation({
  args: {},
  handler: async (ctx) => {
    const [existing] = await findScenarioCases(ctx);
    return existing ? existing._id : await insertScenarioA(ctx);
  },
});

// Deletes everything for the Scenario A case and re-seeds the starting state.
// `npx convex run seed:resetDemo` works without a role; the UI reset button passes the current one.
export const resetDemo = mutation({
  args: { role: v.optional(role), personId },
  handler: async (ctx) => {
    for (const c of await findScenarioCases(ctx)) await deleteCase(ctx, c._id);
    return await insertScenarioA(ctx);
  },
});
