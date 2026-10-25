"use client";
// The app at 1280 (docs/design.md §0.1): a sidebar with every case and the cross-case inboxes, and
// for the open case the At stake card pinned above an Overview tab plus one tab per thing to
// decide; Documents and History from the sidebar. Replay mode only for now: every case is a
// DemoCase (recorded snapshots) and `useCaseStore` applies what the operator does on top.
// Live Convex data replaces this in SPEC W3 step 8.
import { Tooltip } from "@base-ui/react/tooltip";
import { useRef, useState, useSyncExternalStore } from "react";
import type { Role } from "@/lib/types";
import { SCENARIO_B } from "@/components/demo/scenario-b/scenario-b";
import { DocumentsView } from "@/components/documents/documents-view";
import { HistoryView } from "@/components/history/history-view";
import { ApprovalDetail, ApprovalsInbox } from "@/components/inboxes/approvals-inbox";
import { approvalItems, inboxCounts, questionItems, type InboxCase } from "@/components/inboxes/items";
import { QuestionsInbox } from "@/components/inboxes/questions-inbox";
import { OPERATOR } from "@/components/inboxes/people";
import { EvidenceDrawer } from "@/components/inputs/evidence-drawer";
import { CasesEmpty } from "@/components/new-case/cases-empty";
import { NewCaseFlow } from "@/components/new-case/new-case-flow";
import { QuietToast } from "@/components/states/quiet";
import { ToastRegion } from "@/components/states/shared";
import { CaseTabs } from "./case-tabs";
import { useCaseStore, type CaseActions, type CaseLocal } from "./case-store";
import { CasesList, type CaseSummary } from "./cases-list";
import { CaseHeader, DraftButton } from "./chrome";
import { cx } from "./cx";
import type { DemoCase } from "./demo-case";
import { SCENARIO_A } from "./fixture";
import { changeNotes, clearedSummary, issuesOf, openQuestions, questionTitle, type Issue } from "./issues";
import { LineIssueView, QuestionView } from "./issue-views";
import { AtStakeCard } from "./overview";
import { AgreedCard, AllCharges, ChangedBanner, IssueList } from "./overview-tab";
import { ALL_ROLES, canAct } from "./roles";
import { Sidebar, type View } from "./sidebar";
import {
  casePill, checkedAgainst, checkedLine, countLine, isRechecking, latestDraft, toRows, totalsOf, type CaseInput,
} from "./view-model";

type ToastItem = { id: number; text: string; undo?: () => void };

// The clock is read on the client only, so prerendering never bakes in a time ("today at …").
let clientNow: Date | undefined;
const useNow = () => useSyncExternalStore(() => () => {}, () => (clientNow ??= new Date()), () => null);

/** The recorded cases the demo opens with. Defined here because a DemoCase holds functions, which a server page can't pass. */
const DEMO_CASES: DemoCase[] = [SCENARIO_A, SCENARIO_B];

/** Forwarder names for the inboxes until `Case.forwarder` lands (SPEC §5.5). */
const FORWARDER: Record<string, string> = { [SCENARIO_A.id]: "Pacific Crest Logistics", [SCENARIO_B.id]: "Kestrel Bay Logistics" };

type Props = { cases?: DemoCase[]; roles?: readonly Role[] };

