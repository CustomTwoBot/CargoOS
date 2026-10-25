"use client";
// The app (docs/design.md §0.1–§0.3): a sidebar with the places shared by every case (the
// cross-case inboxes, the cases, New case, Settings) and the open case, whose own tabs, Documents
// and History live inside it. The shell fits the window from 768px up. Everything is seen and done
// as the person this device is set to (Settings → This device); roles come from that person.
// Replay mode only for now: every case is a DemoCase (recorded snapshots) and `useCaseStore`
// applies what people do on top. Live Convex data replaces this in SPEC W3 step 8.
import { Tooltip } from "@base-ui/react/tooltip";
import { useRef, useState, useSyncExternalStore } from "react";
import type { Person, Role } from "@/lib/types";
import { SCENARIO_B } from "@/components/demo/scenario-b/scenario-b";
import { ApprovalsInbox } from "@/components/inboxes/approvals-inbox";
import { approvalItems, questionItems, type InboxCase } from "@/components/inboxes/items";
import { QuestionsInbox } from "@/components/inboxes/questions-inbox";
import { CasesEmpty } from "@/components/new-case/cases-empty";
import { NewCaseFlow } from "@/components/new-case/new-case-flow";
import { SettingsView } from "@/components/settings/settings-view";
import { QuietToast } from "@/components/states/quiet";
import { ToastRegion } from "@/components/states/shared";
import { AppShell } from "@/components/shell/app-shell";
import { caseStatus, waitingOn } from "@/components/shell/case-status";
import { isUploaderOnly, useDevicePerson } from "@/components/shell/person";
import { useCaseStore } from "./case-store";
import { CasesList, type CaseSummary } from "./cases-list";
import type { DemoCase } from "./demo-case";
import { SCENARIO_A } from "./fixture";
import { issuesOf, openQuestions } from "./issues";
import { Sidebar, type Place, type View } from "./sidebar";
import { CaseWorkspace } from "./workspace";
import { latestDraft, totalsOf, type CaseInput } from "./view-model";

type ToastItem = { id: number; text: string; undo?: () => void };

// The clock is read on the client only, so prerendering never bakes in a time ("today at …").
let clientNow: Date | undefined;
const useNow = () => useSyncExternalStore(() => () => {}, () => (clientNow ??= new Date()), () => null);

/** The recorded cases the demo opens with. Defined here because a DemoCase holds functions, which a server page can't pass. */
const DEMO_CASES: DemoCase[] = [SCENARIO_A, SCENARIO_B];

/** Forwarder names for the inboxes until `Case.forwarder` lands (SPEC §5.5). */
const FORWARDER: Record<string, string> = { [SCENARIO_A.id]: "Pacific Crest Logistics", [SCENARIO_B.id]: "Kestrel Bay Logistics" };

type Props = {
  cases?: DemoCase[];
  /** Overrides the roles of the device's person (tests of one role); the person still acts. */
  roles?: readonly Role[];
};

