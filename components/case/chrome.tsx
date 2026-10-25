// Case header and the Draft dispute button (docs/design.md §7.2; no role switcher per §0).
import type { ReactNode } from "react";
import { cx } from "./cx";
import { ThemeToggle } from "./theme-toggle";

type HeaderProps = {
  title: string; checkedAgainst: string;
  pill: { label: string; tone: "waiting" | "neutral" };
  replay?: boolean;
  actions?: ReactNode;
};

export function CaseHeader({ title, checkedAgainst, pill, replay, actions }: HeaderProps) {
  return (
    <header className="flex items-center justify-between gap-4 px-6 pb-2.5 pt-3.5">
      <div className="min-w-0">
        <h1 className="flex items-center gap-2.5 text-title font-[650] tracking-[-0.012em]">
          {title}
          <span className={cx("rounded-full border px-2 text-xs font-semibold leading-5",
            pill.tone === "waiting" ? "border-waiting-line text-waiting" : "border-line-strong text-ink-2")}>
            {pill.label}
          </span>
          {replay && (
            <span title="Replay of a recorded run. Nothing here reaches the backend or Claude."
              className="rounded-full border border-line-strong px-2 text-xs font-semibold leading-5 text-ink-2">Replay</span>
          )}
        </h1>
        <p className="mt-0.5 flex min-w-0 gap-1 text-[13px] text-ink-2">
          <span className="truncate" title={checkedAgainst}>{checkedAgainst}</span>
          <span className="flex-none text-ink-3">Synthetic data. Nothing is sent or paid automatically.</span>
        </p>
      </div>
      <div className="flex flex-none items-center gap-2.5">
        <ThemeToggle />
        {actions}
      </div>
    </header>
  );
}

/** "Draft dispute": primary; when it can't run, aria-disabled with the reason as its tooltip. */
export function DraftButton({ disabledReason, onDraft }: { disabledReason?: string; onDraft: () => void }) {
  return (
    <button type="button" onClick={disabledReason ? undefined : onDraft}
      aria-disabled={!!disabledReason || undefined} title={disabledReason}
      className="rounded-md bg-primary px-3.5 py-[7px] text-[13.5px] font-semibold text-primary-ink aria-disabled:cursor-not-allowed aria-disabled:opacity-50">
      Draft dispute
    </button>
  );
}
