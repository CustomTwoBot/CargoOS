"use client";
// The app (docs/design.md §0.4): a ChatGPT-like sidebar (New case, the cases under "Needs you" and
// "Earlier", the account → Settings) and one of three places: an open case (invoice + CargoOS
// thread), New case, or Settings. There are no Questions or Approvals pages: what waits on you is
// "Needs you" plus the case's thread. Everything is seen and done as the person this device is set
// to (Settings → This device). The shell fits the window from 768px up.
// Replay mode only for now: every case is a DemoCase (recorded snapshots) and `useCaseStore`
// applies what people do on top. Live Convex data replaces this in SPEC W3 step 8.
import { Tooltip } from "@base-ui/react/tooltip";
import { useRef, useState, useSyncExternalStore } from "react";
import type { Person, Role } from "@/lib/types";
import { SCENARIO_B } from "@/components/demo/scenario-b/scenario-b";
import { NewCaseFlow } from "@/components/new-case/new-case-flow";
import { SettingsView } from "@/components/settings/settings-view";
import { AppShell } from "@/components/shell/app-shell";
import { caseLine, caseName } from "@/components/shell/case-status";
import { useDevicePerson } from "@/components/shell/person";
import { QuietToast } from "@/components/states/quiet";
import { ToastRegion } from "@/components/states/shared";
import { useCaseStore } from "./case-store";
import type { DemoCase } from "./demo-case";
import { SCENARIO_A } from "./fixture";
import { Sidebar, type View } from "./sidebar";
import { CASE_TOASTS, CaseWorkspace } from "./workspace";

type ToastItem = { id: number; text: string; undo?: () => void };

// The clock is read on the client only, so prerendering never bakes in a time ("today at …").
let clientNow: Date | undefined;
const useNow = () => useSyncExternalStore(() => () => {}, () => (clientNow ??= new Date()), () => null);

/** The recorded cases the demo opens with. Defined here because a DemoCase holds functions, which a server page can't pass. */
const DEMO_CASES: DemoCase[] = [SCENARIO_A, SCENARIO_B];

/** Forwarder names until every case carries `Case.forwarder` (SPEC §5.5). */
const FORWARDER: Record<string, string> = { [SCENARIO_A.id]: "Pacific Crest Logistics", [SCENARIO_B.id]: "Kestrel Bay Logistics" };

type Props = {
  cases?: DemoCase[];
  /** Overrides the roles of the device's person (tests of one role); the person still acts. */
  roles?: readonly Role[];
};

export function CaseScreen({ cases = DEMO_CASES, roles }: Props) {
  const person = useDevicePerson();
  const viewer: Person = roles ? { ...person, roles: [...roles] } : person;
  const [activeId, setActiveId] = useState(cases[0]?.id ?? "");
  const [view, setView] = useState<View>(cases.length ? "case" : "new");
  // Bumped on every open, so the case re-picks its pane: a case opened from "Needs you" lands on the thread.
  const [opened, setOpened] = useState(0);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const toastTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const clock = useNow();

  const toast = (text: string, undo?: () => void) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-2), { id, text, undo }]);
    toastTimers.current.push(setTimeout(() => setToasts((t) => t.filter((v) => v.id !== id)), 5000));
  };
  const store = useCaseStore(cases, toast, viewer);

  const demo = view === "case" ? cases.find((c) => c.id === activeId) : undefined;
  const open = (id: string) => { setActiveId(id); setView("case"); setOpened((n) => n + 1); };
  const actions = (id: string) => store.actionsFor(cases.find((c) => c.id === id)!);
  const sidebarCases = cases.map((c) => {
    const x = store.inputs[c.id];
    return { id: c.id, name: caseName(x, FORWARDER[c.id]), line: caseLine(x, viewer) };
  });
  const title = view === "new" ? "New case" : view === "settings" ? "Settings"
    : sidebarCases.find((c) => c.id === activeId)?.name ?? "CargoOS";
  const resetAll = () => {
    cases.forEach((c) => actions(c.id).reset(c.start));
    toast("Demo reset. Every case is back to before the answers.");
  };
  const exampleDocs = Object.fromEntries(cases.map((c) => [c.id, c.at(c.start).documents.map((d) => ({ title: d.title, type: d.type }))]));

  const toastList = toasts.map((t) => (
    <QuietToast key={t.id} text={t.text}
      onUndo={t.undo && (() => { t.undo!(); setToasts((all) => all.filter((v) => v.id !== t.id)); })}
      onClose={() => setToasts((all) => all.filter((v) => v.id !== t.id))} />
  ));

  return (
    <Tooltip.Provider delay={150}>
      <AppShell title={title} waiting={sidebarCases.some((c) => c.line.needs)}
        sidebar={(mode, close) => (
          <Sidebar mode={mode} person={viewer} view={view} activeId={activeId} cases={sidebarCases}
            onOpenCase={(id) => { open(id); close?.(); }}
            onNewCase={() => { setView("new"); close?.(); }}
            onSettings={() => { setView("settings"); close?.(); }} onClose={close} />
        )}>
        {view === "new" && (
          <NewCaseFlow exampleDocs={exampleDocs} uploadUrl="/upload/new" onLoadExample={(id) => (cases.some((c) => c.id === id) ? open(id) : undefined)}
            onCreate={() => toast("In this replay, new cases aren't read. Load an example to see a full check.")} />
        )}
        {view === "settings" && <SettingsView person={person} caseCount={cases.length} onReset={resetAll} />}
        {demo && (
          <CaseWorkspace key={`${demo.id}-${opened}`} demo={demo} x={store.inputs[demo.id]} local={store.state[demo.id]}
            actions={actions(demo.id)} viewer={viewer} now={clock}
            inbox={{ demo, x: store.inputs[demo.id], forwarder: FORWARDER[demo.id] }}
            toasts={<ToastRegion className={CASE_TOASTS}>{toastList}</ToastRegion>} />
        )}
        {!demo && <ToastRegion>{toastList}</ToastRegion>}
      </AppShell>
    </Tooltip.Provider>
  );
}
