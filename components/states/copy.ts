// Copy and prop types shared by every state variation (SPEC.md §8 "States to handle",
// docs/design.md §7.14). Spec strings are verbatim; do not reword them.

/** SPEC.md §8, verbatim (with the full stop from docs/design.md §7.14). */
export const EXTRACTION_FAILED = "Couldn't read part of this document; affected lines are waiting on answers.";
export const PASTE_INSTEAD = "Paste the text instead";

export const EMPTY_CASE = {
  title: "No invoice in this case yet.",
  body: "Add the forwarder's invoice and the quote to start checking.",
  action: "Load Scenario A",
} as const;

export const LOADING_LABEL = "Loading the case…";

/** "Rechecking 8 charges with your answer…" (docs/design.md §8, "you" per §0). */
export const recheckingLabel = (count: number, source = "your answer") =>
  `Rechecking ${count} ${count === 1 ? "charge" : "charges"} with ${source}…`;

/** Where extraction failed and what it left waiting. Comes from the `extraction_failed` event. */
export type ExtractionFailure = {
  document: string;                 // "WhatsApp chat"
  where: string;                    // "messages 3–4"
  lines: { lineNo: number; description: string }[];
};

/** Toasts confirm a human action only (docs/design.md §7.14). Undo where the action can be reversed. */
export const TOASTS = {
  dismissed: "Marked as not an issue. Saved to case history.",
  confirmed: "Kept in dispute. Saved to case history.",
  drafted: "Dispute drafted. Nothing was sent.",
  approved: "Approval saved. Nothing was sent.",
} as const;

export type ToastProps = { text: string; onUndo?: () => void; onClose?: () => void };

export const linesLabel = (lines: ExtractionFailure["lines"]) =>
  lines.map((l) => `line ${l.lineNo}, ${l.description}`).join("; ");
