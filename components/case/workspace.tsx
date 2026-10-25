// One open case (docs/design.md §0.4 п.2, п.7): a 60px header, then the invoice canvas on the left
// and the CargoOS thread on the right. The workspace owns the shared focus (what the canvas shows)
// and the layout: thread 420px from 1280, 360px from 1024; below 1024 one pane at a time with an
// "Invoice · CargoOS" switch, opening on CargoOS when something there waits on this person. The
// demo controls and toasts float over the canvas, never over the thread or its answer box.
import { useState, type ReactNode } from "react";
import type { Person, Role } from "@/lib/types";
import { personById } from "@/lib/people";
import { CaseCanvas } from "@/components/canvas/case-canvas";
import type { InboxCase } from "@/components/inboxes/items";
import { caseHeading, caseSubline, pendingFor } from "@/components/shell/case-status";
import { CaseThread } from "@/components/thread/case-thread";
import { CaseMenu } from "./case-menu";
import type { CaseActions, CaseLocal } from "./case-store";
import { cx } from "./cx";
import type { DemoCase } from "./demo-case";
import { INVOICE, type CaseContext, type Focus } from "./panes";
import { canAct } from "./roles";
import type { CaseInput } from "./view-model";

/** The default person: Sam, every role (the one operator of §0). */
export const SAM: Person = personById("sam")!;

/** "Sam" from "Sam — owner". */
export const firstName = (p: Person) => p.name.split(" — ")[0];

export type WorkspaceProps = {
  demo: DemoCase; x: CaseInput; local: CaseLocal; actions: CaseActions;
  /** The person this screen is set to (§0.3); Sam when left out. */
  viewer?: Person;
  /** Narrows the viewer's roles (tests of one role). */
  roles?: readonly Role[];
  now: Date | null; inbox: InboxCase;
  /** Focus to open with (a line, a document); the invoice when left out. */
  focus?: Focus;
  /** The toasts, placed over the canvas. */
  toasts?: ReactNode;
};

type Pane = "invoice" | "thread";

const TRUST = "Synthetic data. Nothing is sent or paid automatically.";

export function CaseWorkspace({ demo, x, local, actions, viewer = SAM, roles, now, inbox, focus: initial, toasts }: WorkspaceProps) {
  const person: Person = roles ? { ...viewer, roles: [...roles] } : viewer;
  const waiting = pendingFor(x, person);
  const [focus, setFocus] = useState<Focus>(initial ?? INVOICE);
  const [pane, setPane] = useState<Pane>(waiting > 0 ? "thread" : "invoice");
  const ctx: CaseContext = { demo, x, local, actions, viewer: person, now, forwarder: inbox.forwarder };
  // A link in the thread shows its line or document on the canvas; below 1024 that means switching to it.
  const focusFromThread = (f: Focus) => { setFocus(f); setPane("invoice"); };

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-surface">
      <header className="flex h-[60px] flex-none items-center justify-between gap-4 border-b border-line px-4 md:px-6">
        <div className="min-w-0">
          <h1 className="truncate text-[17px] font-[650] tracking-[-0.01em]">{caseHeading(x, inbox.forwarder)}</h1>
          <p className="truncate text-meta text-ink-3">{[caseSubline(x), TRUST].filter(Boolean).join(" · ")}</p>
        </div>
        <div className="flex flex-none items-center gap-1.5">
          <span title="Replay of a recorded run. Nothing here reaches the backend or Claude."
            className="rounded-full border border-line-strong px-2.5 py-0.5 text-xs font-semibold text-ink-2">Replay</span>
          <CaseMenu x={x} onAddEvidence={canAct(person.roles, "addEvidence") ? actions.addEvidence : undefined}
            onReset={() => actions.reset(demo.start)} />
        </div>
      </header>

      <div role="group" aria-label="Show" className="flex flex-none justify-center border-b border-line bg-surface px-4 py-2 lg:hidden">
        <div className="flex rounded-[9px] border border-line bg-sunken p-0.5 text-[13px] font-semibold">
          <PaneButton on={pane === "invoice"} onClick={() => setPane("invoice")}>Invoice</PaneButton>
          <PaneButton on={pane === "thread"} onClick={() => setPane("thread")}>
            CargoOS{waiting > 0 && <span className="ml-1.5 rounded-full bg-waiting-tint px-1.5 text-[11.5px] leading-[18px] text-waiting">{waiting}</span>}
          </PaneButton>
        </div>
      </div>

      <div className="relative flex min-h-0 flex-1">
        <div className={cx("relative flex min-w-0 flex-1", pane === "thread" && "max-lg:hidden")}>
          <CaseCanvas {...ctx} focus={focus} onFocus={setFocus} />
          <DemoControls demo={demo} stage={local.stage} onGo={actions.reset} />
        </div>
        <div className={cx("flex min-h-0 w-[420px] flex-none max-xl:w-[360px] max-lg:w-full", pane === "invoice" && "max-lg:hidden")}>
          <CaseThread {...ctx} onFocus={focusFromThread} />
        </div>
        {toasts}
      </div>
    </div>
  );
}

/** Where the case's toasts go: over the canvas, right of centre, above the demo bar; at the top below 1024. */
export const CASE_TOASTS = "absolute bottom-14 right-[436px] max-xl:right-[376px] max-lg:inset-x-4 max-lg:bottom-auto max-lg:top-3";

const PaneButton = ({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) => (
  <button type="button" aria-pressed={on} onClick={onClick}
    className={cx("flex items-center rounded-[7px] px-3.5 py-1", on ? "bg-surface text-ink shadow-[0_0_0_1px_var(--line)]" : "text-ink-2 hover:text-ink")}>
    {children}
  </button>
);

/** Presenter controls for the replay (SPEC W3 step 1), centred over the canvas. Not part of the product UI. */
function DemoControls({ demo, stage, onGo }: { demo: DemoCase; stage: string; onGo: (s: string) => void }) {
  const seg = (s: string, label: string) => (
    <button type="button" aria-pressed={stage === s} onClick={() => onGo(s)}
      className={cx("rounded-[6px] px-2 py-0.5", stage === s ? "bg-line-strong text-ink" : "text-ink-3")}>{label}</button>
  );
  return (
    <div className="absolute bottom-3 left-1/2 z-30 flex -translate-x-1/2 items-center gap-1 whitespace-nowrap rounded-[9px] border border-line bg-surface p-[3px] text-xs font-medium shadow-card"
      role="group" aria-label="Demo controls">
      <span className="px-1.5 text-ink-3">Demo</span>
      {seg(demo.start, "Before answers")}{seg(demo.end, "After answers")}
      <button type="button" onClick={() => onGo(demo.start)} className="rounded-[6px] px-2 py-0.5 text-ink-3 hover:text-ink">Reset demo</button>
    </div>
  );
}
