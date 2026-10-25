// The sidebar (docs/design.md §0.2 decision 1, §0.3): only places shared by every case. "Waiting on
// you" (Questions, Approvals), "Cases" (one line each: status dot, title, at stake) and New case, and
// at the bottom who this device is, which opens Settings. A case's own views live inside the case.
// An uploader sees only the cases (no amounts, no dots) and New case. Collapsed it is a 60px rail
// of icons with dots and case initials; in the drawer below 1024px it is the full sidebar.
import { Tooltip } from "@base-ui/react/tooltip";
import type { ReactNode } from "react";
import type { Person } from "@/lib/types";
import { Avatar } from "@/components/shell/avatar";
import { caseInitials, type CaseStatus } from "@/components/shell/case-status";
import { CloseIcon, SettingsIcon } from "@/components/shell/icons";
import { setSidebarPref, type SidebarMode } from "@/components/shell/layout";
import { WORKSPACE, displayName, firstName, isUploaderOnly, titleOf } from "@/components/shell/person";
import { StatusDot } from "@/components/shell/status-dot";
import { cx } from "./cx";
import { money } from "./format";
import { ApproveIcon, CasesIcon, CollapseIcon, ExpandIcon, Logo, PlusIcon, QuestionsIcon } from "./glyphs";

export type View = "cases" | "case" | "documents" | "history" | "questions" | "approvals" | "new" | "settings";
/** Where the sidebar can take you. Opening a case goes through `onOpenCase`. */
export type Place = "cases" | "questions" | "approvals" | "new" | "settings";

export type SidebarCase = { id: string; title: string; atStakeCents: number; status: CaseStatus };

export type SidebarProps = {
  mode: SidebarMode;
  /** The person this device is set to: shown at the bottom, and decides what the sidebar holds. */
  person: Person;
  view: View; onView: (p: Place) => void;
  cases: SidebarCase[]; activeId: string; onOpenCase: (id: string) => void;
  /** Across every case, what waits on `person`: questions they answer, disputes they decide or that came back. */
  inbox: { questions: number; approvals: number };
  /** Set in the drawer: shows a close button instead of collapse. */
  onClose?: () => void;
};

const REPLAY = "Replay of a recorded run. Synthetic data. Nothing is sent or paid.";
const settingsLabel = (p: Person) => `Settings. This device: ${displayName(p)}`;

export function Sidebar(p: SidebarProps) {
  const { mode, onClose } = p;
  return (
    <nav aria-label="Sections"
      className={cx("flex h-full flex-none bg-surface",
        onClose ? "w-full" : "border-r border-line",
        !onClose && (mode === "expanded" ? "w-[256px]" : mode === "collapsed" ? "w-[60px]" : "w-[60px] xl:w-[256px]"))}>
      {mode !== "collapsed" && <Full {...p} className={mode === "auto" ? "max-xl:hidden" : undefined} />}
      {mode !== "expanded" && <Rail {...p} className={mode === "auto" ? "xl:hidden" : undefined} />}
    </nav>
  );
}

const inCase = (v: View) => v === "case" || v === "documents" || v === "history";
const label = (name: string, n: number) => (n > 0 ? `${name}, ${n} waiting` : name);
const caseLabel = (c: SidebarCase, plain = false) => (plain ? c.title : `${c.title}, ${money(c.atStakeCents)} at stake, ${c.status.label}`);

/** A 2px bar at the left edge marks where you are (docs/design.md §3.1, --primary). */
const CURRENT = "bg-sunken text-ink before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:rounded-full before:bg-primary";
/** Hover is a lighter tint than CURRENT, so the item under the pointer never reads as where you are. */
const HOVER = "hover:bg-sunken/50";

const IconButton = ({ name, onClick, children }: { name: string; onClick: () => void; children: ReactNode }) => (
  <button type="button" onClick={onClick} aria-label={name} title={name}
    className="grid size-8 flex-none place-items-center rounded-lg text-ink-3 hover:bg-sunken hover:text-ink">{children}</button>
);

const Count = ({ n }: { n: number }) => (
  n > 0 ? (
    <span aria-hidden="true" className="ml-auto min-w-[20px] rounded-[6px] bg-waiting-tint px-1.5 text-center text-[11.5px] font-semibold leading-[18px] text-waiting">{n}</span>
  ) : null
);

