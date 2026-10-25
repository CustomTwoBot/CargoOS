"use client";
// The case app at 1280 (docs/design.md §0.1, layout A "tabs per issue"). A list of cases; each case
// has the At stake card pinned above an Overview tab plus one tab per thing to decide; Documents
// and History come from the rail. Replay mode only for now: each case is a DemoCase (recorded
// snapshots), actions change a local copy, and an answer plays that answer's beats (§9).
// Live Convex data replaces this in SPEC W3 step 8.
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
import { CasesList, type CaseSummary } from "./cases-list";
import { cx } from "./cx";
import type { DemoCase } from "./demo-case";
import { SCENARIO_A } from "./fixture";
import { changeNotes, clearedSummary, issuesOf, openQuestions, type Issue } from "./issues";
import { DisputeView, LineIssueView, QuestionView } from "./issue-views";
import { AtStakeCard } from "./overview";
import { AgreedCard, AllCharges, ChangedBanner, IssueList } from "./overview-tab";
import { ACTION_ROLE, ALL_ROLES, canAct, type Action } from "./roles";
import {
  casePill, checkedAgainst, checkedLine, countLine, isRechecking, latestDraft, toRows, totalsOf, type CaseInput,
} from "./view-model";

type Verdict = NonNullable<Finding["userVerdict"]>;
type Toast = { id: number; text: string; undo?: () => void };

// The clock is read on the client only, so prerendering never bakes in a time ("today at …").
let clientNow: Date | undefined;
const useNow = () => useSyncExternalStore(() => () => {}, () => (clientNow ??= new Date()), () => null);

const KIND_TITLE: Record<NewEvidence["type"], string> = { email: "Email", chat: "Chat", other: "Note" };

type Props = { cases?: DemoCase[]; roles?: readonly Role[] };

export function CaseScreen({ cases = [SCENARIO_A], roles = ALL_ROLES }: Props) {
  const [activeId, setActiveId] = useState(cases[0].id);
  const [view, setView] = useState<View>("case");
  const [summaries, setSummaries] = useState<Record<string, CaseSummary>>({});
  const [questionNudge, setQuestionNudge] = useState(0);
  const active = summaries[activeId];

  return (
    <Tooltip.Provider delay={150}>
      <div className="flex h-dvh min-w-[1280px] overflow-hidden bg-bg text-ink">
        <Rail view={view} onView={setView} multiCase={cases.length > 1}
          openQuestion={!!active?.openQuestions}
          onQuestion={() => { setView("case"); setQuestionNudge((n) => n + 1); }} />
        <main className="flex min-w-0 flex-1 flex-col">
          {view === "cases" && (
            <CasesList cases={cases} summaries={summaries}
              onOpen={(id) => { setActiveId(id); setView("case"); }} />
          )}
          {cases.map((c) => (
            <CaseWorkspace key={c.id} demo={c} roles={roles} hidden={view === "cases" || c.id !== activeId}
              view={view === "cases" ? "case" : view} questionNudge={c.id === activeId ? questionNudge : 0}
              onSummary={(s) => setSummaries((m) => (sameSummary(m[c.id], s) ? m : { ...m, [c.id]: s }))} />
          ))}
        </main>
      </div>
    </Tooltip.Provider>
  );
}

const sameSummary = (a: CaseSummary | undefined, b: CaseSummary) =>
  !!a && a.atStakeCents === b.atStakeCents && a.pill === b.pill && a.openQuestions === b.openQuestions && a.toDecide === b.toDecide;

type WorkspaceProps = {
  demo: DemoCase; roles: readonly Role[]; hidden: boolean; view: Exclude<View, "cases">;
  questionNudge: number; onSummary: (s: CaseSummary) => void;
};