export function CaseScreen({ cases = DEMO_CASES, roles = ALL_ROLES }: Props) {
  const [activeId, setActiveId] = useState(cases[0]?.id ?? "");
  const [view, setView] = useState<View>(cases.length ? "case" : "cases");
  const [tabs, setTabs] = useState<Record<string, string>>({});
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const toastTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const clock = useNow();

  const toast = (text: string, undo?: () => void) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-2), { id, text, undo }]);
    toastTimers.current.push(setTimeout(() => setToasts((t) => t.filter((v) => v.id !== id)), 5000));
  };
  const store = useCaseStore(cases, toast);

  const demo = cases.find((c) => c.id === activeId);
  const tabOf = (id: string) => tabs[id] ?? "overview";
  const setTab = (id: string, tab: string) => setTabs((t) => ({ ...t, [id]: tab }));
  const open = (id: string, tab = "overview") => { setActiveId(id); setTab(id, tab); setView("case"); };

  const inboxCases: InboxCase[] = cases.map((c) => ({ demo: c, x: store.inputs[c.id], forwarder: FORWARDER[c.id] }));
  const counts = inboxCounts(inboxCases);
  const summaries: Record<string, CaseSummary> = Object.fromEntries(cases.map((c) => [c.id, summaryOf(store.inputs[c.id])]));
  const actions = (id: string) => store.actionsFor(cases.find((c) => c.id === id)!);

  return (
    <Tooltip.Provider delay={150}>
      <div className="flex h-dvh min-w-[1280px] overflow-hidden bg-bg text-ink">
        <Sidebar view={view} onView={setView} activeId={activeId}
          cases={cases.map((c) => ({ id: c.id, title: c.title, atStakeCents: summaries[c.id].atStakeCents, openQuestions: summaries[c.id].openQuestions }))}
          onOpenCase={(id) => open(id, tabOf(id))}
          counts={{ questions: summaries[activeId]?.openQuestions ?? 0, documents: summaries[activeId]?.documents ?? 0, events: summaries[activeId]?.events ?? 0 }}
          inbox={{ questions: counts.questions, approvals: counts.approvals }}
          onQuestion={() => demo && open(demo.id, openQuestions(store.inputs[demo.id])[0]?._id ?? "overview")}
          onNewCase={() => setView("new")} />
        <main className="flex min-w-0 flex-1 flex-col">
          {view === "cases" && (cases.length ? (
            <CasesList cases={cases} summaries={summaries} onOpen={(id) => open(id, tabOf(id))} />
          ) : (
            <div className="pt-6"><CasesEmpty onNew={() => setView("new")} onLoadExample={() => undefined} examples={[]} /></div>
          ))}
          {view === "new" && (
            <div className="min-h-0 flex-1 overflow-auto px-6 py-4">
              <NewCaseFlow onCancel={() => setView(cases.length ? "case" : "cases")}
                onLoadExample={(id) => (cases.some((c) => c.id === id) ? open(id) : undefined)}
                onCreate={() => { toast("In this replay, new cases aren't read. Open a recorded case to try the checks."); setView("cases"); }} />
            </div>
          )}
          {view === "questions" && (
            <QuestionsInbox items={questionItems(inboxCases)} viewer={OPERATOR}
              onOpen={(caseId, qid) => open(caseId, qid)}
              onReply={(caseId, qid) => { actions(caseId).reply(qid); open(caseId); }} />
          )}
          {view === "approvals" && (
            <ApprovalsInbox items={approvalItems(inboxCases)} viewer={OPERATOR}
              onOpen={(caseId) => open(caseId, "dispute")}
              onAccept={(caseId, draftId) => actions(caseId).accept(draftId)}
              onReject={(caseId, draftId, reason) => actions(caseId).reject(draftId, reason)}
              onMessageChange={(caseId, draftId, t) => actions(caseId).editMessage(draftId, t)} />
          )}
          {demo && (view === "case" || view === "documents" || view === "history") && (
            <CaseWorkspace key={demo.id} demo={demo} x={store.inputs[demo.id]} local={store.state[demo.id]}
              actions={actions(demo.id)} roles={roles} view={view} now={clock}
              tab={tabOf(demo.id)} onTab={(t) => setTab(demo.id, t)}
              inbox={{ demo, x: store.inputs[demo.id], forwarder: FORWARDER[demo.id] }} />
          )}
        </main>
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

function summaryOf(x: CaseInput): CaseSummary {
  const t = totalsOf(x), issues = issuesOf(x);
  return {
    atStakeCents: t.atStakeCents, billedCents: t.billedCents, pill: casePill(x).label,
    openQuestions: openQuestions(x).length, toDecide: issues.filter((i) => i.kind !== "dispute").length,
    documents: x.documents.length, events: x.events.length,
  };
}

type WorkspaceProps = {
  demo: DemoCase; x: CaseInput; local: CaseLocal; actions: CaseActions; roles: readonly Role[];
  view: "case" | "documents" | "history"; now: Date | null; tab: string; onTab: (t: string) => void; inbox: InboxCase;
};

/** One case: header, pinned At stake card, tabs, and the open tab or view. */
function CaseWorkspace({ demo, x, local, actions, roles, view, now: clock, tab, onTab, inbox }: WorkspaceProps) {
  const now = clock ?? new Date(x.events.at(-1)?.at ?? x.questions[0]?.createdAt ?? 0);
  const rows = toRows(x);
  const totals = totalsOf(x);
  const issues = issuesOf(x);
  const draft = latestDraft(x);
  const current: Issue | undefined = issues.find((i) => i.id === tab);
  const rechecking = isRechecking(x);
  const ready = demo.draft(x);
  const approval = draft && approvalItems([inbox]).find((a) => a.draftId === draft._id);

  const draftDisabledReason = rechecking ? "CargoOS is rechecking. Wait a moment."
    : totals.atStakeCents === 0 ? "Nothing to dispute. At stake is $0."
    : draft && draft.status !== "rejected" ? "A dispute is already drafted."
    : !ready ? "In this replay, answer the open questions first." : undefined;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <CaseHeader title={x.case.title} checkedAgainst={checkedAgainst(x)} pill={casePill(x)} replay
        actions={<>
          {canAct(roles, "addEvidence") && <EvidenceDrawer onAdd={actions.addEvidence} />}
          {canAct(roles, "draftDispute") && (
            <DraftButton disabledReason={draftDisabledReason} onDraft={() => { if (actions.draftDispute()) onTab("dispute"); }} />
          )}
        </>} />

      {view === "case" && (
        <>
          <div className="px-6">
            <AtStakeCard totals={totals} countLine={countLine(rows)} checked={checkedLine(x, now)} rechecking={rechecking} chargeCount={x.charges.length} />
          </div>
          <div className="mx-6 mt-2.5"><CaseTabs issues={issues} tab={current ? tab : "overview"} onTab={onTab} /></div>
          <div role="tabpanel" aria-labelledby={`tab-${current?.id ?? "overview"}`} className="flex min-h-0 flex-1 flex-col gap-3 px-6 pb-14 pt-3">
            {!current ? (
              <>
                {!rechecking && <ChangedBanner notes={changeNotes(x)} onOpen={(k) => onTab(issues.some((i) => i.id === k) ? k : "overview")} />}
                <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_404px] gap-4">
                  <IssueList issues={issues} cleared={clearedSummary(x)} onOpen={onTab}
                    moveMs={local.replaying ? 560 : 280} movingKey={local.moving}
                    allCharges={<AllCharges rows={rows}
                      lines={x.charges.map((c) => ({ key: c._id, lineNo: c.lineNo, description: c.description, amountCents: c.amountCents, currency: c.currency }))}
                      onSave={actions.saveLine} />} />
                  <AgreedCard x={x} />
                </div>
              </>
            ) : current.kind === "line" ? (
              <LineIssueView x={x} row={current.row} canVerdict={canAct(roles, "dismiss")}
                onConfirm={(k) => actions.verdict(k, "confirmed")}
                onDismiss={(k) => { actions.verdict(k, "false_positive"); onTab("overview"); }} />
            ) : current.kind === "question" ? (
              <QuestionView key={current.id} x={x} question={current.question} rows={current.rows} amount={current.amount} now={now}
                canReply={canAct(roles, "reply")} blockedReason={answerBlocked(demo, x, current.id)}
                replyNote={demo.answers[current.id] ? "Replay of a recorded run: CargoOS reads the recorded answer." : "This replay has no recorded answer for this question."}
                onReply={(qid) => { actions.reply(qid); onTab("overview"); }} />
            ) : approval ? (
              <ApprovalDetail d={approval} now={clock} viewer={OPERATOR}
                onAccept={() => actions.accept(approval.draftId)}
                onReject={(reason) => actions.reject(approval.draftId, reason)}
                onMessageChange={(t) => actions.editMessage(approval.draftId, t)} />
            ) : null}
          </div>
        </>
      )}
      {view === "documents" && <DocumentsView x={x} />}
      {view === "history" && <div className="min-h-0 flex-1 overflow-auto px-6 pb-14 pt-1"><HistoryView x={x} /></div>}

      <DemoControls demo={demo} stage={local.stage} onGo={actions.reset} />
    </div>
  );
}

