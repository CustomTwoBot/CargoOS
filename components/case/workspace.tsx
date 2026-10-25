// One open case (docs/design.md §0.1, §0.2): its header, the money summary, the tab strip and the
// open tab, plus Documents and History. Owns nothing: state comes from the case store.
import type { Role } from "@/lib/types";
import { DocumentsView } from "@/components/documents/documents-view";
import { HistoryView } from "@/components/history/history-view";
import { ApprovalDetail } from "@/components/inboxes/approvals-inbox";
import { approvalItems, type InboxCase } from "@/components/inboxes/items";
import { OPERATOR } from "@/components/inboxes/people";
import { EvidenceDrawer } from "@/components/inputs/evidence-drawer";
import { CaseTabs } from "./case-tabs";
import type { CaseActions, CaseLocal } from "./case-store";
import { CaseHeader, DraftButton } from "./chrome";
import { cx } from "./cx";
import type { DemoCase } from "./demo-case";
import { changeNotes, clearedSummary, issuesOf, openQuestions, questionTitle, type Issue } from "./issues";
import { LineIssueView, QuestionView } from "./issue-views";
import { AtStakeCard } from "./overview";
import { AgreedCard, AllCharges, ChangedBanner, IssueList } from "./overview-tab";
import { canAct } from "./roles";
import {
  casePill, checkedAgainst, checkedLine, countLine, isRechecking, latestDraft, toRows, totalsOf, type CaseInput,
} from "./view-model";

export type WorkspaceProps = {
  demo: DemoCase; x: CaseInput; local: CaseLocal; actions: CaseActions; roles: readonly Role[];
  view: "case" | "documents" | "history"; now: Date | null; tab: string; onTab: (t: string) => void; inbox: InboxCase;
  /** Switches between the case's tabs and its Documents / History views (docs/design.md §0.2). */
  onView?: (v: "case" | "documents" | "history") => void;
};

/** One case: header, pinned At stake card, tabs, and the open tab or view. */
export function CaseWorkspace({ demo, x, local, actions, roles, view, now: clock, tab, onTab, inbox }: WorkspaceProps) {
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
