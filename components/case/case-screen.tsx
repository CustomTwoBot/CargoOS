"use client";
// The case app at 1280 (docs/design.md §0, layout A "tabs per issue"): an Overview tab plus one
// tab per thing to decide; Documents and History from the rail. Replay mode only for now:
// Scenario A from the fixture, actions change a local copy, and an answer replays the recorded
// run beat by beat (§9). Live Convex data replaces this in SPEC W3 step 8.
import { Tooltip } from "@base-ui/react/tooltip";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { CaseEvent, Charge, Draft, Finding, Role, SourceDoc } from "@/lib/types";
import { DocumentsView } from "@/components/documents/documents-view";
import { HistoryView } from "@/components/history/history-view";
import { EvidenceDrawer } from "@/components/inputs/evidence-drawer";
import type { NewEvidence } from "@/components/inputs/evidence-input";
import type { LineChange } from "@/components/inputs/line-edit";
import { TOASTS } from "@/components/states/copy";
import { QuietToast } from "@/components/states/quiet";
import { ToastRegion } from "@/components/states/shared";
import { CaseHeader, DraftButton, Rail, type View } from "./chrome";
import { cx } from "./cx";
import { scenarioAAt, scenarioADraft, type ReplayStage } from "./fixture";
import { changeNotes, clearedSummary, issuesOf, type Issue } from "./issues";
import { DisputeView, LineIssueView, QuestionView } from "./issue-views";
import { AtStakeCard } from "./overview";
import { AgreedCard, AllCharges, ChangedBanner, IssueList } from "./overview-tab";
import { ACTION_ROLE, ALL_ROLES, canAct, type Action } from "./roles";
import {
  casePill, checkedAgainst, checkedLine, countLine, isRechecking, latestDraft, latestQuestion, toRows, totalsOf,
  type CaseInput,
} from "./view-model";

type Verdict = NonNullable<Finding["userVerdict"]>;
type Toast = { id: number; text: string; undo?: () => void };

// The clock is read on the client only, so prerendering never bakes in a time ("today at …").
let clientNow: Date | undefined;
const useNow = () => useSyncExternalStore(() => () => {}, () => (clientNow ??= new Date()), () => null);

// Replay beats after "Reply" (docs/design.md §9): recheck, line 4 clears, line 6 joins the disputes.
const BEATS: { at: number; stage: ReplayStage; moving?: string; done?: boolean }[] = [
  { at: 1600, stage: "partial", moving: "cleared" },
  { at: 3200, stage: "after", moving: "chg_6" },
  { at: 4200, stage: "after", done: true },
];

const KIND_TITLE: Record<NewEvidence["type"], string> = { email: "Email", chat: "Chat", other: "Note" };

