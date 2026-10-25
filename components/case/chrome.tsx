// Case header and the Draft dispute button (docs/design.md §0.2: one row plus one muted line; no
// role switcher per §0). What the invoice was checked against lives in Documents.
import type { ReactNode } from "react";
import { cx } from "./cx";

type HeaderProps = {
  title: string;
  /** Left out for a screen that sees no findings (the uploader). */
  pill?: { label: string; tone: "waiting" | "neutral" };
  /** "Invoice PCL-INV-1012", "Pacific Crest Logistics": shown muted before Replay and the trust line. */
  facts: string[];
  replay?: boolean;
  actions?: ReactNode;
};

export const TRUST_LINE = "Synthetic data. Nothing is sent or paid automatically.";

/**
 * "3x40HC" → "3×40HC". Host Grotesk draws the × by itself only where letter-spacing is 0, so the
 * tracked title showed "x" while rows showed "×"; writing it out makes every place agree.
 */
export const displayTitle = (t: string) => t.replace(/(\d)x(\d)/g, "$1×$2");

export function CaseHeader({ title, pill, facts, replay, actions }: HeaderProps) {
  const line = [...facts, ...(replay ? ["Replay"] : [])];
  return (
    <header className="flex items-center justify-between gap-4 px-6 pb-2.5 pt-3">
      <div className="min-w-0">
        <h1 className="flex min-w-0 items-center gap-2.5 text-title font-[650] tracking-[-0.012em]">
          <span className="truncate" title={displayTitle(title)}>{displayTitle(title)}</span>
          {pill && (
            <span data-testid="case-pill" className={cx("flex-none whitespace-nowrap rounded-full border px-2 text-xs font-semibold leading-5",
              pill.tone === "waiting" ? "border-waiting-line text-waiting" : "border-line-strong text-ink-2")}>
              {pill.label}
            </span>
          )}
        </h1>
        {/* Wraps below 1024 rather than cut the trust line (a spec string). */}
        <p data-testid="case-facts" className="mt-0.5 text-[13px] text-ink-3 lg:truncate" title={[...line, TRUST_LINE].join(" · ")}>
          {line.map((f) => (
            <span key={f}>
              {f === "Replay" ? <span title="Replay of a recorded run. Nothing here reaches the backend or Claude.">Replay</span> : f}
              {" · "}
            </span>
          ))}
          {TRUST_LINE}
        </p>
      </div>
      <div className="flex flex-none items-center gap-2">{actions}</div>
    </header>
  );
}

const PRIMARY = "whitespace-nowrap rounded-md bg-primary px-3.5 py-[7px] text-[13.5px] font-semibold text-primary-ink";
const SECONDARY = "whitespace-nowrap rounded-md border border-line-strong bg-surface px-3.5 py-[7px] text-[13.5px] font-semibold";

type DraftProps = {
  label?: "Draft dispute" | "Request approval";
  /** Why it can't run (tooltip), and, unless something else on screen says it, the same short next to it ("Answer 1 question first"). */
  blocked?: { why: string; short?: string };
  onDraft: () => void;
};

/**
 * "Draft dispute" for the owner, "Request approval" for the bookkeeper (§0.3). Primary when it can run;
 * otherwise a quiet secondary, aria-disabled, with the reason visible beside it.
 */
export function DraftButton({ label = "Draft dispute", blocked, onDraft }: DraftProps) {
  return (
    <span className="flex items-center gap-2.5">
      {blocked?.short && <span data-testid="draft-blocked" className="hidden text-right text-meta text-ink-3 sm:block">{blocked.short}</span>}
      <button type="button" onClick={blocked ? undefined : onDraft} aria-disabled={!!blocked || undefined} title={blocked?.why}
        className={blocked ? cx(SECONDARY, "cursor-not-allowed text-ink-3") : PRIMARY}>
        {label}
      </button>
    </span>
  );
}

/** Once a dispute is drafted, the header points at it instead of offering to draft again. */
export function OpenDisputeButton({ onOpen }: { onOpen: () => void }) {
  return <button type="button" onClick={onOpen} className={cx(SECONDARY, "text-ink hover:bg-sunken")}>Open dispute</button>;
}
