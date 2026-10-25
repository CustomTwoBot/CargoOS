// The live case as the screen sees it: a `DemoCase` whose only snapshot is what Convex returns now,
// plus the seller-message wording the server can't store yet. Pure, so it is tested on its own.
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

/** The owner's edits to the seller message, by draft. The server has no mutation for them yet, so they stay on this screen. */
export type Wording = Record<string, { subject: string; editedBody: string }>;

/** Server drafts with this screen's edited wording on top. Status, requester and decisions are the server's. */
export function withWording(x: CaseInput, wording: Wording): CaseInput {
  if (!x.drafts.some((d) => wording[d._id])) return x;
  return { ...x, drafts: x.drafts.map((d) => ({ ...d, ...wording[d._id] })) };
}
