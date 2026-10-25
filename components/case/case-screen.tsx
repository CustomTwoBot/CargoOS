"use client";
// The case screen at 1280 (docs/design.md §6, §0). Replay mode only for now: Scenario A from the
// fixture, actions change a local copy, and an answer replays the recorded run beat by beat
// (§9). Live Convex data replaces this in SPEC W3 step 8.
import { Tooltip } from "@base-ui/react/tooltip";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { CaseEvent, Draft, Finding, Role } from "@/lib/types";
import { CaseHeader, Rail } from "./chrome";
import { cx } from "./cx";
import { FindingsList } from "./findings-list";
import { scenarioAAt, scenarioADraft, type ReplayStage } from "./fixture";
import { AtStakeCard, StepCards } from "./overview";
import { ACTION_ROLE, ALL_ROLES, canAct, type Action } from "./roles";
import { SidePanel, type PanelTab } from "./side-panel";
import {
  casePill, changeSummary, checkedAgainst, checkedLine, countLine, groupsOf, isRechecking, latestChanges, latestDraft,
  latestQuestion, stepsOf, toRows, totalsOf, type CaseInput,
} from "./view-model";

type Verdict = NonNullable<Finding["userVerdict"]>;

// The clock is read on the client only, so prerendering never bakes in a time ("today at …").
let clientNow: Date | undefined;
const useNow = () => useSyncExternalStore(() => () => {}, () => (clientNow ??= new Date()), () => null);

// Replay beats after "Reply" (docs/design.md §9): recheck, line 4 moves, line 6 moves, What changed.
const BEATS: { at: number; stage: ReplayStage; moving?: string; done?: boolean }[] = [
  { at: 1600, stage: "partial", moving: "chg_4" },
  { at: 3200, stage: "after", moving: "chg_6" },
  { at: 4200, stage: "after", done: true },
];

export function CaseScreen({ roles = ALL_ROLES }: { roles?: readonly Role[] }) {
  const [stage, setStage] = useState<ReplayStage>("before");
  const [moving, setMoving] = useState<string>();
  const [replaying, setReplaying] = useState(false);
  const [verdicts, setVerdicts] = useState<Record<string, Verdict>>({});
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [log, setLog] = useState<CaseEvent[]>([]);
  const [selectedKey, setSelectedKey] = useState<string>();
  const [tab, setTab] = useState<PanelTab>("evidence");
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const clock = useNow();

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const x: CaseInput = useMemo(() => {
    const base = scenarioAAt(stage);
    return {
      ...base,
      findings: base.findings.map((f) => (verdicts[f.key] && f.revision === base.case.revision
        ? { ...f, userVerdict: verdicts[f.key], userVerdictBy: ACTION_ROLE[verdicts[f.key] === "confirmed" ? "confirm" : "dismiss"] }
        : f)),
      drafts,
      events: [...base.events, ...log],
    };
  }, [stage, verdicts, drafts, log]);

  const record = (action: Action, type: CaseEvent["type"], payload: Record<string, unknown>) =>
    setLog((l) => [...l, { _id: `local_${l.length + 1}`, caseId: x.case._id, at: new Date().toISOString(), actor: ACTION_ROLE[action], type, payload }]);

  const now = clock ?? new Date(x.events.at(-1)?.at ?? x.questions[0]?.createdAt ?? 0);
  const rows = toRows(x);
  const totals = totalsOf(x);
  const question = latestQuestion(x);
  const draft = latestDraft(x);
  const answeredAt = x.events.find((e) => e.type === "reply_received")?.at;
  const replyText = x.documents.find((d) => d.type === "reply")?.text;

  const goTo = (s: ReplayStage) => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setStage(s); setMoving(undefined); setReplaying(false);
    setVerdicts({}); setDrafts([]); setLog([]); setSelectedKey(undefined); setTab("evidence");
  };

  const replayAnswer = () => {
    setStage("answered");
    setReplaying(true);
    setSelectedKey(undefined);
    timers.current = BEATS.map((b) => setTimeout(() => {
      setStage(b.stage);
      setMoving(b.done ? undefined : b.moving);
      if (b.done) { setReplaying(false); setTab("changed"); }
    }, b.at));
  };

  const setVerdict = (key: string, v: Verdict) => {
    setVerdicts((m) => ({ ...m, [key]: v }));
    record(v === "confirmed" ? "confirm" : "dismiss", v === "confirmed" ? "finding_confirmed" : "finding_dismissed", { findingKey: key });
  };

  const draftDisabledReason = totals.atStakeCents === 0 ? "Nothing to dispute. At stake is $0."
    : draft ? "A dispute is already drafted."
    : stage !== "after" ? "In this replay, answer the question first." : undefined;

  return (
    <Tooltip.Provider delay={150}>
      <div className="flex h-dvh min-w-[1280px] overflow-hidden bg-bg text-ink">
        <Rail openQuestion={question?.status === "open"} />
        <main className="flex min-w-0 flex-1 flex-col">
          <CaseHeader title={x.case.title} checkedAgainst={checkedAgainst(x)} pill={casePill(x)} replay
            canDraft={canAct(roles, "draftDispute")} draftDisabledReason={draftDisabledReason}
            onDraft={() => {
              const d = scenarioADraft();
              setDrafts([d]);
              record("draftDispute", "draft_created", { draftId: d._id, findingKeys: d.findingKeys, totalDisputedCents: d.totalDisputedCents });
              setTab("dispute");
            }} />
          <div className="mx-6 grid gap-2.5">
            <AtStakeCard totals={totals} countLine={countLine(rows)} checked={checkedLine(x, now)} rechecking={isRechecking(x)} />
            <StepCards steps={stepsOf(x, now)} />
          </div>
          <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_404px] gap-4 px-6 pb-4 pt-3">
            <FindingsList groups={groupsOf(rows)} question={question} replyText={replyText}
              waitingCents={totals.waitingCents} answeredAt={answeredAt} now={now}
              moveMs={replaying ? 560 : 280} movingKey={moving}
              selectedKey={selectedKey} onSelect={(k) => { setSelectedKey(k); setTab("evidence"); }}
              canVerdict={canAct(roles, "dismiss")}
              onConfirm={(k) => setVerdict(k, "confirmed")} onDismiss={(k) => setVerdict(k, "false_positive")}
              canReply={canAct(roles, "reply")} replyNote="Replay of a recorded run: CargoOS reads the recorded answer."
              onReply={replayAnswer} />
            <SidePanel tab={tab} onTab={setTab} x={x} selected={rows.find((r) => r.key === selectedKey)}
              canVerdict={canAct(roles, "dismiss")}
              onConfirm={(k) => setVerdict(k, "confirmed")} onDismiss={(k) => setVerdict(k, "false_positive")}
              changes={latestChanges(x)} changedTitle="What changed after your answer" changedSummary={changeSummary(x)}
              draft={draft} canApprove={canAct(roles, "approve")}
              onApprove={(id) => {
                setDrafts((ds) => ds.map((d) => (d._id === id ? { ...d, status: "approved", approvedBy: ACTION_ROLE.approve } : d)));
                record("approve", "approved", { draftId: id });
              }}
              events={x.events} />
          </div>
        </main>
        <DemoControls stage={stage} onGo={goTo} />
      </div>
    </Tooltip.Provider>
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
