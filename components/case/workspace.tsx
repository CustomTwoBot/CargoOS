// One open case (docs/design.md §0.1, §0.2): its header, the money strip, the tab strip and the
// open tab or view (Documents, History), all under the same header. Owns nothing: state comes from the case store.
import { useState } from "react";
import type { Role } from "@/lib/types";
import { DocumentsView } from "@/components/documents/documents-view";
import { HistoryView } from "@/components/history/history-view";
import { ApprovalDetail } from "@/components/inboxes/approvals-inbox";
import { approvalItems, type InboxCase } from "@/components/inboxes/items";
import { OPERATOR } from "@/components/inboxes/people";
import { CaseMenu } from "./case-menu";
import { CaseTabs, type CaseView } from "./case-tabs";
import type { CaseActions, CaseLocal } from "./case-store";
import { CaseHeader, DraftButton } from "./chrome";
import { cx } from "./cx";
import type { DemoCase } from "./demo-case";
import { changeNotes, issuesOf, openQuestions, questionTitle, type Issue } from "./issues";
import { LineIssueView, QuestionView } from "./issue-views";
import { MoneyStrip } from "./overview";
import { AllCharges, ChangedBanner, IssueList } from "./overview-tab";
import { canAct } from "./roles";
import {
  casePill, checkedAgainst, checkedLine, countLine, groupsOf, isRechecking, latestDraft, toRows, totalsOf, type CaseInput,
} from "./view-model";

export type WorkspaceProps = {
  demo: DemoCase; x: CaseInput; local: CaseLocal; actions: CaseActions; roles: readonly Role[];
  view: CaseView; now: Date | null; tab: string; onTab: (t: string) => void; inbox: InboxCase;
  /** Switches between the case's tabs and its Documents / History views (docs/design.md §0.2). */
  onView?: (v: CaseView) => void;
};

/** One case: header, pinned money strip, tabs, and the open tab or view. */
export function CaseWorkspace({ demo, x, local, actions, roles, view: shown, onView, now: clock, tab, onTab, inbox }: WorkspaceProps) {
  const [view, setView] = useOwnView(shown, onView);
  const openTab = (t: string) => { setView("case"); onTab(t); };
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
      <CaseHeader title={x.case.title} pill={casePill(x)} facts={headerFacts(x, inbox.forwarder)} replay
        actions={<>
          {canAct(roles, "draftDispute") && (
            <DraftButton disabledReason={draftDisabledReason} onDraft={() => { if (actions.draftDispute()) openTab("dispute"); }} />
          )}
          <CaseMenu onAddEvidence={canAct(roles, "addEvidence") ? actions.addEvidence : undefined} />
        </>} />

      <div className="px-6">
        <MoneyStrip totals={totals} countLine={countLine(rows)} checked={checkedLine(x, now)} rechecking={rechecking} chargeCount={x.charges.length} />
      </div>
      <div className="mx-6 mt-2.5">
        <CaseTabs issues={issues} tab={current ? tab : "overview"} onTab={openTab} view={view} onView={setView} />
      </div>

      {view === "case" && (
        <div role="tabpanel" aria-labelledby={`tab-${current?.id ?? "overview"}`} className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto px-6 pb-14 pt-3">
          {!current ? (
            <>
              {!rechecking && <ChangedBanner notes={changeNotes(x)} onOpen={(k) => onTab(issues.some((i) => i.id === k) ? k : "overview")} />}
              <IssueList issues={issues} groups={groupsOf(rows)} onOpen={onTab}
                moveMs={local.replaying ? 560 : 280} movingKey={local.moving}
                allCharges={<AllCharges rows={rows}
                  lines={x.charges.map((c) => ({ key: c._id, lineNo: c.lineNo, description: c.description, amountCents: c.amountCents, currency: c.currency }))}
                  onSave={actions.saveLine} />} />
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
            // ApprovalDetail (components/inboxes) has a fixed two-column grid; below 1024px this stacks the
            // message above the decision. TODO(merge): drop once ApprovalDetail stacks on its own.
            <div data-testid="dispute-stack" className="flex min-h-0 flex-1 flex-col max-lg:[&>div>.grid]:grid-cols-1">
              <ApprovalDetail d={approval} now={clock} viewer={OPERATOR}
                onAccept={() => actions.accept(approval.draftId)}
                onReject={(reason) => actions.reject(approval.draftId, reason)}
                onMessageChange={(t) => actions.editMessage(approval.draftId, t)} />
            </div>
          ) : null}
        </div>
      )}
      {view === "documents" && (
        <div role="tabpanel" aria-labelledby="tab-documents" className="flex min-h-0 flex-1 flex-col pt-3">
          <p className="truncate px-6 pb-2.5 text-[13px] text-ink-2" title={checkedAgainst(x)}>{checkedAgainst(x)}</p>
          <DocumentsView x={x} />
        </div>
      )}
      {view === "history" && (
        <div role="tabpanel" aria-labelledby="tab-history" className="min-h-0 flex-1 overflow-auto px-6 pb-14 pt-3"><HistoryView x={x} /></div>
      )}

      <DemoControls demo={demo} stage={local.stage} onGo={actions.reset} />
    </div>
  );
}

/**
 * The view to show. The shell owns it once it passes `onView`; until then the workspace keeps its
 * own choice, and a new `view` from the shell (its sidebar) wins.
 */
function useOwnView(shown: CaseView, onView?: (v: CaseView) => void): [CaseView, (v: CaseView) => void] {
  const [own, setOwn] = useState<{ v: CaseView; from: CaseView } | null>(null);
  if (onView) return [shown, onView];
  return [own && own.from === shown ? own.v : shown, (v) => setOwn({ v, from: shown })];
}

/** "Invoice PCL-INV-1012", then the forwarder when known: the muted line under the case title. */
function headerFacts(x: CaseInput, forwarder?: string): string[] {
  const invoice = x.documents.find((d) => d.type === "freight_invoice")?.title;
  return [invoice, forwarder].filter((f): f is string => !!f);
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
