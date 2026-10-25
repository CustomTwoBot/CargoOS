// Dispute approval (SPEC.md 5.3, 9 W4 step 13; CLAUDE.md rule 8): the bookkeeper requests, the owner accepts or
// rejects. Only a person holding "controller" who is not the requester decides; any other attempt writes
// approval_blocked and changes nothing. Accepting has CargoOS draft the seller message (convex/ai.ts draftDispute,
// code inserts every number). Every change writes an event. Nothing is ever sent or paid.
import { ConvexError, v } from "convex/values";
import { disputedFindings } from "../lib/ai/draftDispute";
import { caseTotals } from "../lib/engine/totals";
import { holdsRole } from "../lib/people";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, type MutationCtx } from "./_generated/server";

const now = () => new Date().toISOString();

async function logEvent(
  ctx: MutationCtx, caseId: Id<"cases">, actor: Doc<"events">["actor"], type: Doc<"events">["type"], payload: Record<string, unknown>,
) {
  return await ctx.db.insert("events", { caseId, at: now(), actor, type, payload });
}

const decision = v.union(v.object({ ok: v.literal(true) }), v.object({ ok: v.literal(false), reason: v.string() }));
type Decision = { ok: true } | { ok: false; reason: string };

async function pendingDraft(ctx: MutationCtx, draftId: Id<"drafts">) {
  const draft = await ctx.db.get(draftId);
  if (!draft) throw new ConvexError("Draft not found");
  if (draft.status !== "pending_approval") throw new ConvexError("This dispute is not waiting for approval");
  return draft;
}

/** The server-side approval gate. On a refusal it writes approval_blocked; the caller then changes nothing. */
async function checkDecider(ctx: MutationCtx, draft: Doc<"drafts">, personId: string, action: "approve" | "reject") {
  const reason = !holdsRole(personId, "controller") ? "Requires the owner"
    : personId === draft.requestedBy ? "The requester can't approve their own request"
    : null;
  if (reason) await logEvent(ctx, draft.caseId, "system", "approval_blocked", { draftId: draft._id, personId, action, reason });
  return reason;
}

// Bookkeeper: "Request approval". The message itself is drafted only after the owner accepts.
export const requestApproval = mutation({
  args: { caseId: v.id("cases"), personId: v.string() },
  returns: v.id("drafts"),
  handler: async (ctx, { caseId, personId }) => {
    if (!holdsRole(personId, "clerk")) throw new ConvexError(`${personId} does not hold the clerk role`);
    const c = await ctx.db.get(caseId);
    if (!c) throw new ConvexError("Case not found");
    const drafts = await ctx.db.query("drafts").withIndex("by_case", (q) => q.eq("caseId", caseId)).collect();
    const pending = drafts.find((d) => d.status === "pending_approval");
    if (pending) return pending._id;
    if (drafts.some((d) => d.status === "approved")) throw new ConvexError("This dispute is already approved");

    const findings = await ctx.db.query("findings")
      .withIndex("by_case_rev", (q) => q.eq("caseId", caseId).eq("revision", c.revision)).collect();
    const findingKeys = disputedFindings(findings).map((f) => f.key);
    if (findingKeys.length === 0) throw new ConvexError("Nothing is at stake, so there is nothing to dispute");
    const totalDisputedCents = caseTotals(findings).atStake;

    const draftId = await ctx.db.insert("drafts", {
      caseId, to: "forwarder", subject: "", body: "", findingKeys, totalDisputedCents,
      status: "pending_approval", createdBy: "clerk", requestedBy: personId,
    });
    await ctx.db.patch(caseId, { status: "ready_for_approval" });
    await logEvent(ctx, caseId, "clerk", "approval_requested", { draftId, personId, findingKeys, totalDisputedCents, revision: c.revision });
    return draftId;
  },
});

// Owner: "Accept". Drafts the seller message into this draft in the background; nothing is sent.
export const approveDraft = mutation({
  args: { draftId: v.id("drafts"), personId: v.string() },
  returns: decision,
  handler: async (ctx, { draftId, personId }): Promise<Decision> => {
    const draft = await pendingDraft(ctx, draftId);
    const blocked = await checkDecider(ctx, draft, personId, "approve");
    if (blocked) return { ok: false, reason: blocked };

    await ctx.db.patch(draftId, { status: "approved", approvedBy: personId });
    await ctx.db.patch(draft.caseId, { status: "approved" });
    await logEvent(ctx, draft.caseId, "controller", "approved", { draftId, personId });
    await ctx.scheduler.runAfter(0, internal.ai.draftDispute, { caseId: draft.caseId, role: "controller", draftId });
    return { ok: true };
  },
});

// Owner: "Reject" with a reason. Goes back to the bookkeeper, who can request again.
export const rejectDraft = mutation({
  args: { draftId: v.id("drafts"), personId: v.string(), reason: v.string() },
  returns: decision,
  handler: async (ctx, { draftId, personId, reason }): Promise<Decision> => {
    const draft = await pendingDraft(ctx, draftId);
    const blocked = await checkDecider(ctx, draft, personId, "reject");
    if (blocked) return { ok: false, reason: blocked };
    const why = reason.trim();
    if (why === "") throw new ConvexError("A reason is required to reject");

    await ctx.db.patch(draftId, { status: "rejected", rejectedBy: personId, rejectionReason: why });
    await ctx.db.patch(draft.caseId, { status: "open" });
    await logEvent(ctx, draft.caseId, "controller", "draft_rejected", { draftId, personId, reason: why });
    return { ok: true };
  },
});
