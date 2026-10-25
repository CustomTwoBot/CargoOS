/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

// SPEC.md 5.5: the learnedRules table and the new optional fields on existing tables.
describe("convex schema (SPEC 5.5)", () => {
  it("stores learned rules and finds them by forwarder + charge type", async () => {
    const t = convexTest(schema, modules);
    const caseId = await t.mutation(api.seed.resetDemo, {});
    const found = await t.run(async (ctx) => {
      const [charge] = await ctx.db.query("charges").withIndex("by_case", (q) => q.eq("caseId", caseId)).collect();
      await ctx.db.insert("learnedRules", {
        forwarder: "Pacific Crest Logistics", chargeType: "handling", maxAmountCents: 40000,
        createdBy: "maya", createdAt: "2026-10-24T14:20:00-07:00", sourceCaseId: caseId, sourceChargeId: charge._id,
      });
      return ctx.db.query("learnedRules")
        .withIndex("by_forwarder_type", (q) => q.eq("forwarder", "Pacific Crest Logistics").eq("chargeType", "handling")).collect();
    });
    expect(found.map((r) => [r.chargeType, r.maxAmountCents, r.createdBy])).toEqual([["handling", 40000, "maya"]]);
  });

  it("seeded Scenario A carries its forwarder", async () => {
    const t = convexTest(schema, modules);
    const caseId = await t.mutation(api.seed.resetDemo, { personId: "sam" });
    expect((await t.run((ctx) => ctx.db.get(caseId)))!.forwarder).toBe("Pacific Crest Logistics");
  });

  it("accepts the new draft, finding and event fields", async () => {
    const t = convexTest(schema, modules);
    const caseId = await t.mutation(api.seed.resetDemo, {});
    await t.run(async (ctx) => {
      const [charge] = await ctx.db.query("charges").withIndex("by_case", (q) => q.eq("caseId", caseId)).collect();
      const ruleId = await ctx.db.insert("learnedRules", {
        forwarder: "Pacific Crest Logistics", chargeType: charge.chargeType, createdBy: "maya",
        createdAt: "2026-10-24", sourceCaseId: caseId, sourceChargeId: charge._id,
      });
      await ctx.db.insert("findings", {
        key: charge._id, caseId, chargeId: charge._id, lineNo: 1, revision: 1, status: "supported", ruleId: "R10_LEARNED",
        billedCents: charge.amountCents, expectedCents: charge.amountCents, factIds: [], evidence: [], explanation: "x", learnedRuleId: ruleId,
      });
      await ctx.db.insert("drafts", {
        caseId, to: "forwarder", subject: "", body: "", findingKeys: [charge._id], totalDisputedCents: 30000, status: "rejected",
        createdBy: "clerk", requestedBy: "maya", rejectedBy: "sam", rejectionReason: "They did expedite it.",
      });
      for (const type of ["draft_rejected", "rule_learned", "rule_undone", "document_uploaded"] as const) {
        await ctx.db.insert("events", { caseId, at: "2026-10-24", actor: "uploader", type, payload: {} });
      }
    });
    expect(await t.run((ctx) => ctx.db.query("drafts").collect())).toHaveLength(1);
  });
});
