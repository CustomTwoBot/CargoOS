// Case header and the Draft dispute button (docs/design.md §0.2: one row plus one muted line; no
// role switcher per §0). What the invoice was checked against lives in Documents.
import type { ReactNode } from "react";
import { cx } from "./cx";

type HeaderProps = {
  title: string;
  pill: { label: string; tone: "waiting" | "neutral" };
  /** "Invoice PCL-INV-1012", "Pacific Crest Logistics": shown muted before Replay and the trust line. */
  facts: string[];
  replay?: boolean;
  actions?: ReactNode;
};

export const TRUST_LINE = "Synthetic data. Nothing is sent or paid automatically.";

export function CaseHeader({ title, pill, facts, replay, actions }: HeaderProps) {
  const line = [...facts, ...(replay ? ["Replay"] : [])];
  return (
    <header className="flex items-center justify-between gap-4 px-6 pb-2.5 pt-3">
      <div className="min-w-0">
        <h1 className="flex min-w-0 items-center gap-2.5 text-title font-[650] tracking-[-0.012em]">
          <span className="truncate" title={title}>{title}</span>
          <span data-testid="case-pill" className={cx("flex-none whitespace-nowrap rounded-full border px-2 text-xs font-semibold leading-5",
            pill.tone === "waiting" ? "border-waiting-line text-waiting" : "border-line-strong text-ink-2")}>
            {pill.label}
          </span>
        </h1>
        <p data-testid="case-facts" className="mt-0.5 truncate text-[13px] text-ink-3" title={[...line, TRUST_LINE].join(" · ")}>
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

/** "Draft dispute": primary; when it can't run, aria-disabled with the reason as its tooltip. */
export function DraftButton({ disabledReason, onDraft }: { disabledReason?: string; onDraft: () => void }) {
  return (
    <button type="button" onClick={disabledReason ? undefined : onDraft}
      aria-disabled={!!disabledReason || undefined} title={disabledReason}
      className="whitespace-nowrap rounded-md bg-primary px-3.5 py-[7px] text-[13.5px] font-semibold text-primary-ink aria-disabled:cursor-not-allowed aria-disabled:opacity-50">
      Draft dispute
    </button>
  );
}
