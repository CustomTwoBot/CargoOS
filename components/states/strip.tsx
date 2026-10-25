// Variation B, "One status strip": a single 40px strip under the header carries every state,
// including the confirmation of a human action. The rest of the screen never changes shape.
import { cx } from "@/components/case/cx";
import { StatusGlyph } from "@/components/case/glyphs";
import {
  EMPTY_CASE, EXTRACTION_FAILED, LOADING_LABEL, PASTE_INSTEAD, linesLabel, recheckingLabel, type ExtractionFailure,
} from "./copy";
import { Busy, PRIMARY_BUTTON, ROW_BUTTON } from "./shared";

export type StripState =
  | { kind: "idle"; checked: string }                                       // "Checked today at 1:05 PM"
  | { kind: "loading" }
  | { kind: "rechecking"; count: number; source?: string }
  | { kind: "failed"; failure: ExtractionFailure; onPaste?: () => void }
  | { kind: "empty"; onLoad?: () => void }
  | { kind: "saved"; text: string; onUndo?: () => void };                   // a human action, shown ~5s then back to idle

/** What the body under the strip does in each state. */
export const STRIP_BODY: Record<StripState["kind"], string> = {
  idle: "", loading: "invisible", rechecking: "opacity-45 pointer-events-none transition-opacity",
  failed: "", empty: "invisible", saved: "",
};

export function StatusStrip({ state }: { state: StripState }) {
  const tone = state.kind === "failed" ? "border-waiting-line bg-waiting-tint text-waiting"
    : state.kind === "saved" ? "border-ink bg-ink text-bg"
    : "border-line bg-surface text-ink-2";
  return (
    <div data-testid="status-strip" data-state={state.kind}
      className={cx("flex min-h-10 items-center gap-3 rounded-lg border px-4 py-1.5 text-[13px]", tone)}>
      <StripBody state={state} />
    </div>
  );
}

function StripBody({ state: s }: { state: StripState }) {
  switch (s.kind) {
    case "idle":
      return <span>{s.checked}</span>;
    case "loading":
      return <Busy label={LOADING_LABEL} />;
    case "rechecking":
      return <Busy label={recheckingLabel(s.count, s.source)} className="font-medium text-ink" />;
    case "failed":
      return (
        <>
          <StatusGlyph group="waiting" />
          <span role="alert" className="min-w-0 flex-1">
            <b className="font-semibold">{EXTRACTION_FAILED}</b>{" "}
            <span>{s.failure.document}, {s.failure.where}. Waiting: {linesLabel(s.failure.lines)}.</span>
          </span>
          <button type="button" onClick={s.onPaste} className={cx(ROW_BUTTON, "flex-none py-0.5")}>{PASTE_INSTEAD}</button>
        </>
      );
    case "empty":
      return (
        <>
          <span className="min-w-0 flex-1"><b className="font-semibold text-ink">{EMPTY_CASE.title}</b> {EMPTY_CASE.body}</span>
          <button type="button" onClick={s.onLoad} className={cx(PRIMARY_BUTTON, "flex-none py-1")}>{EMPTY_CASE.action}</button>
        </>
      );
    case "saved":
      return (
        <>
          <span role="status" className="min-w-0 flex-1">{s.text}</span>
          {s.onUndo && <button type="button" onClick={s.onUndo} className="rounded-[6px] px-1.5 font-semibold underline underline-offset-2">Undo</button>}
        </>
      );
  }
}
