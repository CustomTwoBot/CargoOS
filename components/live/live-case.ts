// The live case as the screen sees it: a `DemoCase` whose only snapshot is what Convex returns now,
// plus the decisions the server can't store yet, kept on this screen. Pure, so it is tested on its own.
import type { Draft, Finding } from "@/lib/types";
import type { CaseLocal } from "@/components/case/case-store";
import type { DemoCase } from "@/components/case/demo-case";
import { DISCREPANCY } from "@/components/case/totals";
import { totalsOf, type CaseInput } from "@/components/case/view-model";

export const LIVE_ID = "live";
export const LIVE_STAGE = "live";

/** A live case never replays: one fixed stage, nothing recorded. */
export const LIVE_LOCAL: CaseLocal = { stage: LIVE_STAGE, replaying: false, verdicts: {}, drafts: [], added: [], edits: {}, log: [] };

const disputed = (f: Finding) => DISCREPANCY.includes(f.status) && f.userVerdict !== "false_positive";

/**
 * The dispute the case could ask approval for: the latest draft unless it was rejected, else one
 * built from the disputed lines once no question is open. Totals are the engine's.
 */
export function disputeOf(x: CaseInput): Draft | undefined {
  const latest = x.drafts.at(-1);
  if (latest && latest.status !== "rejected") return latest;
  const atStake = totalsOf(x).atStakeCents;
  if (atStake <= 0 || x.questions.some((q) => q.status === "open")) return undefined;
  return {
    _id: `pending_${x.case._id}`, caseId: x.case._id, to: "forwarder", subject: "", body: "",
    findingKeys: x.findings.filter(disputed).map((f) => f.key), totalDisputedCents: atStake,
    status: "draft", createdBy: "clerk",
  };
}

export function liveDemo(x: CaseInput): DemoCase {
  return {
    id: LIVE_ID, title: x.case.title, summary: "Live: read from the uploaded documents",
    start: LIVE_STAGE, end: LIVE_STAGE, stages: [LIVE_STAGE], at: () => x, answers: {}, draft: disputeOf, live: true,
  };
}

/** What this screen did to a draft that the server can't record yet (SPEC §5.5 approvals pending). */
export type Decisions = Record<string, Partial<Draft> & { acceptedBy?: string; rejectedAt?: string }>;
/** Who asked for approval from this screen, and when: the server draft that appears after it is theirs. */
export type Requested = { by: string; at: number } | null;

/**
 * Server drafts as the views expect them. Until the server has `requestApproval`, a draft it holds
 * is a request waiting for the owner; this screen's own request and decisions are laid on top.
 */
export function withDecisions(x: CaseInput, decisions: Decisions, requested: Requested): CaseInput {
  if (!x.drafts.length) return x;
  return {
    ...x,
    drafts: x.drafts.map((d) => {
      const created = (d as { _creationTime?: number })._creationTime ?? 0;
      const mine = !d.requestedBy && requested && created >= requested.at - 2000 ? { requestedBy: requested.by } : {};
      const status = d.status === "draft" ? "pending_approval" as const : d.status;
      return { ...d, status, ...mine, ...decisions[d._id] };
    }),
  };
}
