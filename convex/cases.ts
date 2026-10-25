// Read-only queries for the case screen (SPEC.md 5.4, 8). Totals come from the engine (lib/engine/totals.ts);
// nothing here computes money. Page-level person checks (CLAUDE.md rule 12) stay in the UI for now.
import { v } from "convex/values";
import { caseTotals } from "../lib/engine/totals";
import type { FindingChange } from "../lib/types";
import { query } from "./_generated/server";
import schema, { findingState } from "./schema";
import { SCENARIO_A_REF } from "./seed";

// A seeded demo case (Scenario A unless `shipmentRef` names another), so the UI can find it again after a
// reset. Cases has no shipmentRef index, so this scans until the first match; the table holds a handful of demo cases.
export const getDemoCase = query({
  args: { shipmentRef: v.optional(v.string()) },
  returns: v.union(v.null(), v.id("cases")),
  handler: async (ctx, { shipmentRef = SCENARIO_A_REF }) => {
    for await (const c of ctx.db.query("cases")) {
      if (c.shipmentRef === shipmentRef) return c._id;
    }
    return null;
  },
});

// Mirrors FindingChange (lib/types.ts) as stored in a `recomputed` event's payload.
const findingChange = v.object({
  key: v.string(),
  lineNo: v.number(),
  from: v.optional(findingState),
  to: findingState,
  causedByEventId: v.string(),
  causedByFactIds: v.array(v.string()),
});

const caseView = v.object({
  case: schema.doc("cases"),
  documents: v.array(schema.doc("documents")),
  facts: v.array(schema.doc("facts")),
  charges: v.array(schema.doc("charges")),
  findings: v.array(schema.doc("findings")), // latest revision only, by lineNo
  changes: v.array(findingChange),            // from the latest `recomputed` event; [] before the first run
  totals: v.object({ billed: v.number(), agreed: v.number(), atStake: v.number(), waiting: v.number(), waived: v.number() }),
  questions: v.array(schema.doc("questions")),
  replies: v.array(schema.doc("replies")),
  draft: v.union(v.null(), schema.doc("drafts")), // the most recently created draft
  events: v.array(schema.doc("events")),          // oldest first
});

// Everything the case screen needs in one reactive query; null when the case doesn't exist.
export const getCaseView = query({
  args: { caseId: v.id("cases") },
  returns: v.union(v.null(), caseView),
  handler: async (ctx, { caseId }) => {
    const c = await ctx.db.get(caseId);
    if (!c) return null;
    const documents = await ctx.db.query("documents").withIndex("by_case", (q) => q.eq("caseId", caseId)).collect();
    const facts = await ctx.db.query("facts").withIndex("by_case", (q) => q.eq("caseId", caseId)).collect();
    const charges = await ctx.db.query("charges").withIndex("by_case", (q) => q.eq("caseId", caseId)).collect();
    const findings = (await ctx.db.query("findings")
      .withIndex("by_case_rev", (q) => q.eq("caseId", caseId).eq("revision", c.revision)).collect())
      .sort((a, b) => a.lineNo - b.lineNo);
    const questions = await ctx.db.query("questions").withIndex("by_case", (q) => q.eq("caseId", caseId)).collect();
    const replies = await ctx.db.query("replies").withIndex("by_case", (q) => q.eq("caseId", caseId)).collect();
    const draft = await ctx.db.query("drafts").withIndex("by_case", (q) => q.eq("caseId", caseId)).order("desc").first();
    const events = await ctx.db.query("events").withIndex("by_case_at", (q) => q.eq("caseId", caseId)).collect();

    const recomputed = events.filter((e) => e.type === "recomputed").at(-1);
    const changes = (recomputed?.payload.changes ?? []) as FindingChange[];

    return {
      case: c, documents, facts, charges, findings, changes, totals: caseTotals(findings),
      questions, replies, draft, events,
    };
  },
});
