"use client";
// The app (docs/design.md §0.1–§0.3): a sidebar with the places shared by every case (the
// cross-case inboxes, the cases, New case, Settings) and the open case, whose own tabs, Documents
// and History live inside it. The shell fits the window from 768px up. Everything is seen and done
// as the person this device is set to (Settings → This device); roles come from that person.
// Live mode (SPEC W3 step 8): under a Convex provider, once the backend has the Scenario A case, its slot
// shows that case (live-store.ts) and Scenario B stays a replay. Everything is a replay without a Convex
// URL, while the live case loads, and with ?replay=1: a DemoCase (recorded snapshots) plus `useCaseStore`.
import { Tooltip } from "@base-ui/react/tooltip";
import { useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import type { Person, Role } from "@/lib/types";
import { useHasConvex } from "@/components/convex-provider";
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
import { useCaseStore, type Toast } from "./case-store";
import { CasesList, type CaseSummary } from "./cases-list";
import type { DemoCase } from "./demo-case";
import { SCENARIO_A } from "./fixture";
import { issuesOf, openQuestions } from "./issues";
import { useLiveCase, type LiveCase } from "./live-store";
import { Sidebar, type Place, type View } from "./sidebar";
import { CaseWorkspace } from "./workspace";
import { latestDraft, totalsOf, type CaseInput } from "./view-model";

type ToastItem = { id: number; text: string; undo?: () => void };

// The clock is read on the client only, so prerendering never bakes in a time ("today at …").
let clientNow: Date | undefined;
const useNow = () => useSyncExternalStore(() => () => {}, () => (clientNow ??= new Date()), () => null);

/** ?replay=1 keeps every case a replay even with a backend. Read on the client only. */
const useReplayParam = () => useSyncExternalStore(() => () => {},
  () => new URLSearchParams(window.location.search).get("replay") === "1", () => false);

/** The recorded cases the demo opens with. Defined here because a DemoCase holds functions, which a server page can't pass. */
const DEMO_CASES: DemoCase[] = [SCENARIO_A, SCENARIO_B];

/** The replay case the live case stands in for. */
const LIVE_SLOT = SCENARIO_A.id;

/** Forwarder names for the replay inboxes; the live case carries its own `Case.forwarder`. */
const FORWARDER: Record<string, string> = { [SCENARIO_A.id]: "Pacific Crest Logistics", [SCENARIO_B.id]: "Kestrel Bay Logistics" };

type Props = {
  cases?: DemoCase[];
  /** Overrides the roles of the device's person (tests of one role); the person still acts. */
  roles?: readonly Role[];
};

type Toasts = { items: ToastItem[]; setItems: React.Dispatch<React.SetStateAction<ToastItem[]>>; toast: Toast };

function useToasts(): Toasts {
  const [items, setItems] = useState<ToastItem[]>([]);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const toast: Toast = (text, undo) => {
    const id = Date.now() + Math.random();
    setItems((t) => [...t.slice(-2), { id, text, undo }]);
    timers.current.push(setTimeout(() => setItems((t) => t.filter((v) => v.id !== id)), 5000));
  };
  return { items, setItems, toast };
}

export function CaseScreen(props: Props) {
  const person = useDevicePerson();
  const toasts = useToasts();
  const hasConvex = useHasConvex();
  const replayOnly = useReplayParam();
  const screen = (live?: LiveCase) => <Screen {...props} person={person} toasts={toasts} live={live} />;
  return hasConvex && !replayOnly ? <LiveSource person={person} toast={toasts.toast} render={screen} /> : screen();
}

/** Only rendered under a Convex provider: convex/react's hooks throw outside one. */
function LiveSource({ person, toast, render }: { person: Person; toast: Toast; render: (live?: LiveCase) => ReactNode }) {
  return render(useLiveCase(person, toast));
}

type ScreenProps = Props & { person: Person; toasts: Toasts; live?: LiveCase };

function Screen({ cases: given = DEMO_CASES, roles: rolesOverride, person, toasts: { items: toasts, setItems: setToasts, toast }, live }: ScreenProps) {
  const uploader = isUploaderOnly(person);
  const [activeId, setActiveId] = useState(given[0]?.id ?? "");
  const [chosen, setView] = useState<View>(given.length ? "case" : "cases");
  const [tabs, setTabs] = useState<Record<string, string>>({});
  const clock = useNow();

  // The replay store keeps every recorded case but the one the live case stands in for.
  const isLive = !!live;
  const replayCases = useMemo(() => (isLive ? given.filter((c) => c.id !== LIVE_SLOT) : given), [given, isLive]);
  const store = useCaseStore(replayCases, toast, person);
  const cases = live ? given.map((c) => (c.id === LIVE_SLOT ? live.demo : c)) : given;
  const inputs: Record<string, CaseInput> = live ? { ...store.inputs, [live.demo.id]: live.x } : store.inputs;
  const localOf = (id: string) => (live && id === live.demo.id ? live.local : store.state[id]);
  const actions = (id: string) => (live && id === live.demo.id ? live.actions : store.actionsFor(cases.find((c) => c.id === id)!));
  const forwarderOf = (id: string) => FORWARDER[id] ?? inputs[id]?.case.forwarder;

  // An uploader has no inboxes and works on a case's documents (docs/design.md §0.3).
  const view: View = !uploader ? chosen
    : chosen === "questions" || chosen === "approvals" ? "cases" : chosen === "case" ? "documents" : chosen;

  // The live case's id changes with every reset, and the slot switches between replay and live: an id
  // that is no longer listed is that slot.
  const activeKey = cases.some((c) => c.id === activeId) ? activeId : live ? live.demo.id : LIVE_SLOT;
  const demo = cases.find((c) => c.id === activeKey);
  const tabOf = (id: string) => tabs[id] ?? "overview";
  const setTab = (id: string, tab: string) => setTabs((t) => ({ ...t, [id]: tab }));
  const open = (id: string, tab = "overview") => { setActiveId(id); setTab(id, tab); setView(uploader ? "documents" : "case"); };

  const inboxCases: InboxCase[] = cases.map((c) => ({ demo: c, x: inputs[c.id], forwarder: forwarderOf(c.id) }));
  const counts = waitingOn(cases.map((c) => inputs[c.id]), person);
  const summaries: Record<string, CaseSummary> = Object.fromEntries(cases.map((c) => [c.id, summaryOf(inputs[c.id], person)]));
  const sidebarCases = cases.map((c) => ({ id: c.id, title: c.title, atStakeCents: summaries[c.id].atStakeCents, status: summaries[c.id].status }));
  const title = view === "questions" ? "Questions" : view === "approvals" ? "Approvals" : view === "new" ? "New case"
    : view === "settings" ? "Settings" : view === "cases" || !demo ? "Cases" : demo.title;
  // The device's person; a `roles` override (tests of one role) narrows what they can do.
  const viewer: Person = rolesOverride ? { ...person, roles: [...rolesOverride] } : person;
  // Live, the slot's reset is resetLiveDemo; the replays go back to their first snapshot.
  const resetAll = () => {
    cases.forEach((c) => actions(c.id).reset(c.start));
    toast("Demo reset. Every case is back to before the answers.");
  };

  return (
    <Tooltip.Provider delay={150}>
      <AppShell title={title} waiting={counts.questions + counts.approvals > 0}
        sidebar={(mode, close) => (
          <Sidebar mode={mode} replay={!live} person={person} view={view} activeId={activeKey} cases={sidebarCases} inbox={{ questions: counts.questions, approvals: counts.approvals }}
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
            onReply={(caseId, qid, text) => { actions(caseId).reply(qid, text); open(caseId); }} />
        )}
        {view === "approvals" && (
          <ApprovalsInbox items={approvalItems(inboxCases)} viewer={viewer}
            onOpen={(caseId) => open(caseId, "dispute")}
            onAccept={(caseId, draftId) => actions(caseId).accept(draftId)}
            onReject={(caseId, draftId, reason) => actions(caseId).reject(draftId, reason)}
            onMessageChange={(caseId, draftId, t) => actions(caseId).editMessage(draftId, t)} />
        )}
        {view === "settings" && <SettingsView person={person} caseCount={cases.length} onReset={resetAll} mode={live ? "live" : "replay"} />}
        {demo && (view === "case" || view === "documents" || view === "history") && (
          <CaseWorkspace key={demo.id} demo={demo} x={inputs[demo.id]} local={localOf(demo.id)}
            actions={actions(demo.id)} viewer={viewer} view={view} now={clock}
            tab={tabOf(demo.id)} onTab={(t) => setTab(demo.id, t)} onView={setView}
            inbox={{ demo, x: inputs[demo.id], forwarder: forwarderOf(demo.id) }} />
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
