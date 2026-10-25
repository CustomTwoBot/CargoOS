// Thread inputs for tests: Scenario A with a dispute drafted on this device, and a CaseContext
// built the way the workspace builds one. Synthetic data.
import { buildInput, type CaseActions, type CaseLocal } from "@/components/case/case-store";
import type { DemoCase } from "@/components/case/demo-case";
import { SCENARIO_A, scenarioADraft } from "@/components/case/fixture";
import type { CaseContext } from "@/components/case/panes";
import type { CaseEvent, Draft, Person } from "@/lib/types";

const fresh = (stage: string): CaseLocal => ({ stage, replaying: false, verdicts: {}, drafts: [], added: [], edits: {}, log: [] });

/** Scenario A's local state after the answer, with its dispute requested (by `requestedBy`) and then decided. */
export function draftLocal(status: Draft["status"], requestedBy?: string, extra: Partial<Draft> = {}): CaseLocal {
  const d: Draft = { ...scenarioADraft(), status, ...(requestedBy && { requestedBy }), ...extra };
  const ev = (n: number, at: string, type: CaseEvent["type"], payload: Record<string, unknown>): CaseEvent =>
    ({ _id: `local_${n}`, caseId: "case_A", at, actor: "clerk", type, payload: { draftId: d._id, ...payload } });
  const log = [
    ev(1, "2026-10-24T14:06:02-07:00", "draft_created", {}),
    ev(2, "2026-10-24T14:07:02-07:00", "approval_requested", { personId: requestedBy ?? "sam" }),
    ...(status === "approved" ? [ev(3, "2026-10-24T14:10:00-07:00", "approved", { personId: "sam" })] : []),
    ...(status === "rejected" ? [ev(3, "2026-10-24T14:10:00-07:00", "draft_rejected", { personId: "sam", reason: extra.rejectionReason })] : []),
  ];
  return { ...fresh("after"), drafts: [d], log };
}

/** Scenario A after the answer as a screen receives it, with that dispute. */
export const withDraft = (status: Draft["status"], requestedBy?: string, extra: Partial<Draft> = {}) =>
  buildInput(SCENARIO_A, draftLocal(status, requestedBy, extra));

/** Actions that do nothing; tests replace the ones they watch. */
export const noActions = (): CaseActions => ({
  reset: () => {}, reply: () => {}, verdict: () => {}, draftDispute: () => undefined, accept: () => {}, reject: () => {},
  editMessage: () => {}, addEvidence: () => ({ kind: "replay" }), saveLine: () => {},
});

/** A case context for one person at one stage (or with a given local state). */
export function ctxFor(viewer: Person, local: CaseLocal | string, demo: DemoCase = SCENARIO_A, actions: Partial<CaseActions> = {}): CaseContext {
  const l = typeof local === "string" ? fresh(local) : local;
  return { demo, x: buildInput(demo, l), local: l, actions: { ...noActions(), ...actions }, viewer, now: null, forwarder: "Pacific Crest Logistics" };
}
