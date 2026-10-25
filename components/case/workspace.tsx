// One open case (docs/design.md §0.2, §0.3): its header, the views (Review, Documents, History), the
// money strip under them for Review and Documents, and in Review the issue tabs and the open tab.
// What a screen sees and can do follows the device's person (§0.3 п.3). Owns nothing: state comes
// from the case store.
import { useState } from "react";
import type { Person, Role } from "@/lib/types";
import { PEOPLE, personById } from "@/lib/people";
import { DocumentsView } from "@/components/documents/documents-view";
import { historyEntries, uploaderEntries } from "@/components/history/history";
import { HistoryView } from "@/components/history/history-view";
import { ApprovalDetail } from "@/components/inboxes/approvals-inbox";
import { approvalItems, type InboxCase } from "@/components/inboxes/items";
import { AddEvidenceButton, CaseMenu } from "./case-menu";
import { CaseTabs, CaseViews, type CaseView } from "./case-tabs";
import type { CaseActions, CaseLocal } from "./case-store";
import { CaseHeader, DraftButton, OpenDisputeButton } from "./chrome";
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

/** The default person: Sam, every role (the one operator of §0). */
export const SAM: Person = personById("sam")!;

/** "Sam" from "Sam — owner". */
export const firstName = (p: Person) => p.name.split(" — ")[0];

/** Who CargoOS asks, and who decides disputes: the seeded people holding ops_lead and controller. */
const ASKED = PEOPLE.find((p) => p.roles.includes("ops_lead"));
const DECIDER = PEOPLE.find((p) => p.roles.includes("controller"));

type Pill = { label: string; tone: "waiting" | "neutral" };

/** The case pill in this screen's words (§0.3): it names who the case waits on when that isn't this screen. */
export function pillFor(pill: Pill, can: { reply: boolean; decide: boolean }): Pill {
  if (pill.label === "Waiting for your answer" && !can.reply) return { label: `Waiting for ${ASKED ? firstName(ASKED) : "the owner"}`, tone: "waiting" };
  if (pill.label === "Ready to approve" && !can.decide) return { label: `Waiting for ${DECIDER ? firstName(DECIDER) : "the owner"}`, tone: "waiting" };
  // Same words as the cases list once the owner accepts.
  if (pill.label === "Approved") return { label: "Dispute accepted", tone: "neutral" };
  return pill;
}

export type WorkspaceProps = {
  demo: DemoCase; x: CaseInput; local: CaseLocal; actions: CaseActions;
  /** The person this screen is set to (§0.3); Sam when left out. Their roles decide what shows. */
  viewer?: Person;
  /** Older way to set the screen's roles; `viewer` wins when both are given. */
  roles?: readonly Role[];
  view: CaseView; now: Date | null; tab: string; onTab: (t: string) => void; inbox: InboxCase;
  /** Switches between Review and the case's Documents / History views (docs/design.md §0.3). */
  onView?: (v: CaseView) => void;
};

/** Bottom padding so the floating demo bar never covers the last line of a view. */
const PANEL_END = "pb-20";

