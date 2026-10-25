// The pipeline (SPEC.md §4, §9 W1 step 7): recompute findings on every change, plus the clerk's
// Agree / Not an issue / line edit mutations. The engine (lib/engine) stays pure; this file does the I/O.
// Every state change writes an append-only event (CLAUDE.md rule 9).
import { ConvexError, v } from "convex/values";
import { diffFindings } from "../lib/engine/diff";
import { reconcile } from "../lib/engine/reconcile";
import { holdsRole } from "../lib/people";
import type { Finding, Role, Status } from "../lib/types";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, mutation, type MutationCtx } from "./_generated/server";
import { personId, role } from "./schema";

const now = () => new Date().toISOString();

async function logEvent(
  ctx: MutationCtx, caseId: Id<"cases">, actor: Doc<"events">["actor"], type: Doc<"events">["type"], payload: Record<string, unknown>,
): Promise<Id<"events">> {
  return await ctx.db.insert("events", { caseId, at: now(), actor, type, payload });
}

/** SPEC §5.2: each action passes its own role; with a person id, the server checks that person holds it. */
function checkActor(actor: Role, person: string | undefined, required: Role) {
  if (actor !== required) throw new ConvexError(`Only the ${required} role can do this`);
  if (person !== undefined && !holdsRole(person, actor)) throw new ConvexError(`${person} does not hold the ${actor} role`);
}

/** reconcile() returns plain string ids; the findings table stores Convex ids. */
function toRow(f: Finding): Omit<Doc<"findings">, "_id" | "_creationTime"> {
  const { learnedRuleId, ...rest } = f;
  return {
    ...rest,
    caseId: f.caseId as Id<"cases">,
    chargeId: f.chargeId as Id<"charges">,
    factIds: f.factIds as Id<"facts">[],
    evidence: f.evidence.map((s) => ({ ...s, docId: s.docId as Id<"documents"> })),
    ...(learnedRuleId ? { learnedRuleId: learnedRuleId as Id<"learnedRules"> } : {}),
  };
}

const sameForwarder = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * The learned rules for a forwarder (R10). Matching is case-insensitive (SPEC §6), which the
 * by_forwarder_type index can't do, so this scans the table; it holds one row per forwarder + charge type.
 */
async function rulesFor(ctx: MutationCtx, forwarder: string | undefined) {
  if (!forwarder) return [];
  return (await ctx.db.query("learnedRules").collect()).filter((r) => sameForwarder(r.forwarder, forwarder));
}

/**
 * Steps 3-5 of the SPEC §4 pipeline: reconcile -> findings revision N+1 -> diff in a `recomputed`
 * event -> schedule planQuestion if a waiting line has no question yet. Runs inside the caller's
 * transaction, so a change and its recompute land together.
 */
async function recompute(ctx: MutationCtx, caseId: Id<"cases">, causeEventId?: Id<"events">) {
  const c = await ctx.db.get(caseId);
  if (!c) return null;
  const documents = await ctx.db.query("documents").withIndex("by_case", (q) => q.eq("caseId", caseId)).collect();
  const facts = await ctx.db.query("facts").withIndex("by_case", (q) => q.eq("caseId", caseId)).collect();
  const charges = await ctx.db.query("charges").withIndex("by_case", (q) => q.eq("caseId", caseId)).collect();
  const questions = await ctx.db.query("questions").withIndex("by_case", (q) => q.eq("caseId", caseId)).collect();
  const prior = await ctx.db.query("findings")
    .withIndex("by_case_rev", (q) => q.eq("caseId", caseId).eq("revision", c.revision)).collect();

  const learnedRules = await rulesFor(ctx, c.forwarder);
  const next = reconcile({ case: c, facts, charges, prior, documents, learnedRules });
  const revision = c.revision + 1;
  for (const f of next) await ctx.db.insert("findings", toRow(f));
  await ctx.db.patch(caseId, { revision });

  // Without an explicit cause (e.g. the first run after seeding), the latest event on the case is it.
  const cause = causeEventId
    ?? (await ctx.db.query("events").withIndex("by_case_at", (q) => q.eq("caseId", caseId)).order("desc").first())?._id;
  const changes = diffFindings(prior, next, cause ?? "");
  await logEvent(ctx, caseId, "system", "recomputed", { revision, causedByEventId: cause, changes });

  // Never ask twice about a line: open questions and ones closed unresolved (after the one follow-up) both cover it.
  const covered = new Set(questions.filter((q) => q.status !== "answered").flatMap((q) => q.findingKeys));
  if (next.some((f) => f.status === "needs_review" && !covered.has(f.key))) {
    await ctx.scheduler.runAfter(0, internal.ai.planQuestion, { caseId });
  }
  return { revision, changes: changes.length };
}

