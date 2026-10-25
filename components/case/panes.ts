// The contract between the two panes of an open case (docs/design.md §0.4): the invoice canvas on
// the left (`components/canvas`) and the CargoOS thread on the right (`components/thread`). The
// workspace owns the layout and the shared focus; each pane only reads the case and asks for focus.
import type { Person } from "@/lib/types";
import type { CaseActions, CaseLocal } from "./case-store";
import type { DemoCase } from "./demo-case";
import type { CaseInput } from "./view-model";

/** Everything both panes read about the open case. */
export type CaseContext = {
  demo: DemoCase; x: CaseInput; local: CaseLocal; actions: CaseActions;
  /** The device's person (§0.3); their roles decide what each pane offers. */
  viewer: Person;
  /** Client clock; null while prerendering. */
  now: Date | null;
  forwarder?: string;
};

/** What the canvas shows. The thread asks for it through `onFocus`; the canvas can change it too. */
export type Focus =
  | { kind: "invoice" }
  | { kind: "line"; key: string }
  | { kind: "doc"; docId: string; quote?: string }
  | { kind: "message"; draftId: string };

export const INVOICE: Focus = { kind: "invoice" };

export type CanvasProps = CaseContext & { focus: Focus; onFocus: (f: Focus) => void };
export type ThreadProps = CaseContext & { onFocus: (f: Focus) => void };