/**
 * A replay plays answers in the order they were recorded; answering a later question first would
 * jump to a snapshot that already holds the earlier answer. Live mode has no such limit.
 */
function answerBlocked(demo: DemoCase, x: CaseInput, questionId: string): string | undefined {
  if (!demo.answers[questionId]) return undefined;
  const open = new Set(openQuestions(x).map((q) => q._id));
  const next = Object.keys(demo.answers).find((id) => open.has(id));
  const nextQ = next && x.questions.find((q) => q._id === next);
  return nextQ && next !== questionId ? `Answer ${questionTitle(x, nextQ)} first. In this replay the answers play in the order they were recorded.` : undefined;
}

/** Presenter controls for the replay (SPEC W3 step 1). Not part of the product UI. */
function DemoControls({ demo, stage, onGo }: { demo: DemoCase; stage: string; onGo: (s: string) => void }) {
  const seg = (s: string, label: string) => (
    <button type="button" aria-pressed={stage === s} onClick={() => onGo(s)}
      className={cx("rounded-[6px] px-2 py-0.5", stage === s ? "bg-line-strong text-ink" : "text-ink-3")}>{label}</button>
  );
  return (
    <div className="fixed bottom-3 left-1/2 z-40 flex -translate-x-1/2 items-center gap-1 rounded-[9px] border border-line bg-surface p-[3px] text-xs font-medium shadow-card"
      role="group" aria-label="Demo controls">
      <span className="px-1.5 text-ink-3">Demo</span>
      {seg(demo.start, "Before answers")}{seg(demo.end, "After answers")}
      <button type="button" onClick={() => onGo(demo.start)} className="rounded-[6px] px-2 py-0.5 text-ink-3 hover:text-ink">Reset demo</button>
    </div>
  );
}