export function CaseScreen({ roles = ALL_ROLES }: { roles?: readonly Role[] }) {
  const [view, setView] = useState<View>("case");
  const [tab, setTab] = useState("overview");
  const [stage, setStage] = useState<ReplayStage>("before");
  const [moving, setMoving] = useState<string>();
  const [replaying, setReplaying] = useState(false);
  const [verdicts, setVerdicts] = useState<Record<string, Verdict>>({});
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [added, setAdded] = useState<SourceDoc[]>([]);
  const [edits, setEdits] = useState<Record<string, LineChange>>({});
  const [log, setLog] = useState<CaseEvent[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const clock = useNow();

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const x: CaseInput = useMemo(() => {
    const base = scenarioAAt(stage);
    return {
      ...base,
      documents: [...base.documents, ...added],
      charges: base.charges.map((c): Charge => (edits[c._id] ? { ...c, ...edits[c._id], editedBy: ACTION_ROLE.editCharge } : c)),
      findings: base.findings.map((f) => (verdicts[f.key] && f.revision === base.case.revision
        ? { ...f, userVerdict: verdicts[f.key], userVerdictBy: ACTION_ROLE[verdicts[f.key] === "confirmed" ? "confirm" : "dismiss"] }
        : f)),
      drafts,
      events: [...base.events, ...log],
    };
  }, [stage, verdicts, drafts, added, edits, log]);

  const record = (action: Action, type: CaseEvent["type"], payload: Record<string, unknown>) =>
    setLog((l) => [...l, { _id: `local_${l.length + 1}`, caseId: x.case._id, at: new Date().toISOString(), actor: ACTION_ROLE[action], type, payload }]);

  const toast = (text: string, undo?: () => void) => {
    const id = Date.now();
    setToasts((t) => [...t.slice(-2), { id, text, undo }]);
    timers.current.push(setTimeout(() => setToasts((t) => t.filter((v) => v.id !== id)), 5000));
  };

  const now = clock ?? new Date(x.events.at(-1)?.at ?? x.questions[0]?.createdAt ?? 0);
  const rows = toRows(x);
  const totals = totalsOf(x);
  const issues = issuesOf(x);
  const question = latestQuestion(x);
  const draft = latestDraft(x);
  const current: Issue | undefined = issues.find((i) => i.id === tab);
  const rechecking = isRechecking(x);

  const resetTo = (s: ReplayStage) => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setStage(s); setMoving(undefined); setReplaying(false);
    setVerdicts({}); setDrafts([]); setAdded([]); setEdits({}); setLog([]); setToasts([]);
    setView("case"); setTab("overview");
  };

  const replayAnswer = () => {
    setStage("answered");
    setReplaying(true);
    setTab("overview");
    timers.current = BEATS.map((b) => setTimeout(() => {
      setStage(b.stage);
      setMoving(b.done ? undefined : b.moving);
      if (b.done) setReplaying(false);
    }, b.at));
  };

  const setVerdict = (key: string, v: Verdict) => {
    const before = verdicts[key];
    setVerdicts((m) => ({ ...m, [key]: v }));
    record(v === "confirmed" ? "confirm" : "dismiss", v === "confirmed" ? "finding_confirmed" : "finding_dismissed", { findingKey: key });
    if (v === "false_positive") setTab("overview");
    toast(v === "confirmed" ? TOASTS.confirmed : TOASTS.dismissed, () => setVerdicts((m) => {
      const next = { ...m };
      if (before) next[key] = before; else delete next[key];
      return next;
    }));
  };

  const draftDispute = () => {
    const d = scenarioADraft();
    setDrafts([d]);
    record("draftDispute", "draft_created", { draftId: d._id, findingKeys: d.findingKeys, totalDisputedCents: d.totalDisputedCents });
    setTab("dispute");
    toast(TOASTS.drafted);
  };

  const approve = (id: string) => {
    setDrafts((ds) => ds.map((d) => (d._id === id ? { ...d, status: "approved", approvedBy: ACTION_ROLE.approve } : d)));
    record("approve", "approved", { draftId: id });
    toast(TOASTS.approved);
  };

  const addEvidence = (e: NewEvidence) => {
    const doc: SourceDoc = {
      _id: `local_doc_${added.length + 1}`, caseId: x.case._id, type: e.type,
      title: `${KIND_TITLE[e.type]} you added`, sentAt: new Date().toISOString(), text: e.text,
    };
    setAdded((a) => [...a, doc]);
    record("addEvidence", "doc_added", { docId: doc._id });
    return { kind: "replay" } as const;
  };

  const saveLine = (key: string, change: LineChange) => {
    setEdits((m) => ({ ...m, [key]: change }));
    record("editCharge", "charge_edited", { chargeId: key, description: change.description, amountCents: change.amountCents });
  };

  const draftDisabledReason = totals.atStakeCents === 0 ? "Nothing to dispute. At stake is $0."
    : draft ? "A dispute is already drafted."
    : stage !== "after" ? "In this replay, answer the question first." : undefined;

  return (
    <Tooltip.Provider delay={150}>
      <div className="flex h-dvh min-w-[1280px] overflow-hidden bg-bg text-ink">
        <Rail view={view} onView={setView} openQuestion={question?.status === "open"}
          onQuestion={() => { setView("case"); setTab(question?.status === "open" ? "question" : "overview"); }} />
        <main className="flex min-w-0 flex-1 flex-col">
          <CaseHeader title={x.case.title} checkedAgainst={checkedAgainst(x)} pill={casePill(x)} replay
            actions={<>
              {canAct(roles, "addEvidence") && <EvidenceDrawer onAdd={addEvidence} onSeeChanges={() => { setView("documents"); }} />}
              {canAct(roles, "draftDispute") && <DraftButton disabledReason={draftDisabledReason} onDraft={draftDispute} />}
            </>} />

          {view === "case" && (
            <>
              <nav role="tablist" aria-label="Case tabs" className="mx-6 flex gap-1 border-b border-line">
                <TabButton id="overview" tab={tab} onTab={setTab}>Overview</TabButton>
                {issues.map((i) => (
                  <TabButton key={i.id} id={i.id} tab={tab} onTab={setTab} isNew={i.kind === "line" && i.isNew}>
                    {i.title}
                    <span className={cx("ml-1.5 font-semibold", i.kind === "question" ? "text-waiting" : "text-dispute")}>{i.amount}</span>
                  </TabButton>
                ))}
              </nav>
              <div role="tabpanel" className="flex min-h-0 flex-1 flex-col gap-3 px-6 pb-4 pt-3">
                {!current ? (
                  <>
                    <AtStakeCard totals={totals} countLine={countLine(rows)} checked={checkedLine(x, now)} rechecking={rechecking} chargeCount={x.charges.length} />
                    {!rechecking && stage === "after" && <ChangedBanner notes={changeNotes(x)} onOpen={(k) => setTab(issues.some((i) => i.id === k) ? k : "overview")} />}
                    <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_404px] gap-4">
                      <IssueList issues={issues} cleared={clearedSummary(x)} onOpen={setTab}
                        moveMs={replaying ? 560 : 280} movingKey={moving}
                        allCharges={<AllCharges rows={rows}
                          lines={x.charges.map((c) => ({ key: c._id, lineNo: c.lineNo, description: c.description, amountCents: c.amountCents }))}
                          onSave={saveLine} />} />
                      <AgreedCard x={x} />
                    </div>
                  </>
                ) : current.kind === "line" ? (
                  <LineIssueView x={x} row={current.row} canVerdict={canAct(roles, "dismiss")}
                    onConfirm={(k) => setVerdict(k, "confirmed")} onDismiss={(k) => setVerdict(k, "false_positive")} />
                ) : current.kind === "question" ? (
                  <QuestionView x={x} question={current.question} rows={current.rows} waitingCents={totals.waitingCents} now={now}
                    canReply={canAct(roles, "reply")} replyNote="Replay of a recorded run: CargoOS reads the recorded answer."
                    onReply={replayAnswer} />
                ) : (
                  <DisputeView draft={current.draft} canApprove={canAct(roles, "approve")} onApprove={approve} />
                )}
              </div>
            </>
          )}
          {view === "documents" && <DocumentsView x={x} />}
          {view === "history" && <div className="min-h-0 flex-1 overflow-auto px-6 pb-4 pt-1"><HistoryView x={x} /></div>}
        </main>
        <DemoControls stage={stage} onGo={resetTo} />
        <ToastRegion>
          {toasts.map((t) => (
            <QuietToast key={t.id} text={t.text}
              onUndo={t.undo && (() => { t.undo!(); setToasts((all) => all.filter((v) => v.id !== t.id)); })}
              onClose={() => setToasts((all) => all.filter((v) => v.id !== t.id))} />
          ))}
        </ToastRegion>
      </div>
    </Tooltip.Provider>
  );
}

