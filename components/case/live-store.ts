// Live mode (SPEC W3 step 8): the Scenario A case from Convex, shaped as the case screen receives it, and its
// actions as mutations, each acted on as the device's person. The backend holds the real state, so the
// CaseLocal is empty; only the wait after a reply or a pasted document (shown as the usual "rechecking") and the
// owner's edits to the seller message are kept here.
import { useMutation, useQueries, useQuery } from "convex/react";
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

/** The mutations a live case's actions call; one set serves every live case on the screen. */
function useLiveMutations() {
  return {
    submitReply: useMutation(api.ai.submitReply),
    confirmFinding: useMutation(api.pipeline.confirmFinding),
    dismissFinding: useMutation(api.pipeline.dismissFinding),
    requestApproval: useMutation(api.drafts.requestApproval),
    approveDraft: useMutation(api.drafts.approveDraft),
    rejectDraft: useMutation(api.drafts.rejectDraft),
    editCharge: useMutation(api.pipeline.editCharge),
    addPastedText: useMutation(api.uploads.addPastedText),
    resetLiveDemo: useMutation(api.seed.resetLiveDemo),
  };
}
type Mutations = ReturnType<typeof useLiveMutations>;

/** What a live case keeps on this screen: the wait after a reply or a paste, and the owner's edited wording. */
type ScreenState = {
  waiting: Waiting | undefined; setWaiting: (w: Waiting | undefined) => void;
  messages: Record<string, Message>; setMessages: (f: (m: Record<string, Message>) => Record<string, Message>) => void;
};

/**
 * One live case from its view: the CaseInput with this screen's edited wording, and its actions as mutations.
 * `resettable` is the Scenario A case, whose reset is resetLiveDemo; the other seeded cases have no reset.
 */
function liveCaseOf(view: CaseView, person: Person, toast: Toast, m: Mutations, s: ScreenState, resettable: boolean): LiveCase {
  const base = caseInputOf(view);
  const x: CaseInput = {
    ...base,
    drafts: base.drafts.map((d) => (s.messages[d._id] ? { ...d, subject: s.messages[d._id].subject, editedBody: s.messages[d._id].body } : d)),
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
      s.setWaiting(undefined);
      s.setMessages(() => ({}));
      if (resettable) run(() => m.resetLiveDemo({ personId }));
    },

    reply: (questionId, text) => {
      s.setWaiting({ kind: "revision", from: x.case.revision, failures: failures(x) });
      run(() => m.submitReply({ role: "ops_lead", personId, questionId: questionId as Id<"questions">, text }), undefined, () => s.setWaiting(undefined));
    },

    verdict: (key, v) => {
      const args = { role: "clerk" as const, personId, caseId: id, key };
      run(() => (v === "confirmed" ? m.confirmFinding(args) : m.dismissFinding(args)),
        () => toast(v === "confirmed" ? "Kept in dispute. Saved to case history." : "Marked as not an issue. Saved to case history."));
    },

    // The draft arrives through getCaseView; the owner decides it (CLAUDE.md rule 8).
    draftDispute: () => {
      run(() => m.requestApproval({ caseId: id, personId }), () => toast(`Approval requested from ${firstName(OWNER)}. Nothing was sent.`));
      return undefined;
    },

    accept: (draftId) => run(() => m.approveDraft({ draftId: draftId as Id<"drafts">, personId }), decided("Accepted. Nothing was sent.")),

    reject: (draftId, reason) =>
      run(() => m.rejectDraft({ draftId: draftId as Id<"drafts">, personId, reason }), decided("Rejected. Nothing went to the seller.")),

    editMessage: (draftId, text) => s.setMessages((all) => ({ ...all, [draftId]: text })),

    addEvidence: (e) => {
      const before = failures(x);
      run(() => m.addPastedText({ caseId: id, personId, text: e.text, docType: e.type, title: `${KIND_TITLE[e.type]} you added` }),
        (docId) => s.setWaiting({ kind: "document", docId, failures: before }));
      return { kind: "live" };
    },

    saveLine: (key, change) => {
      const chargeId = (x.findings.find((f) => f.key === key)?.chargeId ?? key) as Id<"charges">;
      run(() => m.editCharge({ role: "clerk", personId, caseId: id, chargeId, amountCents: change.amountCents, description: change.description }));
    },
  };

  const local: CaseLocal = {
    stage: "live", replaying: !!s.waiting && stillWaiting(x, s.waiting), verdicts: {}, drafts: [], added: [], edits: {}, log: [],
  };
  return { demo: liveDemoCase(x), x, local, actions };
}

/** The live Scenario A case, or undefined while loading and when the backend has none. */
export function useLiveCase(person: Person, toast: Toast): LiveCase | undefined {
  const caseId = useQuery(api.cases.getDemoCase);
  const view = useQuery(api.cases.getCaseView, caseId ? { caseId } : "skip");
  const m = useLiveMutations();
  const [waiting, setWaiting] = useState<Waiting>();
  // No backend stores the owner's edited wording yet, so the edits stay on this screen until a reset.
  const [messages, setMessages] = useState<Record<string, Message>>({});
  if (!caseId || !view) return undefined;
  return liveCaseOf(view, person, toast, m, { waiting, setWaiting, messages, setMessages }, true);
}

/**
 * Every other case in the backend (the seeded design cases, cases made by uploads), in the order
 * listCaseIds gives, each with its own actions. Empty while loading or when there are none.
 */
export function useOtherLiveCases(person: Person, toast: Toast): LiveCase[] {
  const demoId = useQuery(api.cases.getDemoCase);
  const ids = useQuery(api.demoCases.listCaseIds);
  const key = (ids ?? []).filter((id) => id !== demoId).join(",");
  // One request object per list, not per render: useQueries resubscribes whenever it gets a new one.
  const requests = useMemo(() => Object.fromEntries(key.split(",").filter(Boolean)
    .map((id) => [id, { query: api.cases.getCaseView, args: { caseId: id as Id<"cases"> } }])), [key]);
  const views = useQueries(requests);
  const others = Object.keys(requests);
  const m = useLiveMutations();
  const [waiting, setWaiting] = useState<Record<string, Waiting | undefined>>({});
  const [messages, setMessages] = useState<Record<string, Message>>({});
  return others.flatMap((id) => {
    const view = views[id] as CaseView | null | undefined | Error;
    if (!view || view instanceof Error) return [];
    return [liveCaseOf(view, person, toast, m, {
      waiting: waiting[id], setWaiting: (w) => setWaiting((all) => ({ ...all, [id]: w })), messages, setMessages,
    }, false)];
  });
}