function Full({ person, view, onView, cases, activeId, onOpenCase, inbox, onClose, className }: SidebarProps & { className?: string }) {
  const plain = isUploaderOnly(person);
  const place = (name: string, icon: ReactNode, on: boolean, onClick: () => void, n = 0) => (
    <button type="button" onClick={onClick} aria-current={on ? "page" : undefined} aria-label={label(name, n)}
      className={cx("group relative flex h-8 w-full items-center gap-2.5 rounded-lg px-2.5 text-[13.5px] font-medium",
        on ? CURRENT : cx("text-ink-2 hover:text-ink", HOVER))}>
      <span className={on ? "text-ink" : "text-ink-3 group-hover:text-ink-2"}>{icon}</span>{name}<Count n={n} />
    </button>
  );
  return (
    <div className={cx("flex min-h-0 w-full flex-col", className)}>
      <div className="flex h-14 flex-none items-center gap-2 pl-4 pr-3">
        <span className="text-ink"><Logo /></span>
        <span className="text-[15px] font-[650] tracking-[-0.01em]">CargoOS</span>
        <span className="ml-auto" />
        {onClose
          ? <IconButton name="Close menu" onClick={onClose}><CloseIcon /></IconButton>
          : <IconButton name="Collapse sidebar" onClick={() => setSidebarPref("collapsed")}><CollapseIcon /></IconButton>}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        {!plain && (
          <section aria-labelledby="sb-waiting" className="mb-5">
            <h2 id="sb-waiting" className="px-2.5 pb-1 pt-2 text-[11.5px] font-medium text-ink-3">Waiting on you</h2>
            {place("Questions", <QuestionsIcon />, view === "questions", () => onView("questions"), inbox.questions)}
            {place("Approvals", <ApproveIcon />, view === "approvals", () => onView("approvals"), inbox.approvals)}
          </section>
        )}

        <section aria-labelledby="sb-cases" className={plain ? "pt-1" : undefined}>
          <h2 id="sb-cases" className="pb-1">
            <button type="button" onClick={() => onView("cases")} aria-current={view === "cases" ? "page" : undefined} aria-label="All cases"
              className={cx("flex w-full items-center gap-1.5 rounded-md px-2.5 py-0.5 text-left text-[11.5px] font-medium",
                view === "cases" ? "text-ink" : "text-ink-3 hover:text-ink")}>
              Cases<span className="font-normal text-ink-3">{cases.length}</span>
            </button>
          </h2>
          <ul>
            {cases.map((c) => {
              const on = c.id === activeId && inCase(view);
              return (
                <li key={c.id}>
                  <button type="button" onClick={() => onOpenCase(c.id)} aria-current={on ? "page" : undefined}
                    aria-label={caseLabel(c, plain)} title={plain ? c.title : `${c.title} · ${c.status.label}`}
                    className={cx("group relative grid h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-left",
                      plain ? "grid-cols-[minmax(0,1fr)]" : "grid-cols-[8px_minmax(0,1fr)_auto]", on ? CURRENT : HOVER)}>
                    {!plain && <StatusDot tone={c.status.tone} />}
                    <span className={cx("truncate text-[13.5px]", on ? "font-semibold text-ink" : "font-medium text-ink-2 group-hover:text-ink")}>{c.title}</span>
                    {!plain && <span className={cx("text-[12.5px] font-semibold", c.atStakeCents ? "text-dispute" : "text-ink-3")}>{money(c.atStakeCents)}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
          {place("New case", <PlusIcon />, view === "new", () => onView("new"))}
        </section>
      </div>

      <div className="flex-none border-t border-line p-2">
        <p title={REPLAY} className="px-2.5 pb-1.5 pt-0.5 text-[11.5px] font-medium leading-4 text-ink-3">Replay</p>
        <button type="button" onClick={() => onView("settings")} aria-label={settingsLabel(person)} aria-current={view === "settings" ? "page" : undefined}
          className={cx("group relative flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left", view === "settings" ? CURRENT : HOVER)}>
          <Avatar person={person} size={32} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13.5px] font-semibold text-ink">
              {firstName(person)}<span className="ml-1.5 font-medium text-ink-2">{titleOf(person)}</span>
            </span>
            <span className="block truncate text-[12px] text-ink-3">{WORKSPACE.name}</span>
          </span>
          <span className="text-ink-3 group-hover:text-ink"><SettingsIcon /></span>
        </button>
      </div>
    </div>
  );
}

/** One rail button with its name in a tooltip to the right. */
function RailItem({ name, tip, on, onClick, children }: { name: string; tip?: ReactNode; on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger onClick={onClick} aria-label={name} aria-current={on ? "page" : undefined}
        className={cx("relative grid size-10 flex-none place-items-center rounded-[10px]",
          on ? "bg-sunken text-ink ring-1 ring-inset ring-line-strong" : cx("text-ink-3 hover:text-ink", HOVER))}>
        {children}
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Positioner side="right" sideOffset={8} className="z-50">
          <Tooltip.Popup className="max-w-[260px] rounded-[8px] bg-tip-bg px-2.5 py-1.5 text-meta text-tip-ink shadow-[0_8px_24px_rgba(0,0,0,.25)]">{tip ?? name}</Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

const Dot = () => <b aria-hidden="true" className="absolute right-[7px] top-[7px] size-2 rounded-full bg-waiting-fill ring-2 ring-surface" />;
const Rule = () => <span aria-hidden="true" className="my-2 h-px w-7 flex-none bg-line" />;

function Rail({ person, view, onView, cases, activeId, onOpenCase, inbox, className }: SidebarProps & { className?: string }) {
  const plain = isUploaderOnly(person);
  return (
    <div className={cx("flex min-h-0 w-full flex-col items-center", className)}>
      <div className="flex h-14 flex-none items-center text-ink"><Logo /></div>
      <IconButton name="Expand sidebar" onClick={() => setSidebarPref("expanded")}><ExpandIcon /></IconButton>
      <div className="flex min-h-0 w-full flex-1 flex-col items-center gap-1 overflow-y-auto pb-3 pt-1">
        <Rule />
        {!plain && (
          <>
            <RailItem name={label("Questions", inbox.questions)} on={view === "questions"} onClick={() => onView("questions")}>
              <QuestionsIcon />{inbox.questions > 0 && <Dot />}
            </RailItem>
            <RailItem name={label("Approvals", inbox.approvals)} on={view === "approvals"} onClick={() => onView("approvals")}>
              <ApproveIcon />{inbox.approvals > 0 && <Dot />}
            </RailItem>
            <Rule />
          </>
        )}
        <RailItem name="All cases" on={view === "cases"} onClick={() => onView("cases")}><CasesIcon /></RailItem>
        {cases.map((c) => {
          const on = c.id === activeId && inCase(view);
          return (
            <RailItem key={c.id} name={caseLabel(c, plain)} on={on} onClick={() => onOpenCase(c.id)}
              tip={plain ? c.title : <><b className="block font-semibold">{c.title}</b>{money(c.atStakeCents)} at stake · {c.status.label}</>}>
              <span className={cx("relative grid size-7 place-items-center rounded-[8px] border text-[11px] font-[650] tracking-[0.02em]",
                on ? "border-primary-ring text-ink" : "border-line-strong text-ink-2")}>
                {caseInitials(c.title)}
                {!plain && <StatusDot tone={c.status.tone} className="absolute -right-1 -top-1 ring-2 ring-surface" />}
              </span>
            </RailItem>
          );
        })}
        <RailItem name="New case" on={view === "new"} onClick={() => onView("new")}><PlusIcon /></RailItem>
      </div>
      <span title={REPLAY} className="flex-none pb-2 text-[10.5px] font-medium text-ink-3">Replay</span>
      <div className="flex-none border-t border-line py-2">
        <RailItem name={settingsLabel(person)} on={view === "settings"} onClick={() => onView("settings")}
          tip={<><b className="block font-semibold">{displayName(person)}</b>{WORKSPACE.name} · Settings</>}>
          <Avatar person={person} size={28} />
        </RailItem>
      </div>
    </div>
  );
}
