// One open case (docs/design.md §0.4): a one-line header, then the invoice canvas on the left and
// the CargoOS thread on the right. The workspace owns the shared focus (what the canvas shows);
// both panes read the case from the store and act through `CaseActions`.
// SKELETON: the shell-sidebar session owns the final layout (header, ⋯ menu, widths below 1280).
import { useState } from "react";
import type { Person, Role } from "@/lib/types";
import { personById } from "@/lib/people";
import { CaseCanvas } from "@/components/canvas/case-canvas";
import type { InboxCase } from "@/components/inboxes/items";
import { CaseThread } from "@/components/thread/case-thread";
import type { CaseActions, CaseLocal } from "./case-store";
import { cx } from "./cx";
import type { DemoCase } from "./demo-case";
import { INVOICE, type CaseContext, type Focus } from "./panes";
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
};

export function CaseWorkspace({ demo, x, local, actions, viewer = SAM, roles, now, inbox, focus: initial }: WorkspaceProps) {
  const [focus, setFocus] = useState<Focus>(initial ?? INVOICE);
  const person: Person = roles ? { ...viewer, roles: [...roles] } : viewer;
  const ctx: CaseContext = { demo, x, local, actions, viewer: person, now, forwarder: inbox.forwarder };
  const invoice = x.documents.find((d) => d.type === "freight_invoice")?.title ?? x.case.title;

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-surface">
      <header className="flex h-[60px] flex-none items-center justify-between gap-4 border-b border-line px-6">
        <div className="min-w-0">
          <h1 className="truncate text-[17px] font-[650] tracking-[-0.01em]">{invoice}{inbox.forwarder ? ` from ${inbox.forwarder}` : ""}</h1>
          <p className="truncate text-meta text-ink-3">{x.case.title} · Synthetic data. Nothing is sent or paid automatically.</p>
        </div>
        <span className="flex-none rounded-full border border-line-strong px-2.5 py-0.5 text-xs font-semibold text-ink-2">Replay</span>
      </header>
      <div className="flex min-h-0 flex-1">
        <CaseCanvas {...ctx} focus={focus} onFocus={setFocus} />
        <CaseThread {...ctx} onFocus={setFocus} />
      </div>
      <DemoControls demo={demo} stage={local.stage} onGo={actions.reset} />
    </div>
  );
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
