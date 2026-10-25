// Live mode (SPEC W3 step 8): the Scenario A case from Convex, shaped as the case screen receives it, and its
// actions as mutations, each acted on as the device's person. The backend holds the real state, so the
// CaseLocal is empty; only the wait after a reply or a pasted document (shown as the usual "rechecking") and the
// owner's edits to the seller message are kept here.
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { ConvexError } from "convex/values";
import { useMemo, useState } from "react";
import type { Person } from "@/lib/types";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { NewEvidence } from "@/components/inputs/evidence-input";
import { OWNER, firstName } from "@/components/shell/person";
import type { CaseActions, CaseLocal, Toast } from "./case-store";
import type { DemoCase } from "./demo-case";
import { latestDraft, type CaseInput } from "./view-model";

/** What api.cases.getCaseView returns for a case that exists. */
export type CaseView = NonNullable<FunctionReturnType<typeof api.cases.getCaseView>>;

/** getCaseView → the case as the screen receives it. Convex ids are strings; the one latest draft is the list. */
export function caseInputOf(view: CaseView): CaseInput {
  return {
    case: view.case, documents: view.documents, facts: view.facts, charges: view.charges, findings: view.findings,
    questions: view.questions, replies: view.replies, drafts: view.draft ? [view.draft] : [], events: view.events,
  };
}

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

/** The live case as a DemoCase: one "live" snapshot, no recorded answers. */
export function liveDemoCase(x: CaseInput): DemoCase {
  return {
    id: x.case._id, title: x.case.title, live: true,
    summary: `${plural(x.charges.length, "charge")}, checked live`,
    start: "live", end: "live", stages: ["live"],
    at: () => x, answers: {}, draft: (y) => latestDraft(y),
  };
}

/** A reply waits for the next revision; a pasted document until it is read. A failure ends the wait too. */
export type Waiting =
  | { kind: "revision"; from: number; failures: number }
  | { kind: "document"; docId: string; failures: number };

const failures = (x: CaseInput) => x.events.filter((e) => e.type === "extraction_failed").length;

export function stillWaiting(x: CaseInput, w: Waiting): boolean {
  if (failures(x) > w.failures) return false;
  if (w.kind === "revision") return x.case.revision <= w.from;
  return x.documents.find((d) => d._id === w.docId)?.readStatus === "reading";
}

/** The words of a refused mutation: ConvexError data when it is text, the error message otherwise. */
export function errorText(e: unknown): string {
  if (e instanceof ConvexError) return typeof e.data === "string" ? e.data : e.message;
  return e instanceof Error ? e.message : String(e);
}

const KIND_TITLE: Record<NewEvidence["type"], string> = { email: "Email", chat: "Chat", other: "Note" };

type Decision = { ok: true } | { ok: false; reason: string };
type Message = { subject: string; body: string };

export type LiveCase = { demo: DemoCase; x: CaseInput; local: CaseLocal; actions: CaseActions };

/** A seeded demo case (Scenario A unless `shipmentRef` names another), or undefined while loading and when the backend has none. */
export function useLiveCase(person: Person, toast: Toast, shipmentRef?: string): LiveCase | undefined {
  const caseId = useQuery(api.cases.getDemoCase, shipmentRef ? { shipmentRef } : {});
  return useLiveCaseById(caseId ?? undefined, person, toast);
}