/** One case: header, views, money strip, and the open tab or view. */
export function CaseWorkspace({ demo, x, local, actions, viewer, roles: legacy, view: shown, onView, now: clock, tab, onTab, inbox }: WorkspaceProps) {
  const roles = viewer?.roles ?? legacy ?? SAM.roles;
  // An uploader works with documents only: no money, findings or Review (§0.3).
  const reviews = roles.some((r) => r !== "uploader");
  const decides = canAct(roles, "approve");
  const [chosen, setView] = useOwnView(shown, onView);
  const view: CaseView = !reviews && chosen === "case" ? "documents" : chosen;
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
  const asked = ASKED ? firstName(ASKED) : "the owner";
  const history = reviews ? historyEntries(x) : uploaderEntries(historyEntries(x));

  const drafted = !!draft && draft.status !== "rejected";
  const open = openQuestions(x).length;
  const blocked = rechecking ? { why: "CargoOS is rechecking. Wait a moment.", short: "Rechecking…" }
    : totals.atStakeCents === 0 ? { why: "Nothing to dispute. At stake is $0.", short: "Nothing to dispute" }
    // The pill already says "Waiting for Sam" on a screen that doesn't answer, so the reason stays in the tooltip.
    : !ready ? { why: "In this replay, answer the open questions first.", short: !canAct(roles, "reply") ? undefined
        : open ? `Answer ${open} ${open === 1 ? "question" : "questions"} first` : "Answer the questions first" }
    : undefined;
  const onDispute = view === "case" && tab === "dispute";
  const pill = pillFor(casePill(x), { reply: canAct(roles, "reply"), decide: decides });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <CaseHeader title={x.case.title} facts={headerFacts(x, inbox.forwarder)} replay
        pill={reviews ? pill : undefined}
        actions={reviews ? (
          <>
            {canAct(roles, "draftDispute") && (drafted
              ? !onDispute && <OpenDisputeButton onOpen={() => openTab("dispute")} />
              : <DraftButton label={decides ? "Draft dispute" : "Request approval"} blocked={blocked}
                  onDraft={() => { if (actions.draftDispute()) openTab("dispute"); }} />)}
            <CaseMenu onAddEvidence={canAct(roles, "addEvidence") ? actions.addEvidence : undefined} />
          </>
        ) : <AddEvidenceButton onAdd={actions.addEvidence} />} />

      <CaseViews views={reviews ? ["case", "documents", "history"] : ["documents", "history"]} view={view} onView={setView}
        counts={{ documents: x.documents.length, history: history.length }} />

      {reviews && view !== "history" && (
        <div className="px-6 pt-3">
          <MoneyStrip totals={totals} countLine={countLine(rows)} checked={checkedLine(x, now)} rechecking={rechecking} chargeCount={x.charges.length} />
        </div>
      )}

      {view === "case" && (
        <>
          <div className="mx-6 mt-2.5"><CaseTabs issues={issues} tab={current ? tab : "overview"} onTab={openTab} answerer={canAct(roles, "reply") ? undefined : asked} /></div>
          <div role="tabpanel" aria-labelledby={`tab-${current?.id ?? "overview"}`} className={cx("flex min-h-0 flex-1 flex-col gap-3 overflow-auto px-6 pt-3", PANEL_END)}>
            {!current ? (
              <>
                {!rechecking && <ChangedBanner notes={changeNotes(x)} onOpen={(k) => onTab(issues.some((i) => i.id === k) ? k : "overview")} />}
                <IssueList issues={issues} groups={groupsOf(rows)} onOpen={onTab} canReply={canAct(roles, "reply")} asked={asked}
                  moveMs={local.replaying ? 560 : 280} movingKey={local.moving}
                  allCharges={<AllCharges rows={rows}
                    lines={x.charges.map((c) => ({ key: c._id, lineNo: c.lineNo, description: c.description, amountCents: c.amountCents, currency: c.currency }))}
                    onSave={actions.saveLine} />} />
              </>
            ) : current.kind === "line" ? (
              <LineIssueView x={x} row={current.row} canVerdict={canAct(roles, "dismiss")} answerer={canAct(roles, "reply") ? undefined : asked}
                onConfirm={(k) => actions.verdict(k, "confirmed")}
                onDismiss={(k) => { actions.verdict(k, "false_positive"); onTab("overview"); }} />
            ) : current.kind === "question" ? (
              <QuestionView key={current.id} x={x} question={current.question} rows={current.rows} amount={current.amount} now={now}
                canReply={canAct(roles, "reply")} blockedReason={answerBlocked(demo, x, current.id)} asked={asked}
                replyNote={demo.answers[current.id] ? "Replay of a recorded run: CargoOS reads the recorded answer." : "This replay has no recorded answer for this question."}
                onReply={(qid) => { actions.reply(qid); onTab("overview"); }} />
            ) : approval ? (
              <ApprovalDetail d={approval} now={clock} viewer={inboxViewer(viewer ?? { ...SAM, roles: [...roles] })}
                onAccept={() => actions.accept(approval.draftId)}
                onReject={(reason) => actions.reject(approval.draftId, reason)}
                onMessageChange={(t) => actions.editMessage(approval.draftId, t)} />
            ) : null}
          </div>
        </>
      )}
      {view === "documents" && (
        <div role="tabpanel" aria-labelledby="view-documents" className="flex min-h-0 flex-1 flex-col pt-3">
          {reviews && <p className="truncate px-6 pb-2.5 text-[13px] text-ink-2" title={checkedAgainst(x)}>{checkedAgainst(x)}</p>}
          <DocumentsView x={x} facts={reviews} />
        </div>
      )}
      {view === "history" && (
        <div role="tabpanel" aria-labelledby="view-history" className={cx("min-h-0 flex-1 overflow-auto px-6 pt-3", PANEL_END)}>
          <HistoryView x={x} entries={reviews ? undefined : history} />
        </div>
      )}

      <DemoControls demo={demo} stage={local.stage} onGo={actions.reset} stages={reviews} />
    </div>
  );
}

/**
 * `ApprovalDetail` still types its viewer with the inboxes' local person (it has a `title`).
 * TODO(merge): pass `viewer` straight through once components/inboxes uses lib/types' Person.
 */
function inboxViewer(p: Person) {
  return Object.assign({ title: "" }, p);
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
/** `stages={false}` (a screen without findings): only Reset demo, since the answer stages change nothing it shows. */
function DemoControls({ demo, stage, onGo, stages }: { demo: DemoCase; stage: string; onGo: (s: string) => void; stages: boolean }) {
  const seg = (s: string, label: string) => (
    <button type="button" aria-pressed={stage === s} onClick={() => onGo(s)}
      className={cx("rounded-[6px] px-2 py-0.5", stage === s ? "bg-line-strong text-ink" : "text-ink-3")}>{label}</button>
  );
  return (
    <div className="fixed bottom-3 left-1/2 z-40 flex -translate-x-1/2 items-center gap-1 rounded-[9px] border border-line bg-surface p-[3px] text-xs font-medium shadow-card"
      role="group" aria-label="Demo controls">
      <span className="px-1.5 text-ink-3">Demo</span>
      {stages && <>{seg(demo.start, "Before answers")}{seg(demo.end, "After answers")}</>}
      <button type="button" onClick={() => onGo(demo.start)} className="rounded-[6px] px-2 py-0.5 text-ink-3 hover:text-ink">Reset demo</button>
    </div>
  );
}
