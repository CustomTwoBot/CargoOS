// Variation C, "Full panel": a state takes the whole work area under the header and offers one
// clear action. Nothing else on the screen competes with it.
import type { ReactNode } from "react";
import { cx } from "@/components/case/cx";
import { StatusGlyph } from "@/components/case/glyphs";
import {
  EMPTY_CASE, EXTRACTION_FAILED, LOADING_LABEL, PASTE_INSTEAD, recheckingLabel, type ExtractionFailure, type ToastProps,
} from "./copy";
import { Busy, PRIMARY_BUTTON } from "./shared";

/** Centered card, at most 520 wide. `tone="waiting"` for problems the operator has to act on. */
export function StatePanel({ title, children, action, tone = "neutral" }: {
  title: ReactNode; children?: ReactNode; action?: ReactNode; tone?: "neutral" | "waiting";
}) {
  return (
    <section className="grid h-full place-items-center p-6">
      <div className={cx("w-full max-w-[520px] rounded-xl border bg-surface px-7 py-6 shadow-card",
        tone === "waiting" ? "border-waiting-line" : "border-line")}>
        <h2 className="text-title font-[650] tracking-[-0.012em] text-ink">{title}</h2>
        {children && <div className="mt-2 text-body text-ink-2">{children}</div>}
        {action && <div className="mt-5 flex items-center gap-4">{action}</div>}
      </div>
    </section>
  );
}

export function PanelLoading() {
  return (
    <StatePanel title={<Busy label={LOADING_LABEL} />}>
      The invoice lines, totals and evidence appear here.
    </StatePanel>
  );
}

/** Rechecking: covers the lines with the answer being applied. Lines move once it closes. */
export function PanelRechecking({ count, source, answer }: { count: number; source?: string; answer: string }) {
  return (
    <StatePanel title={<Busy label={recheckingLabel(count, source)} />}>
      <blockquote className="rounded-lg bg-sunken px-3.5 py-2.5 text-[13.5px] text-ink">“{answer}”</blockquote>
      <p className="mt-2.5 text-meta text-ink-3">The lines that change move when the check is done.</p>
    </StatePanel>
  );
}

export function PanelFailed({ failure, onPaste, onKeepWaiting }: {
  failure: ExtractionFailure; onPaste?: () => void; onKeepWaiting?: () => void;
}) {
  return (
    <StatePanel tone="waiting"
      title={<span role="alert" className="flex items-start gap-2.5"><span className="mt-1.5 text-waiting"><StatusGlyph group="waiting" /></span>{EXTRACTION_FAILED}</span>}
      action={<>
        <button type="button" onClick={onPaste} className={PRIMARY_BUTTON}>{PASTE_INSTEAD}</button>
        {onKeepWaiting && <button type="button" onClick={onKeepWaiting} className="text-[13.5px] font-semibold text-ink-2 underline underline-offset-2">Keep them waiting</button>}
      </>}>
      <dl className="grid grid-cols-[96px_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-[13.5px]">
        <dt className="text-ink-3">Document</dt><dd className="text-ink">{failure.document}</dd>
        <dt className="text-ink-3">Where</dt><dd className="text-ink">{failure.where}</dd>
        <dt className="text-ink-3">Waiting</dt>
        <dd className="text-ink">{failure.lines.map((l) => <span key={l.lineNo} className="block">Line {l.lineNo}, {l.description}</span>)}</dd>
      </dl>
    </StatePanel>
  );
}

export function PanelEmpty({ onLoad }: { onLoad?: () => void }) {
  return (
    <StatePanel title={EMPTY_CASE.title}
      action={<button type="button" onClick={onLoad} className={PRIMARY_BUTTON}>{EMPTY_CASE.action}</button>}>
      {EMPTY_CASE.body}
    </StatePanel>
  );
}

/** Two lines: what happened, then where it went. Undo as a button. */
export function PanelToast({ text, onUndo, onClose }: ToastProps) {
  const [first, ...rest] = text.split(/(?<=\.)\s+/);
  return (
    <div role="status" className="flex w-[340px] items-start gap-3 rounded-xl bg-ink px-4 py-3 text-bg shadow-[0_8px_24px_rgba(0,0,0,.18)]">
      <div className="min-w-0 flex-1 text-[13px]">
        <b className="block font-semibold">{first}</b>
        {rest.length > 0 && <span className="text-bg/70">{rest.join(" ")}</span>}
      </div>
      {onUndo && <button type="button" onClick={onUndo} className="flex-none rounded-[7px] border border-bg/40 px-2.5 py-1 text-[13px] font-semibold">Undo</button>}
      {onClose && <button type="button" onClick={onClose} aria-label="Close" className="flex-none px-1 text-bg/70">×</button>}
    </div>
  );
}
