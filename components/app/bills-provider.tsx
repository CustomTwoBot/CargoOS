"use client";
// Every bill the app knows, in one shape, for every page under the app frame (docs/design.md §0.5).
// Replay bills are recorded DemoCases acted on through case-store; live bills come from Convex
// (live-store): the seeded Scenario A case stands in for its replay once it loads, and cases created
// on this device (/bills/new) are remembered in localStorage and read by id. Live values flow down
// through nested sources, so no hook runs outside a Convex provider and nothing is copied into state.
import { Tooltip } from "@base-ui/react/tooltip";
import { useMutation, useQuery } from "convex/react";
import { Component, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import type { Person } from "@/lib/types";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useHasConvex } from "@/components/convex-provider";
import { billForwarder } from "./bill-name";
import { SCENARIO_B } from "@/components/demo/scenario-b/scenario-b";
import { useCaseStore, type CaseActions, type CaseLocal, type Toast } from "@/components/case/case-store";
import type { DemoCase } from "@/components/case/demo-case";
import { SCENARIO_A } from "@/components/case/fixture";
import { errorText, useLiveCase, useLiveCaseById, type LiveCase } from "@/components/case/live-store";
import type { CaseInput } from "@/components/case/view-model";
import { QuietToast } from "@/components/states/quiet";
import { ToastRegion } from "@/components/states/shared";
import { useDevicePerson } from "@/components/shell/person";

export type Bill = {
  /** The id in the URL: a replay case's id, Scenario A's id for its live stand-in, or a Convex case id. */
  id: string;
  demo: DemoCase; x: CaseInput; local: CaseLocal; actions: CaseActions;
  forwarder: string;
  /** "PCL-INV-1012", from the invoice document's title when there is one. */
  invoiceRef?: string;
  live: boolean;
  /** Created on this device (/bills/new): not part of the demo reset. */
  created?: boolean;
};

export type BillsValue = {
  person: Person;
  bills: Bill[];
  bill: (id: string) => Bill | undefined;
  toast: Toast;
  /** "live" when the app has a Convex backend and isn't forced into replay with ?replay=1. */
  mode: "live" | "replay";
  now: Date | null;
  resetAll: () => void;
  /** Remember a case created on this device so it shows in the list. */
  rememberBill: (caseId: string) => void;
  /** Live, but the backend has no Scenario A case (never seeded): its slot shows the recorded run. */
  demoMissing?: boolean;
  /** Live only: seed the demo case (api.seed.resetLiveDemo). */
  setupDemo?: () => void;
};

const Ctx = createContext<BillsValue | null>(null);

export function useBills(): BillsValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useBills must be used inside <BillsProvider>");
  return v;
}

/** Forwarder names for the recorded cases; live cases carry their own `Case.forwarder`. */
const FORWARDER: Record<string, string> = { [SCENARIO_A.id]: "Pacific Crest Logistics", [SCENARIO_B.id]: "Kestrel Bay Logistics" };
const DEMO_CASES: DemoCase[] = [SCENARIO_A, SCENARIO_B];

export const invoiceRefOf = (x: CaseInput): string | undefined =>
  x.documents.find((d) => d.type === "freight_invoice")?.title.replace(/^Invoice\s+/i, "").replace(/\.(pdf|png|jpe?g|txt|eml)$/i, "");

// ---- device-level memory -------------------------------------------------