/** Any live case by its Convex id (a case created on /bills/new), or undefined while loading or missing. */
export function useLiveCaseById(caseId: Id<"cases"> | undefined, person: Person, toast: Toast): LiveCase | undefined {
  const view = useQuery(api.cases.getCaseView, caseId ? { caseId } : "skip");
  const submitReply = useMutation(api.ai.submitReply);
  const confirmFinding = useMutation(api.pipeline.confirmFinding);
  const dismissFinding = useMutation(api.pipeline.dismissFinding);
  const requestApproval = useMutation(api.drafts.requestApproval);
  const approveDraft = useMutation(api.drafts.approveDraft);
  const rejectDraft = useMutation(api.drafts.rejectDraft);
  const editCharge = useMutation(api.pipeline.editCharge);
  const addPastedText = useMutation(api.uploads.addPastedText);
  const resetLiveDemo = useMutation(api.seed.resetLiveDemo);
  const undoLearnedRule = useMutation(api.learnedRules.undoLearnedRule);
  const [waiting, setWaiting] = useState<Waiting>();
  // No backend stores the owner's edited wording yet, so the edits stay on this screen until a reset.
  const [messages, setMessages] = useState<Record<string, Message>>({});
  // One object per change of the case or this screen's waits, so pages and effects can compare it.
  return useMemo(() => {
    if (!caseId || !view) return undefined;

    const base = caseInputOf(view);
    const x: CaseInput = {
      ...base,
      drafts: base.drafts.map((d) => (messages[d._id] ? { ...d, subject: messages[d._id].subject, editedBody: messages[d._id].body } : d)),
    };
    const id = view.case._id, personId = person.id;

    /** Runs a mutation and what follows it; any error is toasted, never thrown or left unhandled. */
    const run = <T>(start: () => Promise<T>, done?: (r: T) => void, failed?: () => void) => {
      void (async () => {
        try {
          // Not `done?.(await start())`: with no `done`, optional chaining would skip the mutation too.
          const result = await start();
          done?.(result);
        } catch (e) {
          failed?.();
          toast(errorText(e));
        }
      })();
    };
    const decided = (ok: string) => (r: Decision | undefined) => {
      if (!r) return;
      toast(r.ok ? ok : r.reason);
    };

    const actions: CaseActions = {
      reset: () => {
        setWaiting(undefined);
        setMessages({});
        // Each demo bill resets only itself; any other case is refused by the server.
        run(() => resetLiveDemo({ personId, shipmentRef: view.case.shipmentRef }));
      },

      reply: (questionId, text) => {
        setWaiting({ kind: "revision", from: x.case.revision, failures: failures(x) });
        run(() => submitReply({ role: "ops_lead", personId, questionId: questionId as Id<"questions">, text }), undefined, () => setWaiting(undefined));
      },

      verdict: (key, v) => {
        const args = { role: "clerk" as const, personId, caseId: id, key };
        run(() => (v === "confirmed" ? confirmFinding(args) : dismissFinding(args)),
          () => toast(v === "confirmed" ? "Kept in dispute. Saved to case history." : "Marked as not an issue. Saved to case history."));
      },

      // The draft arrives through getCaseView; the owner decides it (CLAUDE.md rule 8).
      draftDispute: () => {
        run(() => requestApproval({ caseId: id, personId }), () => toast(`Approval requested from ${firstName(OWNER)}. Nothing was sent.`));
        return undefined;
      },

      accept: (draftId) => run(() => approveDraft({ draftId: draftId as Id<"drafts">, personId }), decided("Accepted. Nothing was sent.")),

      reject: (draftId, reason) =>
        run(() => rejectDraft({ draftId: draftId as Id<"drafts">, personId, reason }), decided("Rejected. Nothing went to the seller.")),

      editMessage: (draftId, text) => setMessages((m) => ({ ...m, [draftId]: text })),

      addEvidence: (e) => {
        const before = failures(x);
        run(() => addPastedText({ caseId: id, personId, text: e.text, docType: e.type, title: `${KIND_TITLE[e.type]} you added` }),
          (docId) => setWaiting({ kind: "document", docId, failures: before }));
        return { kind: "live" };
      },

      saveLine: (key, change) => {
        const chargeId = (x.findings.find((f) => f.key === key)?.chargeId ?? key) as Id<"charges">;
        run(() => editCharge({ role: "clerk", personId, caseId: id, chargeId, amountCents: change.amountCents, description: change.description }));
      },

      undoRule: (ruleId) => run(() => undoLearnedRule({ ruleId: ruleId as Id<"learnedRules">, personId }),
        () => toast("Rule undone. The line is checked again without it.")),
    };

    const local: CaseLocal = {
      stage: "live", replaying: !!waiting && stillWaiting(x, waiting), verdicts: {}, drafts: [], added: [], edits: {}, log: [],
    };
    return { demo: liveDemoCase(x), x, local, actions };
  }, [caseId, view, waiting, messages, person.id, toast, submitReply, confirmFinding, dismissFinding,
    requestApproval, approveDraft, rejectDraft, editCharge, addPastedText, resetLiveDemo, undoLearnedRule]);
}