/** One case, with its own replay state. Every case stays mounted so switching keeps your work. */
function CaseWorkspace({ demo, roles, hidden, view, questionNudge, onSummary }: WorkspaceProps) {
  const [tab, setTab] = useState("overview");
  const [stage, setStage] = useState(demo.start);
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
    const base = demo.at(stage);
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
  }, [demo, stage, verdicts, drafts, added, edits, log]);

  const now = clock ?? new Date(x.events.at(-1)?.at ?? x.questions[0]?.createdAt ?? 0);
  const rows = toRows(x);
  const totals = totalsOf(x);
  const issues = issuesOf(x);
  const questions = openQuestions(x);
  const draft = latestDraft(x);
  const current: Issue | undefined = issues.find((i) => i.id === tab);
  const rechecking = isRechecking(x);
  const pill = casePill(x);
  const toDecide = issues.filter((i) => i.kind !== "dispute").length;

  useEffect(() => {
    onSummary({ atStakeCents: totals.atStakeCents, billedCents: totals.billedCents, pill: pill.label, openQuestions: questions.length, toDecide });
  });

  // The rail's Questions button opens the first open question (state adjusted during render).
  const [seenNudge, setSeenNudge] = useState(questionNudge);
  if (questionNudge !== seenNudge) {
    setSeenNudge(questionNudge);
    setTab(questions[0]?._id ?? "overview");
  }

  const record = (action: Action, type: CaseEvent["type"], payload: Record<string, unknown>) =>
    setLog((l) => [...l, { _id: `local_${l.length + 1}`, caseId: x.case._id, at: new Date().toISOString(), actor: ACTION_ROLE[action], type, payload }]);

  const toast = (text: string, undo?: () => void) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-2), { id, text, undo }]);
    timers.current.push(setTimeout(() => setToasts((t) => t.filter((v) => v.id !== id)), 5000));
  };

  const resetTo = (s: string) => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setStage(s); setMoving(undefined); setReplaying(false);
    setVerdicts({}); setDrafts([]); setAdded([]); setEdits({}); setLog([]); setToasts([]);
    setTab("overview");
  };

  const replayAnswer = (questionId: string) => {
    const answer = demo.answers[questionId];
    if (!answer) return;
    timers.current.forEach(clearTimeout);
    setReplaying(true);
    setTab("overview");
    const last = answer.beats.at(-1)?.at ?? 0;
    timers.current = [
      ...answer.beats.map((b) => setTimeout(() => { setStage(b.stage); setMoving(b.moving); }, b.at)),
      setTimeout(() => { setMoving(undefined); setReplaying(false); }, last + 1000),
    ];
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

  const ready = demo.draft(x);
  const draftDispute = () => {
    if (!ready) return;
    setDrafts([ready]);
    record("draftDispute", "draft_created", { draftId: ready._id, findingKeys: ready.findingKeys, totalDisputedCents: ready.totalDisputedCents });
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
    : !ready ? "In this replay, answer the open questions first." : undefined;

  return (
    <div hidden={hidden} className="flex min-h-0 flex-1 flex-col">
      <CaseHeader title={x.case.title} checkedAgainst={checkedAgainst(x)} pill={pill} replay
        actions={<>
          {canAct(roles, "addEvidence") && <EvidenceDrawer onAdd={addEvidence} />}
          {canAct(roles, "draftDispute") && <DraftButton disabledReason={draftDisabledReason} onDraft={draftDispute} />}
        </>} />

      {view === "case" && (
        <>
          <div className="px-6">
            <AtStakeCard totals={totals} countLine={countLine(rows)} checked={checkedLine(x, now)} rechecking={rechecking} chargeCount={x.charges.length} />
          </div>
          <nav role="tablist" aria-label="Case tabs" className="mx-6 mt-2 flex gap-1 overflow-x-auto border-b border-line [scrollbar-width:thin]">
            <TabButton id="overview" tab={tab} onTab={setTab}>Overview</TabButton>
            {issues.map((i) => (
              <TabButton key={i.id} id={i.id} tab={tab} onTab={setTab} isNew={i.kind === "line" && i.isNew}>
                <span className="max-w-[200px] truncate">{i.title}</span>
                <span className={cx("ml-1.5 font-semibold", i.kind === "question" ? "text-waiting" : "text-dispute")}>{i.amount}</span>
              </TabButton>
            ))}
          </nav>
          <div role="tabpanel" className="flex min-h-0 flex-1 flex-col gap-3 px-6 pb-4 pt-3">
            {!current ? (
              <>
                {!rechecking && <ChangedBanner notes={changeNotes(x)} onOpen={(k) => setTab(issues.some((i) => i.id === k) ? k : "overview")} />}
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
              <QuestionView key={current.id} x={x} question={current.question} rows={current.rows} amount={current.amount} now={now}
                canReply={canAct(roles, "reply")}
                replyNote={demo.answers[current.id] ? "Replay of a recorded run: CargoOS reads the recorded answer." : "This replay has no recorded answer for this question."}
                onReply={replayAnswer} />
            ) : (
              <DisputeView draft={current.draft} canApprove={canAct(roles, "approve")} onApprove={approve} />
            )}
          </div>
        </>
      )}
      {view === "documents" && <DocumentsView x={x} />}
      {view === "history" && <div className="min-h-0 flex-1 overflow-auto px-6 pb-4 pt-1"><HistoryView x={x} /></div>}

      {!hidden && <DemoControls demo={demo} stage={stage} onGo={resetTo} />}
      {!hidden && (
        <ToastRegion>
          {toasts.map((t) => (
            <QuietToast key={t.id} text={t.text}
              onUndo={t.undo && (() => { t.undo!(); setToasts((all) => all.filter((v) => v.id !== t.id)); })}
              onClose={() => setToasts((all) => all.filter((v) => v.id !== t.id))} />
          ))}
        </ToastRegion>
      )}
    </div>
  );
}

function TabButton({ id, tab, onTab, isNew, children }: { id: string; tab: string; onTab: (id: string) => void; isNew?: boolean; children: React.ReactNode }) {
  const on = tab === id;
  return (
    <button type="button" role="tab" aria-selected={on} onClick={() => onTab(id)}
      className={cx("relative -mb-px flex flex-none items-center whitespace-nowrap border-b-2 px-3 pb-2 pt-1.5 text-[13.5px] font-medium",
        on ? "border-primary text-ink" : "border-transparent text-ink-3 hover:text-ink")}>
      {children}
      {isNew && <b aria-label="New" className="ml-1.5 size-1.5 rounded-full bg-dispute" />}
    </button>
  );
}

/** Presenter controls for the replay (SPEC W3 step 1). Not part of the product UI. */
function DemoControls({ demo, stage, onGo }: { demo: DemoCase; stage: string; onGo: (s: string) => void }) {
  const seg = (s: string, label: string) => (
    <button type="button" aria-pressed={stage === s} onClick={() => onGo(s)}
      className={cx("rounded-[6px] px-2 py-0.5", stage === s ? "bg-line-strong text-ink" : "text-ink-3")}>{label}</button>
  );
  return (
    <div className="fixed bottom-3 left-[72px] z-40 flex items-center gap-1 rounded-[9px] border border-line bg-surface p-[3px] text-xs font-medium shadow-card"
      role="group" aria-label="Demo controls">
      <span className="px-1.5 text-ink-3">Demo</span>
      {seg(demo.start, "Before answers")}{seg(demo.end, "After answers")}
      <button type="button" onClick={() => onGo(demo.start)} className="rounded-[6px] px-2 py-0.5 text-ink-3 hover:text-ink">Reset demo</button>
    </div>
  );
}
