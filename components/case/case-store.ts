// Replay state for every case, held in one place so the case screens, the sidebar and the
// cross-case inboxes read and change the same thing. Each case is a DemoCase snapshot plus what
// the operator did on top of it (verdicts, drafts, added evidence, line edits, the event log).
// Live Convex data replaces this in SPEC W3 step 8; the actions keep the same names as the mutations.
import { useEffect, useMemo, useRef, useState } from "react";
import type { CaseEvent, Charge, Draft, Finding, Person, SourceDoc } from "@/lib/types";
import type { NewEvidence } from "@/components/inputs/evidence-input";
import type { LineChange } from "@/components/inputs/line-edit";
import type { DraftDecision } from "@/components/inboxes/people";
import { DEFAULT_PERSON, OWNER, firstName } from "@/components/shell/person";
import type { DemoCase } from "./demo-case";
import { ACTION_ROLE, type Action } from "./roles";
import type { CaseInput } from "./view-model";

export type Verdict = NonNullable<Finding["userVerdict"]>;

export type CaseLocal = {
  stage: string; moving?: string; replaying: boolean;
  verdicts: Record<string, Verdict>; drafts: (Draft & DraftDecision)[]; added: SourceDoc[];
  edits: Record<string, LineChange>; log: CaseEvent[];
};

const fresh = (demo: DemoCase): CaseLocal => ({
  stage: demo.start, replaying: false, verdicts: {}, drafts: [], added: [], edits: {}, log: [],
});

/** The case as a screen receives it: the snapshot with the operator's work applied. */
export function buildInput(demo: DemoCase, l: CaseLocal): CaseInput {
  const base = demo.at(l.stage);
  return {
    ...base,
    documents: [...base.documents, ...l.added],
    charges: base.charges.map((c): Charge => (l.edits[c._id] ? { ...c, ...l.edits[c._id], editedBy: ACTION_ROLE.editCharge } : c)),
    findings: base.findings.map((f) => (l.verdicts[f.key] && f.revision === base.case.revision
      ? { ...f, userVerdict: l.verdicts[f.key], userVerdictBy: ACTION_ROLE[l.verdicts[f.key] === "confirmed" ? "confirm" : "dismiss"] }
      : f)),
    drafts: l.drafts,
    events: [...base.events, ...l.log],
  };
}

const KIND_TITLE: Record<NewEvidence["type"], string> = { email: "Email", chat: "Chat", other: "Note" };

export type Toast = (text: string, undo?: () => void) => void;

export type CaseActions = {
  reset: (stage: string) => void;
  /** Replay plays the recorded answer and ignores `text`; live mode sends it. */
  reply: (questionId: string, text: string) => void;
  verdict: (key: string, v: Verdict) => void;
  draftDispute: () => Draft | undefined;
  accept: (draftId: string) => void;
  reject: (draftId: string, reason: string) => void;
  editMessage: (draftId: string, text: { subject: string; body: string }) => void;
  addEvidence: (e: NewEvidence) => { kind: "replay" } | { kind: "live" };
  saveLine: (key: string, change: LineChange) => void;
};

const STEP_MS = 60_000;

/**
 * When something done now happens in the replay's story: a minute after the latest event, recorded
 * or local. The wall clock would put "Drafted at 11:42 PM" next to "Checked today at 1:55 PM".
 */
export function replayTime(demo: DemoCase, l: CaseLocal): string {
  const times = [...demo.at(l.stage).events, ...l.log].map((e) => Date.parse(e.at)).filter((t) => !Number.isNaN(t));
  return new Date((times.length ? Math.max(...times) : Date.now()) + STEP_MS).toISOString();
}

/**
 * Why `viewer` may not accept or reject this draft, or undefined when they may. Mirrors the server
 * rule (CLAUDE.md non-negotiable 8): only a controller decides, and never on their own request.
 */
export function decisionBlocked(viewer: Person, d: Pick<Draft, "requestedBy">): string | undefined {
  if (!viewer.roles.includes("controller")) return `Only ${firstName(OWNER)} can accept or reject a dispute.`;
  if (d.requestedBy === viewer.id) return "You requested this dispute. Another owner decides.";
  return undefined;
}

/**
 * Every case's replay state, acted on as `viewer` (the person this device is set to). Drafting by
 * someone who can't decide becomes a request for approval; decisions carry the viewer's id.
 */
