// The case's two tab levels (docs/design.md §0.3 п.4). On top, underlined views: Review, Documents,
// History, each with an icon and a count. Inside Review, the segmented strip: Overview and one tab
// per issue, each saying what it is by shape (status glyph), its name and its amount; it scrolls
// sideways when a big case has many issues or the window is narrow.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cx } from "./cx";
import { DocumentsIcon, DraftIcon, HistoryIcon, ListIcon, OverviewIcon, StatusGlyph } from "./glyphs";
import type { Issue } from "./issues";

export type CaseView = "case" | "documents" | "history";

const VIEW_LABEL: Record<CaseView, string> = { case: "Review", documents: "Documents", history: "History" };
const VIEW_ICON: Record<CaseView, ReactNode> = {
  case: <ListIcon size={16} />, documents: <DocumentsIcon size={16} />, history: <HistoryIcon size={16} />,
};

type ViewsProps = { views: CaseView[]; view: CaseView; onView: (v: CaseView) => void; counts: Partial<Record<CaseView, number>> };

/** Review · Documents 6 · History 14: one row at every width. */
export function CaseViews({ views, view, onView, counts }: ViewsProps) {
  return (
    <nav role="tablist" aria-label="Case views" className="flex gap-5 overflow-x-auto border-b border-line px-6 [scrollbar-width:none]">
      {views.map((v) => (
        <button key={v} type="button" role="tab" id={`view-${v}`} aria-selected={view === v} onClick={() => onView(v)}
          className={cx("-mb-px flex h-10 flex-none items-center gap-1.5 whitespace-nowrap border-b-2 text-[13.5px] font-semibold",
            view === v ? "border-primary text-ink" : "border-transparent text-ink-3 hover:text-ink")}>
          {VIEW_ICON[v]}{VIEW_LABEL[v]}
          {counts[v] !== undefined && <span className="font-medium text-ink-3">{counts[v]}</span>}
        </button>
      ))}
    </nav>
  );
}

type Props = {
  issues: Issue[]; tab: string; onTab: (id: string) => void;
  /** Set when this screen doesn't answer questions: "Your answer" reads "Sam's answer". */
  answerer?: string;
};

/** Which ends of a sideways scroller still hide tabs, kept current on scroll, resize and when `content` changes. */
function useHiddenEnds(content: string) {
  const ref = useRef<HTMLDivElement>(null);
  const [ends, setEnds] = useState({ start: false, end: false });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => setEnds((was) => {
      const next = { start: el.scrollLeft > 1, end: el.scrollLeft + el.clientWidth < el.scrollWidth - 1 };
      return next.start === was.start && next.end === was.end ? was : next;
    });
    read();
    el.addEventListener("scroll", read, { passive: true });
    const ro = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(read);
    ro?.observe(el);
    return () => { el.removeEventListener("scroll", read); ro?.disconnect(); };
  }, [content]);
  return { ref, ends };
}

const FADE = 28;
const fade = ({ start, end }: { start: boolean; end: boolean }) => {
  if (!start && !end) return undefined;
  const mask = `linear-gradient(to right, ${start ? `transparent, black ${FADE}px` : "black"}, ${end ? `black calc(100% - ${FADE}px), transparent` : "black"})`;
  return { maskImage: mask, WebkitMaskImage: mask };
};

/** Overview and the issues; shown only in Review. Overview stays put; the issues scroll, faded where more hide. */
export function CaseTabs({ issues, tab, onTab, answerer }: Props) {
  const { ref, ends } = useHiddenEnds(issues.map((i) => `${i.id}:${i.title}`).join("|"));
  return (
    <nav role="tablist" aria-label="Case tabs" className="flex rounded-[11px] border border-line bg-sunken p-1">
      <Tab id="overview" on={tab === "overview"} onTab={onTab} icon={<OverviewIcon />}>Overview</Tab>
      {issues.length > 0 && <span aria-hidden="true" className="mx-2 my-1.5 w-px flex-none bg-line-strong" />}
      <div ref={ref} data-testid="issue-tabs" style={fade(ends)}
        className="flex min-w-0 flex-1 gap-1 overflow-x-auto [scrollbar-width:none]">
        {issues.map((i) => (
          <Tab key={i.id} id={i.id} on={tab === i.id} onTab={onTab} isNew={i.kind === "line" && i.isNew}
            icon={i.kind === "line" ? <span className={i.row.group === "waiting" ? "text-waiting" : "text-dispute"}><StatusGlyph group={i.row.group} /></span>
              : i.kind === "question" ? <span className="text-waiting"><StatusGlyph group="waiting" /></span>
              : <DraftIcon />}
            amount={<span className={cx("font-semibold", i.kind === "question" || (i.kind === "line" && i.row.group === "waiting") ? "text-waiting" : "text-dispute")}>{i.amount}</span>}>
            {answerer && i.title === "Your answer" ? `${answerer}'s answer` : i.title}
          </Tab>
        ))}
      </div>
    </nav>
  );
}

type TabProps = { id: string; on: boolean; onTab: (id: string) => void; icon: ReactNode; amount?: ReactNode; isNew?: boolean; children: ReactNode };

function Tab({ id, on, onTab, icon, amount, isNew, children }: TabProps) {
  return (
    <button type="button" role="tab" aria-selected={on} onClick={() => onTab(id)} id={`tab-${id}`}
      ref={(el) => { if (on) el?.scrollIntoView?.({ block: "nearest", inline: "nearest" }); }}
      className={cx("flex h-8 max-w-[300px] flex-none items-center gap-2 whitespace-nowrap rounded-lg px-3 text-[13px] font-medium",
        on ? "border border-line bg-surface text-ink shadow-card" : "border border-transparent text-ink-2 hover:bg-surface/60 hover:text-ink")}>
      <span className={cx("flex-none", !on && "opacity-80")}>{icon}</span>
      <span className="truncate">{children}</span>
      {amount && <span className="flex-none">{amount}</span>}
      {isNew && <span className="flex-none rounded-[5px] border border-primary-ring px-1 text-[10.5px] font-semibold leading-4 text-ink">New</span>}
    </button>
  );
}