function TabButton({ id, tab, onTab, isNew, children }: { id: string; tab: string; onTab: (id: string) => void; isNew?: boolean; children: React.ReactNode }) {
  const on = tab === id;
  return (
    <button type="button" role="tab" aria-selected={on} onClick={() => onTab(id)}
      className={cx("relative -mb-px flex items-center border-b-2 px-3 pb-2 pt-1.5 text-[13.5px] font-medium",
        on ? "border-primary text-ink" : "border-transparent text-ink-3 hover:text-ink")}>
      {children}
      {isNew && <b aria-label="New" className="ml-1.5 size-1.5 rounded-full bg-dispute" />}
    </button>
  );
}

/** Presenter controls for the replay (SPEC W3 step 1). Not part of the product UI. */
function DemoControls({ stage, onGo }: { stage: ReplayStage; onGo: (s: ReplayStage) => void }) {
  const seg = (s: ReplayStage, label: string) => (
    <button type="button" aria-pressed={stage === s} onClick={() => onGo(s)}
      className={cx("rounded-[6px] px-2 py-0.5", stage === s ? "bg-line-strong text-ink" : "text-ink-3")}>{label}</button>
  );
  return (
    <div className="fixed bottom-3 left-[72px] z-40 flex items-center gap-1 rounded-[9px] border border-line bg-surface p-[3px] text-xs font-medium shadow-card"
      role="group" aria-label="Demo controls">
      <span className="px-1.5 text-ink-3">Demo</span>
      {seg("before", "Before answer")}{seg("after", "After answer")}
      <button type="button" onClick={() => onGo("before")} className="rounded-[6px] px-2 py-0.5 text-ink-3 hover:text-ink">Reset demo</button>
    </div>
  );
}
