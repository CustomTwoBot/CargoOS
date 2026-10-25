// Reads the live Scenario A case from Convex and turns the screen's actions into its mutations
// (SPEC W3 step 8). Each action passes its own role and the device's person; the server checks both.
// Approvals, the seller message and uploads have no mutations yet, so those stay on this screen.
import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { useState } from "react";
import type { Person } from "@/lib/types";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { CaseActions, CaseLocal, Toast } from "@/components/case/case-store";
import type { DemoCase } from "@/components/case/demo-case";
import type { CaseInput } from "@/components/case/view-model";
import { LIVE_LOCAL, liveDemo, withDecisions, type Decisions, type Requested } from "./live-case";
import { toCaseInput } from "./to-input";

export type LiveCase = {
  demo: DemoCase; input: CaseInput; local: CaseLocal;
  /** The case's actions, toasting through the screen's own toasts. */
  actionsWith: (toast: Toast) => CaseActions;
};

/** `loading` until Convex answers; `missing` when the demo case isn't seeded (run seed:resetDemo). */
export type LiveState = { status: "loading" } | { status: "missing" } | { status: "ready"; live: LiveCase };

const failure = (e: unknown) => (e instanceof ConvexError && typeof e.data === "string" ? e.data : "That didn't go through. Try again.");

export function useLiveCase(viewer: Person): LiveState {
  const caseId = useQuery(api.cases.getDemoCase);
  const view = useQuery(api.cases.getCaseView, caseId ? { caseId } : "skip");
  const submitReply = useMutation(api.ai.submitReply);
  const confirmFinding = useMutation(api.pipeline.confirmFinding);
  const dismissFinding = useMutation(api.pipeline.dismissFinding);
  const editCharge = useMutation(api.pipeline.editCharge);
  const createDraft = useMutation(api.ai.createDraft);
  const resetDemo = useMutation(api.seed.resetDemo);
  const [decisions, setDecisions] = useState<Decisions>({});
  const [requested, setRequested] = useState<Requested>(null);

  if (caseId === undefined || (caseId && view === undefined)) return { status: "loading" };
  if (!caseId || !view) return { status: "missing" };

  const input = withDecisions(toCaseInput(view), decisions, requested);
  const personId = viewer.id;
  const decide = (draftId: string, d: Decisions[string]) => setDecisions((all) => ({ ...all, [draftId]: { ...all[draftId], ...d } }));

  const actionsWith = (toast: Toast): CaseActions => {
    const run = (p: Promise<unknown>, done?: string) => p.then(() => done && toast(done), (e) => toast(failure(e)));
    return {
      reset: () => {
        setDecisions({}); setRequested(null);
        void run(resetDemo({ personId }), "Demo reset. The case is back to its start.");
      },
      reply: (questionId, text) => {
        if (!text?.trim()) return;
        void run(submitReply({ role: "ops_lead", personId, questionId: questionId as Id<"questions">, text: text.trim() }),
          "Answer sent. CargoOS is rechecking the lines.");
      },
      verdict: (key, v) => {
        const args = { role: "clerk" as const, personId, caseId, key };
        void run(v === "confirmed" ? confirmFinding(args) : dismissFinding(args),
          v === "confirmed" ? "Kept in dispute. Saved to case history." : "Marked as not an issue. Saved to case history.");
      },
      draftDispute: () => {
        setRequested({ by: personId, at: Date.now() });
        void run(createDraft({ role: "clerk", personId, caseId }), "Approval requested. Nothing was sent.");
        return undefined;
      },
      accept: (draftId) => {
        decide(draftId, { status: "approved", approvedBy: personId, acceptedBy: personId });
        toast("Accepted. Nothing was sent.");
      },
      reject: (draftId, reason) => {
        decide(draftId, { status: "rejected", rejectedBy: personId, rejectedAt: new Date().toISOString(), rejectionReason: reason });
        toast("Rejected. Nothing went to the seller.");
      },
      editMessage: (draftId, t) => decide(draftId, { subject: t.subject, editedBody: t.body }),
      addEvidence: () => {
        toast("In this build, add documents from the phone uploader or the new case screen.");
        return { kind: "replay" };
      },
      saveLine: (key, change) => {
        const chargeId = input.findings.find((f) => f.key === key)?.chargeId ?? key;
        void run(editCharge({
          role: "clerk", personId, caseId, chargeId: chargeId as Id<"charges">,
          ...(change.amountCents !== undefined && { amountCents: change.amountCents }),
          ...(change.description !== undefined && { description: change.description }),
        }), "Line saved. CargoOS rechecked the case.");
      },
    };
  };

  return { status: "ready", live: { demo: liveDemo(input), input, local: LIVE_LOCAL, actionsWith } };
}