// null when the case doesn't exist; otherwise the new revision and how many lines changed.
const recomputeResult = v.union(v.null(), v.object({ revision: v.number(), changes: v.number() }));

// Called after any change: new document facts, a reply's facts, a learned rule saved or undone.
export const processChange = internalMutation({
  args: { caseId: v.id("cases"), eventId: v.optional(v.id("events")) },
  returns: recomputeResult,
  handler: async (ctx, { caseId, eventId }) => await recompute(ctx, caseId, eventId),
});

/**
 * SPEC §4 step 6: a learned rule saved or undone recomputes every open case of that forwarder, so the
 * other tab updates live. saveLearnedRule / undoLearnedRule (convex/learnedRules.ts) call this with their
 * rule_learned / rule_undone event. Approved cases are closed and left alone.
 */
export const recomputeForwarder = internalMutation({
  args: { forwarder: v.string(), eventId: v.optional(v.id("events")) },
  returns: v.number(),
  handler: async (ctx, { forwarder, eventId }) => {
    const open = (await ctx.db.query("cases").collect())
      .filter((c) => c.status !== "approved" && c.forwarder !== undefined && sameForwarder(c.forwarder, forwarder));
    for (const c of open) await recompute(ctx, c._id, eventId);
    return open.length;
  },
});

// ---- Agree / Not an issue (SPEC §6 verdicts, §8 item 4) ----

// Verdict buttons only show on To dispute and Waiting lines (SPEC §8), so cleared lines are refused.
const VERDICT_STATUSES: ReadonlySet<Status> = new Set(["potential_discrepancy", "invoice_noncompliance", "needs_review"]);

async function setVerdict(
  ctx: MutationCtx,
  args: { role: Role; personId?: string; caseId: Id<"cases">; key: string },
  verdict: "confirmed" | "false_positive",
) {
  checkActor(args.role, args.personId, "clerk");
  const c = await ctx.db.get(args.caseId);
  if (!c) throw new ConvexError("Case not found");
  const latest = await ctx.db.query("findings")
    .withIndex("by_case_rev", (q) => q.eq("caseId", args.caseId).eq("revision", c.revision)).collect();
  const finding = latest.find((f) => f.key === args.key);
  if (!finding) throw new ConvexError("Line not found in the latest findings");
  if (!VERDICT_STATUSES.has(finding.status)) throw new ConvexError("This line is already cleared");

  await ctx.db.patch(finding._id, { userVerdict: verdict, userVerdictBy: args.role });
  await logEvent(ctx, args.caseId, args.role, verdict === "confirmed" ? "finding_confirmed" : "finding_dismissed", {
    key: finding.key, lineNo: finding.lineNo, revision: c.revision, personId: args.personId,
  });
  return finding._id;
}

const verdictArgs = { role, personId, caseId: v.id("cases"), key: v.string() };

export const confirmFinding = mutation({
  args: verdictArgs,
  returns: v.id("findings"),
  handler: async (ctx, args) => await setVerdict(ctx, args, "confirmed"),
});

export const dismissFinding = mutation({
  args: verdictArgs,
  returns: v.id("findings"),
  // TODO(Pranav): call saveLearnedRule (convex/learnedRules.ts, SPEC §5.3) from here once it exists, then recompute.
  handler: async (ctx, args) => await setVerdict(ctx, args, "false_positive"),
});

// ---- Line editor (SPEC §8 item 9) ----

export const editCharge = mutation({
  args: {
    role, personId, caseId: v.id("cases"), chargeId: v.id("charges"),
    amountCents: v.optional(v.number()), description: v.optional(v.string()),
  },
  returns: recomputeResult,
  handler: async (ctx, { role: actor, personId: person, caseId, chargeId, amountCents, description }) => {
    checkActor(actor, person, "clerk");
    const charge = await ctx.db.get(chargeId);
    if (!charge || charge.caseId !== caseId) throw new ConvexError("Line not found on this case");
    if (amountCents === undefined && description === undefined) throw new ConvexError("Nothing to change");
    if (amountCents !== undefined && (!Number.isSafeInteger(amountCents) || amountCents < 0)) {
      throw new ConvexError("Amount must be a whole number of cents, zero or more");
    }
    if (description !== undefined && description.trim() === "") throw new ConvexError("Description is empty");

    const after = { ...(amountCents !== undefined && { amountCents }), ...(description !== undefined && { description }) };
    const before = {
      ...(amountCents !== undefined && { amountCents: charge.amountCents }),
      ...(description !== undefined && { description: charge.description }),
    };
    await ctx.db.patch(chargeId, { ...after, editedBy: actor });
    const eventId = await logEvent(ctx, caseId, actor, "charge_edited", {
      chargeId, lineNo: charge.lineNo, before, after, personId: person,
    });
    return await recompute(ctx, caseId, eventId);
  },
});
