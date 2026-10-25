// Reads the live Scenario A case from Convex and turns the screen's actions into its mutations
// (SPEC W3 step 8). Each action passes the device's person (and its role where the mutation takes
// one); the server checks both, including that the owner never decides a dispute they requested.
// Only the owner's edits to the seller message stay on this screen: there is no mutation for them yet.
import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { useState } from "react";
import type { Person } from "@/lib/types";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { CaseActions, CaseLocal, Toast } from "@/components/case/case-store";
import type { DemoCase } from "@/components/case/demo-case";
import type { CaseInput } from "@/components/case/view-model";
import { LIVE_LOCAL, liveDemo, withWording, type Wording } from "./live-case";
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
  const requestApproval = useMutation(api.drafts.requestApproval);
  const approveDraft = useMutation(api.drafts.approveDraft);
  const rejectDraft = useMutation(api.drafts.rejectDraft);
  const addPastedText = useMutation(api.uploads.addPastedText);
  const resetDemo = useMutation(api.seed.resetDemo);
  const [wording, setWording] = useState<Wording>({});

  if (caseId === undefined || (caseId && view === undefined)) return { status: "loading" };
  if (!caseId || !view) return { status: "missing" };

  const input = withWording(toCaseInput(view), wording);
  const personId = viewer.id;

  const actionsWith = (toast: Toast): CaseActions => {
    const run = (p: Promise<unknown>, done?: string) => p.then(() => done && toast(done), (e) => toast(failure(e)));
    /** Accept and reject come back refused (not thrown) when the server's gate says no; it logs approval_blocked. */
    const decide = (p: Promise<{ ok: true } | { ok: false; reason: string }>, done: string) =>
      p.then((r) => toast(r.ok ? done : `${r.reason}. Nothing changed.`), (e) => toast(failure(e)));
    return {
      reset: () => {
        setWording({});
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
      // The bookkeeper's "Request approval" (and Sam's "Draft dispute"): a request the owner decides.
      draftDispute: () => {
        void run(requestApproval({ caseId, personId }), "Approval requested. Nothing was sent.");
        return undefined;
      },
      accept: (draftId) => void decide(approveDraft({ draftId: draftId as Id<"drafts">, personId }),
        "Accepted. CargoOS is writing the message to the seller. Nothing was sent."),
      reject: (draftId, reason) => void decide(rejectDraft({ draftId: draftId as Id<"drafts">, personId, reason }),
        "Rejected. Nothing went to the seller."),
      editMessage: (draftId, t) => setWording((all) => ({ ...all, [draftId]: { subject: t.subject, editedBody: t.body } })),
      addEvidence: (e) => addPastedText({ caseId, personId, text: e.text, docType: e.type })
        .then(() => ({ kind: "reading" as const }), (err) => { toast(failure(err)); return { kind: "replay" as const }; }),
      saveLine: (key, change) => {
        const chargeId = input.findings.find((f) => f.key === key)?.chargeId ?? key;
        void run(editCharge({
          role: "clerk", personId, caseId, chargeId: chargeId as Id<"charges">,
          amountCents: change.amountCents, description: change.description,
        }), "Line saved. CargoOS rechecked the case.");
      },
    };
  };

  return { status: "ready", live: { demo: liveDemo(input), input, local: LIVE_LOCAL, actionsWith } };
}
