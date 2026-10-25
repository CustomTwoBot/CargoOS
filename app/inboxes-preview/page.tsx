"use client";
// TEMPORARY preview of the cross-case inboxes (components/inboxes). Remove at integration, when
// the sidebar lists these views. Scenario A plus a synthetic second case; answering or approving
// moves the case to its next recorded stage.
import { useState } from "react";
import { SCENARIO_A, scenarioAAt } from "@/components/case/fixture";
import { cx } from "@/components/case/cx";
import { ThemeToggle } from "@/components/case/theme-toggle";
import { ApprovalsInbox } from "@/components/inboxes/approvals-inbox";
import { approvalItems, inboxCounts, questionItems, type InboxCase } from "@/components/inboxes/items";
import { QuestionsInbox } from "@/components/inboxes/questions-inbox";
import { CASE_B, caseB, inboxCase, scenarioAWithDraft, type CaseBStage } from "@/components/inboxes/sample";

type AStage = "asking" | "drafted" | "approved";
const A_AT = { asking: () => scenarioAAt("before"), drafted: () => scenarioAWithDraft(), approved: () => scenarioAWithDraft(true) };
const B_NEXT: Record<CaseBStage, CaseBStage> = { asking: "one_answered", one_answered: "drafted", drafted: "approved", approved: "approved" };

export default function InboxesPreview() {
  const [view, setView] = useState<"questions" | "approvals">("questions");
  const [a, setA] = useState<AStage>("asking");
  const [b, setB] = useState<CaseBStage>("asking");
  const [empty, setEmpty] = useState(false);
  const cases: InboxCase[] = empty ? [] : [inboxCase(SCENARIO_A, A_AT[a]()), inboxCase(CASE_B, caseB(b))];
  const counts = inboxCounts(cases);
  const step = (caseId: string, to: "drafted" | "approved") => (caseId === SCENARIO_A.id ? setA(to) : setB(B_NEXT[b]));

  const navItem = (id: typeof view, label: string, n: number) => (
    <button type="button" onClick={() => setView(id)} aria-current={view === id ? "page" : undefined}
      className={cx("flex w-full items-center justify-between rounded-md px-3 py-2 text-[13.5px] font-semibold", view === id ? "bg-sunken text-ink" : "text-ink-2 hover:text-ink")}>
      {label}{n > 0 && <span className="text-meta text-ink-3">{n}</span>}
    </button>
  );

  return (
    <div className="flex h-dvh min-w-[1280px] overflow-hidden bg-bg text-ink">
      <nav aria-label="Inboxes" className="flex w-[200px] flex-none flex-col gap-1 border-r border-line bg-surface px-3 py-4">
        <p className="mb-2 px-3 text-meta text-ink-3">Preview, remove at integration</p>
        {navItem("questions", "Questions", counts.questions)}
        {navItem("approvals", "Approvals", counts.approvals)}
        <div className="mt-auto flex flex-col gap-2 px-3 text-meta text-ink-2">
          <label className="flex items-center gap-2"><input type="checkbox" checked={empty} onChange={(e) => setEmpty(e.target.checked)} />No cases</label>
          <button type="button" className="text-left underline" onClick={() => { setA("asking"); setB("asking"); }}>Start over</button>
          <ThemeToggle />
        </div>
      </nav>
      <main className="flex min-w-0 flex-1 flex-col">
        {view === "questions" ? (
          <QuestionsInbox items={questionItems(cases)} onOpen={() => {}} onReply={(caseId) => step(caseId, "drafted")} />
        ) : (
          <ApprovalsInbox items={approvalItems(cases)} onOpen={() => {}} onApprove={(caseId) => step(caseId, "approved")} />
        )}
      </main>
    </div>
  );
}
