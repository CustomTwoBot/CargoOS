// The case's tab strip (docs/design.md §0.1, §0.2): a segmented control on a sunken track. Each tab says
// what it is by shape (status glyph), names it, and carries its amount; the active one is a raised
// surface. Documents and History sit quietly at the right end and switch the view; they stay put
// while the issue tabs scroll sideways (a big case, a narrow window).
import type { ReactNode } from "react";
import { cx } from "./cx";
import { DraftIcon, OverviewIcon, StatusGlyph } from "./glyphs";
import type { Issue } from "./issues";

export type CaseView = "case" | "documents" | "history";

type Props = { issues: Issue[]; tab: string; onTab: (id: string) => void; view?: CaseView; onView?: (v: CaseView) => void };

export function CaseTabs({ issues, tab, onTab, view = "case", onView }: Props) {
  const inCase = view === "case";
  return (
    <nav role="tablist" aria-label="Case tabs" className="flex gap-1 rounded-[11px] border border-line bg-sunken p-1">
      <div data-testid="issue-tabs" className="flex min-w-0 flex-1 gap-1 overflow-x-auto [scrollbar-width:none]">
        <Tab id="overview" on={inCase && tab === "overview"} onTab={onTab} icon={<OverviewIcon />}>Overview</Tab>
        {issues.length > 0 && <span aria-hidden="true" className="mx-1 my-1.5 w-px flex-none bg-line-strong" />}
        {issues.map((i) => (
          <Tab key={i.id} id={i.id} on={inCase && tab === i.id} onTab={onTab} isNew={i.kind === "line" && i.isNew}
            icon={i.kind === "line" ? <span className={i.row.group === "waiting" ? "text-waiting" : "text-dispute"}><StatusGlyph group={i.row.group} /></span>
              : i.kind === "question" ? <span className="text-waiting"><StatusGlyph group="waiting" /></span>
              : <DraftIcon />}
            amount={<span className={cx("font-semibold", i.kind === "question" || (i.kind === "line" && i.row.group === "waiting") ? "text-waiting" : "text-dispute")}>{i.amount}</span>}>
            {i.title}
          </Tab>
        ))}
      </div>
      {onView && (
        <span className="flex flex-none gap-1">
          <span aria-hidden="true" className="mx-1 my-1.5 w-px flex-none bg-line-strong" />
          {(["documents", "history"] as const).map((v) => (
            <button key={v} type="button" role="tab" id={`tab-${v}`} aria-selected={view === v} onClick={() => onView(v)}
              className={cx("h-8 flex-none whitespace-nowrap rounded-lg border px-3 text-[13px] font-medium",
                view === v ? "border-line bg-surface text-ink shadow-card" : "border-transparent text-ink-3 hover:text-ink")}>
              {v === "documents" ? "Documents" : "History"}
            </button>
          ))}
        </span>
      )}
    </nav>
  );
}

type TabProps = { id: string; on: boolean; onTab: (id: string) => void; icon: ReactNode; amount?: ReactNode; isNew?: boolean; children: ReactNode };

function Tab({ id, on, onTab, icon, amount, isNew, children }: TabProps) {
  return (
    <button type="button" role="tab" aria-selected={on} onClick={() => onTab(id)} id={`tab-${id}`}
      ref={(el) => { if (on) el?.scrollIntoView?.({ block: "nearest", inline: "nearest" }); }}
      className={cx("flex h-8 max-w-[260px] flex-none items-center gap-2 whitespace-nowrap rounded-lg px-3 text-[13px] font-medium",
        on ? "border border-line bg-surface text-ink shadow-card" : "border border-transparent text-ink-2 hover:bg-surface/60 hover:text-ink")}>
      <span className={cx("flex-none", !on && "opacity-80")}>{icon}</span>
      <span className="truncate">{children}</span>
      {amount && <span className="flex-none">{amount}</span>}
      {isNew && <span className="flex-none rounded-[5px] border border-primary-ring px-1 text-[10.5px] font-semibold leading-4 text-ink">New</span>}
    </button>
  );
}