export function useCaseStore(cases: DemoCase[], toast: Toast, viewer: Person = DEFAULT_PERSON) {
  const [state, setState] = useState<Record<string, CaseLocal>>(() => Object.fromEntries(cases.map((c) => [c.id, fresh(c)])));
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>[]>>({});
  useEffect(() => () => Object.values(timers.current).flat().forEach(clearTimeout), []);

  const inputs = useMemo(
    () => Object.fromEntries(cases.map((c) => [c.id, buildInput(c, state[c.id] ?? fresh(c))])) as Record<string, CaseInput>,
    [cases, state],
  );

  const patch = (id: string, fn: (l: CaseLocal) => CaseLocal) => setState((s) => ({ ...s, [id]: fn(s[id]) }));
  const event = (demo: DemoCase, l: CaseLocal, caseId: string, action: Action, type: CaseEvent["type"], payload: Record<string, unknown>): CaseEvent[] =>
    [...l.log, { _id: `local_${l.log.length + 1}`, caseId, at: replayTime(demo, l), actor: ACTION_ROLE[action], type, payload }];
  const clear = (id: string) => { (timers.current[id] ?? []).forEach(clearTimeout); timers.current[id] = []; };

  const actionsFor = (demo: DemoCase): CaseActions => {
    const id = demo.id, caseId = inputs[id].case._id;
    /** Refuses a decision the server would refuse: writes approval_blocked and says why. */
    const blocked = (draftId: string): boolean => {
      const d = inputs[id].drafts.find((x) => x._id === draftId);
      const reason = d && decisionBlocked(viewer, d);
      if (!reason) return false;
      patch(id, (l) => ({ ...l, log: event(demo, l, caseId, "approve", "approval_blocked", { draftId, personId: viewer.id, reason }) }));
      toast(reason);
      return true;
    };
    return {
      reset: (stage) => { clear(id); setState((s) => ({ ...s, [id]: { ...fresh(demo), stage } })); },

      reply: (questionId) => {
        const answer = demo.answers[questionId];
        if (!answer) return;
        clear(id);
        patch(id, (l) => ({ ...l, replaying: true }));
        const last = answer.beats.at(-1)?.at ?? 0;
        timers.current[id] = [
          ...answer.beats.map((b) => setTimeout(() => patch(id, (l) => ({ ...l, stage: b.stage, moving: b.moving })), b.at)),
          setTimeout(() => patch(id, (l) => ({ ...l, moving: undefined, replaying: false })), last + 1000),
        ];
      },

      verdict: (key, v) => {
        let before: Verdict | undefined;
        patch(id, (l) => {
          before = l.verdicts[key];
          return { ...l, verdicts: { ...l.verdicts, [key]: v },
            log: event(demo, l, caseId, v === "confirmed" ? "confirm" : "dismiss", v === "confirmed" ? "finding_confirmed" : "finding_dismissed", { findingKey: key }) };
        });
        toast(v === "confirmed" ? "Kept in dispute. Saved to case history." : "Marked as not an issue. Saved to case history.", () =>
          patch(id, (l) => {
            const verdicts = { ...l.verdicts };
            if (before) verdicts[key] = before; else delete verdicts[key];
            return { ...l, verdicts };
          }));
      },

      // An owner's draft goes straight up for their own decision (one person, as before). Anyone
      // else's draft is a request: it carries their id, and an owner decides.
      draftDispute: () => {
        const d = demo.draft(inputs[id]);
        if (!d) return undefined;
        const decides = viewer.roles.includes("controller");
        const draft: Draft = { ...d, status: "pending_approval", ...(!decides && { requestedBy: viewer.id }) };
        patch(id, (l) => {
          const log1 = event(demo, l, caseId, "draftDispute", "draft_created", { draftId: d._id, findingKeys: d.findingKeys, totalDisputedCents: d.totalDisputedCents });
          const log2 = event(demo, { ...l, log: log1 }, caseId, "requestApproval", "approval_requested", { draftId: d._id, personId: viewer.id });
          return { ...l, drafts: [...l.drafts.filter((x) => x._id !== d._id), draft], log: log2 };
        });
        toast(decides ? "Dispute drafted. Nothing was sent." : `Approval requested from ${firstName(OWNER)}. Nothing was sent.`);
        return draft;
      },

      accept: (draftId) => {
        if (blocked(draftId)) return;
        patch(id, (l) => ({ ...l,
          drafts: l.drafts.map((d) => (d._id === draftId ? { ...d, status: "approved", approvedBy: viewer.id, acceptedBy: viewer.id } : d)),
          log: event(demo, l, caseId, "approve", "approved", { draftId, personId: viewer.id }) }));
        toast("Accepted. Nothing was sent.");
      },

      reject: (draftId, reason) => {
        if (blocked(draftId)) return;
        patch(id, (l) => ({ ...l,
          drafts: l.drafts.map((d) => (d._id === draftId
            ? { ...d, status: "rejected", rejectedBy: viewer.id, rejectedAt: replayTime(demo, l), rejectionReason: reason } : d)),
          log: event(demo, l, caseId, "approve", "draft_rejected", { draftId, reason, personId: viewer.id }) }));
        toast("Rejected. Nothing went to the seller.");
      },

      editMessage: (draftId, text) => patch(id, (l) => ({ ...l,
        drafts: l.drafts.map((d) => (d._id === draftId ? { ...d, subject: text.subject, editedBody: text.body } : d)) })),

      addEvidence: (e) => {
        patch(id, (l) => {
          const doc: SourceDoc = {
            _id: `local_doc_${l.added.length + 1}`, caseId, type: e.type,
            title: `${KIND_TITLE[e.type]} you added`, sentAt: replayTime(demo, l), text: e.text,
          };
          return { ...l, added: [...l.added, doc], log: event(demo, l, caseId, "addEvidence", "doc_added", { docId: doc._id }) };
        });
        return { kind: "replay" };
      },

      saveLine: (key, change) => patch(id, (l) => ({ ...l, edits: { ...l.edits, [key]: change },
        log: event(demo, l, caseId, "editCharge", "charge_edited", { chargeId: key, description: change.description, amountCents: change.amountCents }) })),
    };
  };

  return { state, inputs, actionsFor };
}
