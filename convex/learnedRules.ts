// Learned rules (SPEC.md 6 "Learned rules (R10)", 9 W4 step 14): "Not an issue" is remembered per forwarder +
// charge type, and later cases from that forwarder clear matching lines with R10_LEARNED. Saving or undoing a
// rule writes an event and recomputes every open case of that forwarder (internal.pipeline.recomputeForwarder).
import { ConvexError, v } from "convex/values";
import { holdsRole } from "../lib/people";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalMutation, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import schema from "./schema";

const now = () => new Date().toISOString();

// SPEC §6: createdAt keeps the local offset, so the why line's "Oct 24" is right after 5 PM Pacific too.
const PACIFIC_OFFSET_MS = 7 * 60 * 60 * 1000;
const nowPacific = () => `${new Date(Date.now() - PACIFIC_OFFSET_MS).toISOString().slice(0, 19)}-07:00`;

// Same matching as the pipeline: exact apart from letter case and surrounding spaces.
const sameForwarder = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

// The by_forwarder_type index is exact-match, so this scans; the table holds one row per forwarder + charge type.
async function rulesFor(ctx: QueryCtx, forwarder: string) {
  return (await ctx.db.query("learnedRules").collect()).filter((r) => sameForwarder(r.forwarder, forwarder));
}

/**
 * Saves (or replaces) the rule for this line's forwarder + charge type, writes rule_learned, and schedules the
 * forwarder's recompute. Runs in the caller's transaction (dismissFinding). Returns null, saving nothing, when
 * the case has no forwarder or the line isn't on the case.
 */
export async function saveLearnedRule(
  ctx: MutationCtx, { caseId, chargeId, personId }: { caseId: Id<"cases">; chargeId: Id<"charges">; personId: string },
): Promise<Id<"learnedRules"> | null> {
  const c = await ctx.db.get(caseId);
  const charge = await ctx.db.get(chargeId);
  if (!c?.forwarder || !charge || charge.caseId !== caseId) return null;

  const rule = {
    forwarder: c.forwarder, chargeType: charge.chargeType, maxAmountCents: charge.amountCents,
    createdBy: personId, createdAt: nowPacific(), sourceCaseId: caseId, sourceChargeId: chargeId,
  };
  const [existing, ...extra] = (await rulesFor(ctx, c.forwarder)).filter((r) => r.chargeType === charge.chargeType);
  for (const r of extra) await ctx.db.delete(r._id);
  let ruleId: Id<"learnedRules">;
  if (existing) {
    ruleId = existing._id;
    await ctx.db.replace(ruleId, rule);
  } else {
    ruleId = await ctx.db.insert("learnedRules", rule);
  }

  const eventId = await ctx.db.insert("events", {
    caseId, at: now(), actor: "clerk", type: "rule_learned",
    payload: { ruleId, replaced: existing !== undefined, ...rule, lineNo: charge.lineNo, personId },
  });
  await ctx.scheduler.runAfter(0, internal.pipeline.recomputeForwarder, { forwarder: c.forwarder, eventId });
  return ruleId;
}

export const saveLearnedRuleMutation = internalMutation({
  args: { caseId: v.id("cases"), chargeId: v.id("charges"), personId: v.string() },
  returns: v.union(v.null(), v.id("learnedRules")),
  handler: async (ctx, args) => await saveLearnedRule(ctx, args),
});

// "Undo" on the remembered note. The forwarder's open cases recompute; the lines go back to what the other rules say.
export const undoLearnedRule = mutation({
  args: { ruleId: v.id("learnedRules"), personId: v.string() },
  returns: v.null(),
  handler: async (ctx, { ruleId, personId }) => {
    if (!holdsRole(personId, "clerk")) throw new ConvexError(`${personId} does not hold the clerk role`);
    const rule = await ctx.db.get(ruleId);
    if (!rule) throw new ConvexError("This remembered rule was already undone");
    await ctx.db.delete(ruleId);
    const eventId = await ctx.db.insert("events", {
      caseId: rule.sourceCaseId, at: now(), actor: "clerk", type: "rule_undone",
      payload: { ruleId, forwarder: rule.forwarder, chargeType: rule.chargeType, personId },
    });
    await ctx.scheduler.runAfter(0, internal.pipeline.recomputeForwarder, { forwarder: rule.forwarder, eventId });
    return null;
  },
});

// For the "remembered" note and its Undo button. Newest first; all forwarders when none is given.
export const listLearnedRules = query({
  args: { forwarder: v.optional(v.string()) },
  returns: v.array(schema.doc("learnedRules")),
  handler: async (ctx, { forwarder }) => {
    const rules = forwarder === undefined ? await ctx.db.query("learnedRules").collect() : await rulesFor(ctx, forwarder);
    return rules.sort((a, b) => b._creationTime - a._creationTime);
  },
});
