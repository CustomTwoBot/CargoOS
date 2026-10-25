"use client";
// TEMPORARY preview of the cross-case inboxes (components/inboxes). Remove at integration, when
// the sidebar lists these views. Scenario A plus a synthetic second case; answering, accepting or
// rejecting moves the case to its next recorded stage. The person picker stands in for the
// screen's device setting (SPEC §8) and is not a product control.
import { useState } from "react";
import { SCENARIO_A, scenarioAAt } from "@/components/case/fixture";
import { cx } from "@/components/case/cx";
import { ThemeToggle } from "@/components/case/theme-toggle";
import { ApprovalsInbox } from "@/components/inboxes/approvals-inbox";
import { approvalItems, inboxCounts, questionItems, type InboxCase } from "@/components/inboxes/items";
import { MAYA, OPERATOR, SAM, type Person } from "@/components/inboxes/people";
import { QuestionsInbox } from "@/components/inboxes/questions-inbox";
import { CASE_B, caseB, inboxCase, scenarioAWithDraft, type CaseBStage } from "@/components/inboxes/sample";

type AStage = "asking" | "requested" | "accepted" | "rejected";
const A_AT: Record<AStage, () => ReturnType<typeof scenarioAAt>> = {
  asking: () => scenarioAAt("before"), requested: () => scenarioAWithDraft("requested"),
  accepted: () => scenarioAWithDraft("accepted"), rejected: () => scenarioAWithDraft("rejected"),
};
const B_NEXT: Record<CaseBStage, CaseBStage> = { asking: "one_answered", one_answered: "drafted", drafted: "approved", approved: "approved" };
const VIEWERS: Person[] = [OPERATOR, SAM, MAYA];

export default function InboxesPreview() {
  const [view, setView] = useState<"questions" | "approvals">("questions");
  const [viewer, setViewer] = useState<Person>(SAM);
  const [a, setA] = useState<AStage>("asking");
  const [b, setB] = useState<CaseBStage>("asking");
  const [empty, setEmpty] = useState(false);
  const cases: InboxCase[] = empty ? [] : [inboxCase(SCENARIO_A, A_AT[a]()), inboxCase(CASE_B, caseB(b))];
  const counts = inboxCounts(cases);
  const step = (caseId: string, to: AStage) => (caseId === SCENARIO_A.id ? setA(to) : setB(B_NEXT[b]));

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
          <label className="flex flex-col gap-1">Screen set to
            <select value={viewer.id} onChange={(e) => setViewer(VIEWERS.find((p) => p.id === e.target.value)!)}
              className="rounded-md border border-line-strong bg-surface px-2 py-1 text-ink">
              {VIEWERS.map((p) => <option key={p.id} value={p.id}>{p.title ? `${p.name} — ${p.title}` : "One operator"}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={empty} onChange={(e) => setEmpty(e.target.checked)} />No cases</label>
          <button type="button" className="text-left underline" onClick={() => { setA("asking"); setB("asking"); }}>Start over</button>
          <ThemeToggle />
        </div>
      </nav>
      <main className="flex min-w-0 flex-1 flex-col">
        {view === "questions" ? (
          <QuestionsInbox key={viewer.id} items={questionItems(cases)} viewer={viewer} onOpen={() => {}}
            onReply={(caseId) => step(caseId, "requested")} />
        ) : (
          <ApprovalsInbox key={viewer.id} items={approvalItems(cases)} viewer={viewer} onOpen={() => {}}
            onAccept={(caseId) => step(caseId, "accepted")} onReject={(caseId) => step(caseId, "rejected")} />
        )}
      </main>
    </div>
  );
}