const BILLS_KEY = "cargoos.bills";
const billListeners = new Set<() => void>();
let billsCache: { raw: string | null; ids: string[] } = { raw: null, ids: [] };
const readBills = (): string[] => {
  let raw: string | null = null;
  try { raw = localStorage.getItem(BILLS_KEY); } catch { /* private mode */ }
  if (raw === billsCache.raw) return billsCache.ids;
  let ids: string[] = [];
  try { const v = raw ? JSON.parse(raw) : []; ids = Array.isArray(v) ? v.filter((s): s is string => typeof s === "string") : []; } catch { ids = []; }
  billsCache = { raw, ids };
  return ids;
};
const EMPTY: string[] = [];
const subscribeBills = (l: () => void) => { billListeners.add(l); return () => { billListeners.delete(l); }; };
function rememberBillId(id: string) {
  const ids = readBills();
  if (ids.includes(id)) return;
  try { localStorage.setItem(BILLS_KEY, JSON.stringify([...ids, id])); } catch { /* not remembered */ }
  billListeners.forEach((l) => l());
}
const useRememberedBills = () => useSyncExternalStore(subscribeBills, readBills, () => EMPTY);

// The clock is read on the client only, so prerendering never bakes in a time.
let clientNow: Date | undefined;
const useNow = () => useSyncExternalStore(() => () => {}, () => (clientNow ??= new Date()), () => null);

/**
 * ?replay=1 keeps every case a replay even with a backend, for the rest of the tab's session; ?replay=0
 * turns that off again. Client only.
 */
const REPLAY_KEY = "cargoos.replay";
let replaySticky = false;
export const readReplay = () => {
  const param = new URLSearchParams(window.location.search).get("replay");
  if (param === "0") {
    replaySticky = false;
    try { sessionStorage.removeItem(REPLAY_KEY); } catch { /* private mode */ }
    return false;
  }
  if (replaySticky) return true;
  let stored = false;
  try { stored = sessionStorage.getItem(REPLAY_KEY) === "1"; } catch { /* private mode */ }
  if (stored || param === "1") {
    replaySticky = true;
    try { sessionStorage.setItem(REPLAY_KEY, "1"); } catch { /* not remembered */ }
  }
  return replaySticky;
};
const useReplayParam = () => useSyncExternalStore(() => () => {}, readReplay, () => false);

// ---- toasts --------------------------------------------------------------

type ToastItem = { id: number; text: string; undo?: () => void };

function useToasts() {
  const [items, setItems] = useState<ToastItem[]>([]);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const toast: Toast = useCallback((text, undo) => {
    const id = Date.now() + Math.random();
    setItems((t) => [...t.slice(-2), { id, text, undo }]);
    timers.current.push(setTimeout(() => setItems((t) => t.filter((v) => v.id !== id)), 5000));
  }, []);
  return { items, setItems, toast };
}

// ---- live sources --------------------------------------------------------

type Lives = { demo?: LiveCase; created: LiveCase[] };
type DemoSetup = { missing: boolean; setup?: () => void };

function LiveDemo({ person, toast, render }: { person: Person; toast: Toast; render: (l: LiveCase | undefined, d: DemoSetup) => ReactNode }) {
  // getDemoCase is null (not undefined, which is loading) when the backend was never seeded.
  const caseId = useQuery(api.cases.getDemoCase);
  const reset = useMutation(api.seed.resetLiveDemo);
  const setup = useCallback(() => {
    reset({ personId: person.id }).then(() => toast("Demo set up. The Pacific Crest bill is live."), (e: unknown) => toast(errorText(e)));
  }, [reset, person.id, toast]);
  return render(useLiveCase(person, toast), { missing: caseId === null, setup });
}

/** A remembered id the backend rejects (a link to something that isn't a case) is skipped, not fatal. */
class SkipOnError extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? null : this.props.children; }
}

/**
 * A case created on this device. It renders nothing: it reads the case and reports it, so the bills
 * keep one place in the tree however many cases are added (a moving tree would remount every page).
 */
function LiveReporter({ id, person, toast, onReport }: {
  id: string; person: Person; toast: Toast; onReport: (id: string, l: LiveCase | undefined) => void;
}) {
  const l = useLiveCaseById(id as Id<"cases">, person, toast);
  useEffect(() => { onReport(id, l); }, [id, l, onReport]);
  return null;
}

// ---- provider ------------------------------------------------------------