export function CaseScreen({ cases = DEMO_CASES, roles: rolesOverride }: Props) {
  const person = useDevicePerson();
  const uploader = isUploaderOnly(person);
  const [activeId, setActiveId] = useState(cases[0]?.id ?? "");
  const [chosen, setView] = useState<View>(cases.length ? "case" : "cases");
  const [tabs, setTabs] = useState<Record<string, string>>({});
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const toastTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const clock = useNow();

  const toast = (text: string, undo?: () => void) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-2), { id, text, undo }]);
    toastTimers.current.push(setTimeout(() => setToasts((t) => t.filter((v) => v.id !== id)), 5000));
  };
  const store = useCaseStore(cases, toast, person);
  // An uploader has no inboxes and works on a case's documents (docs/design.md §0.3).
  const view: View = !uploader ? chosen
    : chosen === "questions" || chosen === "approvals" ? "cases" : chosen === "case" ? "documents" : chosen;

  const demo = cases.find((c) => c.id === activeId);
  const tabOf = (id: string) => tabs[id] ?? "overview";
  const setTab = (id: string, tab: string) => setTabs((t) => ({ ...t, [id]: tab }));
  const open = (id: string, tab = "overview") => { setActiveId(id); setTab(id, tab); setView(uploader ? "documents" : "case"); };

  const inboxCases: InboxCase[] = cases.map((c) => ({ demo: c, x: store.inputs[c.id], forwarder: FORWARDER[c.id] }));
  const counts = waitingOn(cases.map((c) => store.inputs[c.id]), person);
  const summaries: Record<string, CaseSummary> = Object.fromEntries(cases.map((c) => [c.id, summaryOf(store.inputs[c.id], person)]));
  const actions = (id: string) => store.actionsFor(cases.find((c) => c.id === id)!);
  const sidebarCases = cases.map((c) => ({ id: c.id, title: c.title, atStakeCents: summaries[c.id].atStakeCents, status: summaries[c.id].status }));
  const title = view === "questions" ? "Questions" : view === "approvals" ? "Approvals" : view === "new" ? "New case"
    : view === "settings" ? "Settings" : view === "cases" || !demo ? "Cases" : demo.title;
  // The device's person; a `roles` override (tests of one role) narrows what they can do.
  const viewer: Person = rolesOverride ? { ...person, roles: [...rolesOverride] } : person;
  const resetAll = () => {
    cases.forEach((c) => actions(c.id).reset(c.start));
    toast("Demo reset. Every case is back to before the answers.");
  };

  return (
    <Tooltip.Provider delay={150}>
      <AppShell title={title} waiting={counts.questions + counts.approvals > 0}
        sidebar={(mode, close) => (
          <Sidebar mode={mode} person={person} view={view} activeId={activeId} cases={sidebarCases} inbox={{ questions: counts.questions, approvals: counts.approvals }}
            onView={(p: Place) => { setView(p); close?.(); }} onOpenCase={(id) => { open(id, tabOf(id)); close?.(); }} onClose={close} />
        )}>
        {view === "cases" && (cases.length ? (
          <CasesList cases={cases} summaries={summaries} plain={uploader} onOpen={(id) => open(id, tabOf(id))} />
        ) : (
          <div className="pt-6"><CasesEmpty onNew={() => setView("new")} onLoadExample={() => undefined} examples={[]} /></div>
        ))}
        {view === "new" && (
          <div className="min-h-0 flex-1 overflow-auto">
            <NewCaseFlow onCancel={() => setView(cases.length ? "case" : "cases")}
              onLoadExample={(id) => (cases.some((c) => c.id === id) ? open(id) : undefined)}
              onCreate={() => { toast("In this replay, new cases aren't read. Open a recorded case to try the checks."); setView("cases"); }} />
          </div>
        )}
        {view === "questions" && (
          <QuestionsInbox items={questionItems(inboxCases)} viewer={viewer}
            onOpen={(caseId, qid) => open(caseId, qid)}
            onReply={(caseId, qid) => { actions(caseId).reply(qid); open(caseId); }} />
        )}
        {view === "approvals" && (
          <ApprovalsInbox items={approvalItems(inboxCases)} viewer={viewer}
            onOpen={(caseId) => open(caseId, "dispute")}
            onAccept={(caseId, draftId) => actions(caseId).accept(draftId)}
            onReject={(caseId, draftId, reason) => actions(caseId).reject(draftId, reason)}
            onMessageChange={(caseId, draftId, t) => actions(caseId).editMessage(draftId, t)} />
        )}
        {view === "settings" && <SettingsView person={person} caseCount={cases.length} onReset={resetAll} />}
        {demo && (view === "case" || view === "documents" || view === "history") && (
          <CaseWorkspace key={demo.id} demo={demo} x={store.inputs[demo.id]} local={store.state[demo.id]}
            actions={actions(demo.id)} viewer={viewer} view={view} now={clock}
            tab={tabOf(demo.id)} onTab={(t) => setTab(demo.id, t)} onView={setView}
            inbox={{ demo, x: store.inputs[demo.id], forwarder: FORWARDER[demo.id] }} />
        )}
        <ToastRegion>
          {toasts.map((t) => (
            <QuietToast key={t.id} text={t.text}
              onUndo={t.undo && (() => { t.undo!(); setToasts((all) => all.filter((v) => v.id !== t.id)); })}
              onClose={() => setToasts((all) => all.filter((v) => v.id !== t.id))} />
          ))}
        </ToastRegion>
      </AppShell>
    </Tooltip.Provider>
  );
}

/** Once the dispute is accepted nothing is left to decide, whatever the lines say. */
function noteOf(x: CaseInput, toDecide: number): string | undefined {
  if (latestDraft(x)?.status === "approved") return "Dispute accepted";
  return toDecide > 0 ? `${toDecide} to decide` : undefined;
}

function summaryOf(x: CaseInput, person: Person): CaseSummary {
  const t = totalsOf(x), issues = issuesOf(x);
  return {
    atStakeCents: t.atStakeCents, billedCents: t.billedCents, status: caseStatus(x, person),
    openQuestions: openQuestions(x).length, documents: x.documents.length, note: noteOf(x, issues.filter((i) => i.kind !== "dispute").length),
  };
}
