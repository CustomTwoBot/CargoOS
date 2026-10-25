// Screen states, quiet and in place: every state lives inside the card it affects. The screen keeps
// its geometry; only the affected card changes (docs/design.md §7.14 as written).
import { cx } from "@/components/case/cx";
import { StatusGlyph } from "@/components/case/glyphs";
import {
  EMPTY_CASE, EXTRACTION_FAILED, LOADING_LABEL, PASTE_INSTEAD, linesLabel, recheckingLabel,
  type ExtractionFailure, type ToastProps,
} from "./copy";
import { Busy, PRIMARY_BUTTON, ROW_BUTTON } from "./shared";

/** Numbers that are about to change fade to 45% while the engine rechecks (§7.14). */
export const QUIET_DIM = "opacity-45 transition-opacity";

const Bone = ({ className }: { className: string }) => <i aria-hidden="true" className={cx("block rounded-[5px] bg-sunken", className)} />;

/** Loading: skeletons in the finished screen's geometry. Static, no shimmer (one motion only, §9). */
export function QuietSkeleton() {
  return (
    <div className="grid gap-2.5" aria-busy="true">
      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-8 rounded-xl border border-line bg-surface px-[22px] py-3.5 shadow-card">
        <div className="grid gap-2">
          <Bone className="h-3 w-36" /><Bone className="h-10 w-28" /><Bone className="h-3 w-52" />
        </div>
        <div className="grid gap-2.5">
          <div className="flex justify-between text-meta text-ink-3">
            <Busy label={LOADING_LABEL} /><Bone className="h-3 w-32" />
          </div>
          <Bone className="h-2.5 w-full" />
          <div className="flex gap-[26px]"><Bone className="h-8 w-28" /><Bone className="h-8 w-20" /><Bone className="h-8 w-28" /></div>
        </div>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {[0, 1, 2, 3].map((i) => <div key={i} className="h-[46px] rounded-lg border border-line bg-surface p-3"><Bone className="h-3.5 w-3/4" /></div>)}
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_300px] gap-4">
        <div className="grid gap-0 rounded-xl border border-line bg-surface py-2 shadow-card">
          {["w-24", "w-40", "w-20"].map((w, g) => (
            <div key={g} className="grid gap-0">
              <div className="flex justify-between bg-sunken/60 px-4 py-2"><Bone className={cx("h-3", w)} /><Bone className="h-3 w-12" /></div>
              {[0, 1].map((r) => (
                <div key={r} className="grid grid-cols-[minmax(0,1fr)_120px_70px] gap-3 px-4 py-2.5">
                  <Bone className="h-3.5 w-2/3" /><Bone className="h-3.5 w-20" /><Bone className="ml-auto h-3.5 w-12" />
                </div>
              ))}
            </div>
          ))}
        </div>
        <div className="grid content-start gap-3 rounded-xl border border-line bg-surface p-4 shadow-card">
          <Bone className="h-3.5 w-24" /><Bone className="h-3 w-full" /><Bone className="h-3 w-5/6" /><Bone className="h-16 w-full" />
        </div>
      </div>
    </div>
  );
}

/** Rechecking: replaces "Checked today at 1:05 PM" in the totals card. Pair with QUIET_DIM on the numbers. */
export function QuietRecheckLine({ count, source }: { count: number; source?: string }) {
  return <Busy label={recheckingLabel(count, source)} className="text-meta text-ink-2" />;
}

/** Extraction failed: one banner above the list. Names the document, the place and what it left waiting. */
export function QuietFailedBanner({ failure, onPaste }: { failure: ExtractionFailure; onPaste?: () => void }) {
  return (
    <div role="alert" className="flex items-start gap-3 rounded-lg bg-waiting-tint px-4 py-3 text-waiting">
      <span className="mt-[3px]"><StatusGlyph group="waiting" /></span>
      <div className="min-w-0 flex-1">
        <p className="text-body font-semibold">{EXTRACTION_FAILED}</p>
        <p className="mt-0.5 text-[13px]">
          {failure.document}, {failure.where}. Waiting: {linesLabel(failure.lines)}.
        </p>
      </div>
      <button type="button" onClick={onPaste} className={cx(ROW_BUTTON, "flex-none")}>{PASTE_INSTEAD}</button>
    </div>
  );
}

/** Empty case: the message sits inside the list card, where the lines would be. */
export function QuietEmpty({ onLoad }: { onLoad?: () => void }) {
  return (
    <div className="px-6 py-8">
      <h2 className="text-panel font-semibold text-ink">{EMPTY_CASE.title}</h2>
      <p className="mt-1 text-body text-ink-2">{EMPTY_CASE.body}</p>
      <button type="button" onClick={onLoad} className={cx(PRIMARY_BUTTON, "mt-4")}>{EMPTY_CASE.action}</button>
    </div>
  );
}

/** One line, dark, Undo as a text button. */
export function QuietToast({ text, onUndo, onClose }: ToastProps) {
  return (
    <div role="status" className="flex items-center gap-4 rounded-[10px] bg-ink py-2.5 pl-3.5 pr-2.5 text-[13px] text-bg shadow-[0_8px_24px_rgba(0,0,0,.18)]">
      <span>{text}</span>
      {onUndo && <button type="button" onClick={onUndo} className="rounded-[6px] px-1.5 font-semibold underline underline-offset-2">Undo</button>}
      {onClose && <button type="button" onClick={onClose} aria-label="Close" className="rounded-[6px] px-1 text-bg/70">×</button>}
    </div>
  );
}
