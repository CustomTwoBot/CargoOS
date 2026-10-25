// Icon rail and header (docs/design.md §7.1, §7.2; no role switcher per §0).
import Link from "next/link";
import { cx } from "./cx";
import { DocumentsIcon, HistoryIcon, ListIcon, Logo, QuestionsIcon } from "./glyphs";
import { ThemeToggle } from "./theme-toggle";

export function Rail({ openQuestion, active = "cases" }: { openQuestion: boolean; active?: "cases" | "documents" }) {
  const look = (on: boolean) => cx("relative grid size-[38px] place-items-center rounded-[10px] text-ink-3", on && "bg-sunken text-ink");
  const item = (label: string, icon: React.ReactNode, dot = false) => (
    <span title={label} aria-label={label} role="img" className={look(false)}>
      {icon}
      {dot && <b className="absolute right-1.5 top-1.5 size-[7px] rounded-full bg-waiting-fill" />}
    </span>
  );
  const link = (label: string, href: string, icon: React.ReactNode, on: boolean) => (
    <Link href={href} title={label} aria-label={label} aria-current={on ? "page" : undefined}
      className={cx(look(on), !on && "hover:text-ink")}>{icon}</Link>
  );
  return (
    <nav aria-label="Sections" className="flex w-[60px] flex-none flex-col items-center gap-2 border-r border-line bg-surface py-4">
      <span className="mb-2.5 text-ink"><Logo /></span>
      {link("Cases", "/", <ListIcon />, active === "cases")}
      {item("Questions", <QuestionsIcon />, openQuestion)}
      {link("Documents", "/documents", <DocumentsIcon />, active === "documents")}
      {item("History", <HistoryIcon />)}
    </nav>
  );
}

type HeaderProps = {
  title: string; checkedAgainst: string;
  pill: { label: string; tone: "waiting" | "neutral" };
  replay?: boolean;
  canDraft: boolean; draftDisabledReason?: string; onDraft?: () => void;
};

export function CaseHeader({ title, checkedAgainst, pill, replay, canDraft, draftDisabledReason, onDraft }: HeaderProps) {
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
        <p className="mt-0.5 text-[13px] text-ink-2">
          {checkedAgainst}{" "}
          <span className="text-ink-3">Synthetic data. Nothing is sent or paid automatically.</span>
        </p>
      </div>
      <div className="flex flex-none items-center gap-2.5">
        <ThemeToggle />
        {canDraft && (
          <button type="button" onClick={draftDisabledReason ? undefined : onDraft}
            aria-disabled={!!draftDisabledReason || undefined} title={draftDisabledReason}
            className="rounded-md bg-primary px-3.5 py-[7px] text-[13.5px] font-semibold text-primary-ink aria-disabled:cursor-not-allowed aria-disabled:opacity-50">
            Draft dispute
          </button>
        )}
      </div>
    </header>
  );
}