export function BillsProvider({ children, cases }: { children: ReactNode; cases?: DemoCase[] }) {
  const person = useDevicePerson();
  const { items, setItems, toast } = useToasts();
  const hasConvex = useHasConvex();
  const replayOnly = useReplayParam();
  const ids = useRememberedBills();
  const live = hasConvex && !replayOnly;

  const [reported, setReported] = useState<Record<string, LiveCase | undefined>>({});
  const onReport = useCallback((id: string, l: LiveCase | undefined) =>
    setReported((m) => (m[id] === l ? m : { ...m, [id]: l })), []);
  const created = live ? ids.flatMap((id) => reported[id] ?? []) : [];

  const body = (demo?: LiveCase, setup: DemoSetup = { missing: false }) => (
    <Bills person={person} toast={toast} lives={{ demo, created }} live={live} given={cases ?? DEMO_CASES} demoSetup={setup}>
      {children}
    </Bills>
  );

  return (
    <Tooltip.Provider delay={150}>
      {live && ids.map((id) => (
        <SkipOnError key={id}><LiveReporter id={id} person={person} toast={toast} onReport={onReport} /></SkipOnError>
      ))}
      {live ? <LiveDemo person={person} toast={toast} render={body} /> : body()}
      <ToastRegion>
        {items.map((t) => (
          <QuietToast key={t.id} text={t.text}
            onUndo={t.undo && (() => { t.undo!(); setItems((all) => all.filter((v) => v.id !== t.id)); })}
            onClose={() => setItems((all) => all.filter((v) => v.id !== t.id))} />
        ))}
      </ToastRegion>
    </Tooltip.Provider>
  );
}

function Bills({ person, toast, lives, live, given, demoSetup, children }: {
  person: Person; toast: Toast; lives: Lives; live: boolean; given: DemoCase[]; demoSetup: DemoSetup; children: ReactNode;
}) {
  const now = useNow();
  // The replay store keeps every recorded case but the one the live demo case stands in for.
  const liveDemo = lives.demo;
  const replayCases = useMemo(() => (liveDemo ? given.filter((c) => c.id !== SCENARIO_A.id) : given), [given, liveDemo]);
  const store = useCaseStore(replayCases, toast, person);

  const bills: Bill[] = [];
  for (const demo of given) {
    if (demo.id === SCENARIO_A.id && liveDemo) {
      bills.push({ id: demo.id, demo: liveDemo.demo, x: liveDemo.x, local: liveDemo.local, actions: liveDemo.actions,
        forwarder: liveDemo.x.case.forwarder ?? FORWARDER[demo.id], invoiceRef: invoiceRefOf(liveDemo.x), live: true });
      continue;
    }
    const x = store.inputs[demo.id];
    if (!x) continue;
    bills.push({ id: demo.id, demo, x, local: store.state[demo.id], actions: store.actionsFor(demo),
      forwarder: FORWARDER[demo.id] ?? x.case.forwarder ?? "Forwarder", invoiceRef: invoiceRefOf(x), live: false });
  }
  for (const l of lives.created) {
    bills.push({ id: l.x.case._id, demo: l.demo, x: l.x, local: l.local, actions: l.actions,
      // Made on /bills/new: no forwarder on the case, so read it from the invoice ("Harborline Freight").
      forwarder: l.x.case.forwarder ?? billForwarder(l.x), invoiceRef: invoiceRefOf(l.x), live: true, created: true });
  }

  const value: BillsValue = {
    person, bills, toast, now,
    bill: (id) => bills.find((b) => b.id === id || b.x.case._id === id),
    mode: live ? "live" : "replay",
    resetAll: () => {
      bills.filter((b) => !b.created).forEach((b) => b.actions.reset(b.demo.start));
      toast("Demo reset. Every bill is back to before the answers.");
    },
    rememberBill: rememberBillId,
    demoMissing: live && demoSetup.missing,
    setupDemo: live ? demoSetup.setup : undefined,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
