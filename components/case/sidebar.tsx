// The sidebar (docs/design.md §0.1, §7.1). Expanded it names every case with what is at stake and
// counts what waits on you; collapsed it is the 60px icon rail with dots. The choice is remembered
// in localStorage ("cargoos.sidebar"), wrapped in try/catch like the theme.
import { useSyncExternalStore, type ReactNode } from "react";
import { cx } from "./cx";
import { money } from "./format";
import {
  ApproveIcon, CasesIcon, CollapseIcon, DocumentsIcon, ExpandIcon, HistoryIcon, ListIcon, Logo, PlusIcon, QuestionsIcon,
} from "./glyphs";

export type View = "cases" | "case" | "documents" | "history" | "questions" | "approvals" | "new";

export type SidebarCase = { id: string; title: string; atStakeCents: number; openQuestions: number };

type Props = {
  view: View; onView: (v: View) => void;
  cases: SidebarCase[]; activeId: string; onOpenCase: (id: string) => void;
  counts: { questions: number; documents: number; events: number };
  /** Across every case: open questions and disputes waiting for a decision. */
  inbox: { questions: number; approvals: number };
  onQuestion: () => void;
  onNewCase?: () => void;
};

const KEY = "cargoos.sidebar";
const listeners = new Set<() => void>();
const readCollapsed = () => { try { return localStorage.getItem(KEY) === "collapsed"; } catch { return false; } };
const setCollapsed = (v: boolean) => {
  try { localStorage.setItem(KEY, v ? "collapsed" : "expanded"); } catch { /* not remembered */ }
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

export function Sidebar(p: Props) {
  const collapsed = useSyncExternalStore(subscribe, readCollapsed, () => false);
  return collapsed ? <Collapsed {...p} /> : <Expanded {...p} />;
}

const Badge = ({ n, tone = "neutral" }: { n: number; tone?: "waiting" | "neutral" }) => (
  n > 0 ? (
    <span className={cx("ml-auto min-w-5 rounded-full px-1.5 text-center text-[11px] font-semibold leading-[18px]",
      tone === "waiting" ? "bg-waiting-tint text-waiting" : "bg-sunken text-ink-3")}>{n}</span>
  ) : null
);

function Expanded({ view, onView, cases, activeId, onOpenCase, counts, inbox, onQuestion, onNewCase }: Props) {
  const active = cases.find((c) => c.id === activeId);
  const nav = (label: string, icon: ReactNode, on: boolean, onClick: () => void, badge?: ReactNode) => (
    <button type="button" onClick={onClick} aria-current={on ? "page" : undefined}
      className={cx("flex h-8 w-full items-center gap-2.5 rounded-lg px-2.5 text-[13.5px] font-medium",
        on ? "bg-sunken text-ink" : "text-ink-2 hover:bg-sunken hover:text-ink")}>
      <span className="text-ink-3">{icon}</span>{label}{badge}
    </button>
  );
  return (
    <nav aria-label="Sections" className="flex w-[232px] flex-none flex-col border-r border-line bg-surface">
      <div className="flex items-center gap-2 px-4 pb-3 pt-4">
        <span className="text-ink"><Logo /></span>
        <span className="text-[15px] font-[650] tracking-[-0.01em]">CargoOS</span>
        <button type="button" onClick={() => setCollapsed(true)} title="Collapse sidebar" aria-label="Collapse sidebar"
          className="ml-auto grid size-7 place-items-center rounded-md text-ink-3 hover:bg-sunken hover:text-ink"><CollapseIcon /></button>
      </div>

      <div className="px-2">
        <div className="px-2.5 pb-1 text-[11.5px] font-medium text-ink-3">Waiting on you</div>
        {nav("Questions", <QuestionsIcon />, view === "questions", () => onView("questions"), <Badge n={inbox.questions} tone="waiting" />)}
        {nav("Approvals", <ApproveIcon />, view === "approvals", () => onView("approvals"), <Badge n={inbox.approvals} tone="waiting" />)}
      </div>

      <div className="mt-2 px-2">
        <div className="flex items-center justify-between px-2.5 pb-1 pt-2">
          <button type="button" onClick={() => onView("cases")}
            className={cx("text-[11.5px] font-medium", view === "cases" ? "text-ink" : "text-ink-3 hover:text-ink")}>Cases</button>
          {onNewCase && (
            <button type="button" onClick={onNewCase} title="New case" aria-label="New case"
              className="grid size-6 place-items-center rounded-md text-ink-3 hover:bg-sunken hover:text-ink"><PlusIcon /></button>
          )}
        </div>
        <ul>
          {cases.map((c) => {
            const on = c.id === activeId && view !== "cases";
            return (
              <li key={c.id}>
                <button type="button" onClick={() => onOpenCase(c.id)} aria-current={on ? "page" : undefined}
                  className={cx("grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-lg px-2.5 py-1.5 text-left",
                    on ? "bg-sunken" : "hover:bg-sunken")}>
                  <span className="min-w-0">
                    <span className={cx("block truncate text-[13px] font-semibold", on ? "text-ink" : "text-ink-2")}>{c.title}</span>
                    {c.openQuestions > 0 && <span className="block text-[11.5px] text-waiting">{c.openQuestions} waiting on you</span>}
                  </span>
                  <span className={cx("text-[12.5px] font-semibold", c.atStakeCents ? "text-dispute" : "text-ink-3")}>{money(c.atStakeCents)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {active && (
        <div className="mt-3 border-t border-line px-2 pt-3">
          <div className="truncate px-2.5 pb-1 text-[11.5px] font-medium text-ink-3">{active.title}</div>
          {nav("Overview", <ListIcon />, view === "case", () => onView("case"))}
          {counts.questions > 0 && nav("Open question", <QuestionsIcon />, false, onQuestion, <Badge n={counts.questions} tone="waiting" />)}
          {nav("Documents", <DocumentsIcon />, view === "documents", () => onView("documents"), <Badge n={counts.documents} />)}
          {nav("History", <HistoryIcon />, view === "history", () => onView("history"), <Badge n={counts.events} />)}
        </div>
      )}

      <p className="mt-auto px-4 pb-4 text-[11.5px] leading-4 text-ink-3">
        Replay of a recorded run. Synthetic data. Nothing is sent or paid.
      </p>
    </nav>
  );
}

function Collapsed({ view, onView, cases, inbox }: Props) {
  const item = (label: string, icon: ReactNode, on: boolean, onClick: () => void, dot = false) => (
    <button type="button" title={label} aria-label={label} aria-current={on ? "page" : undefined} onClick={onClick}
      className={cx("relative grid size-[38px] place-items-center rounded-[10px] text-ink-3", on ? "bg-sunken text-ink" : "hover:text-ink")}>
      {icon}
      {dot && <b className="absolute right-1.5 top-1.5 size-[7px] rounded-full bg-waiting-fill" />}
    </button>
  );
  return (
    <nav aria-label="Sections" className="flex w-[60px] flex-none flex-col items-center gap-2 border-r border-line bg-surface py-4">
      <span className="mb-2.5 text-ink"><Logo /></span>
      {cases.length > 1 && item("All cases", <CasesIcon />, view === "cases", () => onView("cases"))}
      {item("Overview", <ListIcon />, view === "case", () => onView("case"))}
      {item("Questions", <QuestionsIcon />, view === "questions", () => onView("questions"), inbox.questions > 0)}
      {item("Approvals", <ApproveIcon />, view === "approvals", () => onView("approvals"), inbox.approvals > 0)}
      {item("Documents", <DocumentsIcon />, view === "documents", () => onView("documents"))}
      {item("History", <HistoryIcon />, view === "history", () => onView("history"))}
      <button type="button" onClick={() => setCollapsed(false)} title="Expand sidebar" aria-label="Expand sidebar"
        className="mt-auto grid size-[38px] place-items-center rounded-[10px] text-ink-3 hover:text-ink"><ExpandIcon /></button>
    </nav>
  );
}
