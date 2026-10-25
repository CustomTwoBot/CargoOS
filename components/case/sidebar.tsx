// The sidebar (docs/design.md §0.4 п.1), like ChatGPT's: the logo, a full-width "＋ New case", the
// cases as chats in two groups, "Needs you" (this person must act) and "Earlier" (everything else),
// and the account at the bottom, which opens Settings. Each case is "Forwarder · invoice number"
// with its status as a coloured word under it. An uploader sees one "Cases" group with no amounts.
// Collapsed (1024–1279 by default) it is a 60px rail; below 1024 it is a drawer (AppShell).
import { Tooltip } from "@base-ui/react/tooltip";
import type { ReactNode } from "react";
import type { Person } from "@/lib/types";
import { Avatar } from "@/components/shell/avatar";
import { caseInitials, type CaseLine } from "@/components/shell/case-status";
import { CloseIcon, CollapseIcon, ExpandIcon, Logo, PlusIcon, SettingsIcon } from "@/components/shell/icons";
import { setSidebarPref, type SidebarMode } from "@/components/shell/layout";
import { WORKSPACE, displayName, firstName, isUploaderOnly, titleOf } from "@/components/shell/person";
import { StatusDot } from "@/components/shell/status-dot";
import { cx } from "./cx";
import { TONE_TEXT } from "./words";

export type View = "case" | "new" | "settings";

export type SidebarCase = { id: string; name: string; line: CaseLine };

export type SidebarProps = {
  mode: SidebarMode;
  /** The person this device is set to: shown at the bottom, and decides the groups. */
  person: Person;
  view: View;
  cases: SidebarCase[]; activeId: string; onOpenCase: (id: string) => void;
  onNewCase: () => void;
  onSettings: () => void;
  /** Set in the drawer: shows a close button instead of collapse. */
  onClose?: () => void;
};

export function Sidebar(p: SidebarProps) {
  const { mode, onClose } = p;
  return (
    <nav aria-label="Sections"
      className={cx("flex h-full flex-none bg-sunken",
        onClose ? "w-full" : "border-r border-line",
        !onClose && (mode === "expanded" ? "w-[248px]" : mode === "collapsed" ? "w-[60px]" : "w-[60px] xl:w-[248px]"))}>
      {mode !== "collapsed" && <Full {...p} className={mode === "auto" ? "max-xl:hidden" : undefined} />}
      {mode !== "expanded" && <Rail {...p} className={mode === "auto" ? "xl:hidden" : undefined} />}
    </nav>
  );
}

const settingsLabel = (p: Person) => `Settings. This device: ${displayName(p)}`;
const caseLabel = (c: SidebarCase) => `${c.name}. ${c.line.text}`;

/** The groups to show, in order. An uploader has one plain list. */
function groups(person: Person, cases: SidebarCase[]): { label: string; cases: SidebarCase[]; empty?: string }[] {
  if (isUploaderOnly(person)) return [{ label: "Cases", cases }];
  return [
    { label: "Needs you", cases: cases.filter((c) => c.line.needs), empty: "Nothing waits on you." },
    { label: "Earlier", cases: cases.filter((c) => !c.line.needs) },
  ];
}

/** Where you are: a raised white row, as in ChatGPT. Hover is lighter, so it never reads as current. */
const CURRENT = "bg-surface shadow-[0_0_0_1px_var(--line)]";
const HOVER = "hover:bg-surface/60";

const IconButton = ({ name, onClick, children }: { name: string; onClick: () => void; children: ReactNode }) => (
  <button type="button" onClick={onClick} aria-label={name} title={name}
    className="grid size-8 flex-none place-items-center rounded-lg text-ink-3 hover:bg-surface hover:text-ink">{children}</button>
);

function Full({ person, view, cases, activeId, onOpenCase, onNewCase, onSettings, onClose, className }: SidebarProps & { className?: string }) {
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

      <div className="flex-none px-2.5">
        <button type="button" onClick={onNewCase} aria-current={view === "new" ? "page" : undefined}
          className={cx("flex w-full items-center gap-2 rounded-[9px] border border-line-strong bg-surface px-2.5 py-2 text-left text-[13.5px] font-semibold text-ink",
            view === "new" ? "shadow-card ring-1 ring-line-strong" : "hover:shadow-card")}>
          <PlusIcon />New case
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2.5 pb-4">
        {groups(person, cases).filter((g) => g.cases.length || g.empty).map((g) => (
          <section key={g.label} aria-label={g.label}>
            <h2 className="px-2 pb-1.5 pt-[18px] text-[12px] font-semibold text-ink-3">{g.label}</h2>
            {g.cases.length === 0 && g.empty && <p className="px-2 pb-1 text-[12.5px] text-ink-3">{g.empty}</p>}
            <ul className="grid gap-0.5">
              {g.cases.map((c) => {
                const on = c.id === activeId && view === "case";
                return (
                  <li key={c.id}>
                    <button type="button" onClick={() => onOpenCase(c.id)} aria-current={on ? "page" : undefined} aria-label={caseLabel(c)}
                      className={cx("block w-full rounded-lg px-2 py-[7px] text-left", on ? CURRENT : HOVER)}>
                      <span className="block truncate text-[13.5px] font-medium text-ink">{c.name}</span>
                      <span className={cx("mt-px block truncate text-[12.5px]", c.line.tone === "muted" ? "text-ink-3" : cx("font-medium", TONE_TEXT[c.line.tone]))}>
                        {c.line.text}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>

      <div className="flex-none p-2.5 pt-1">
        <button type="button" onClick={onSettings} aria-label={settingsLabel(person)} aria-current={view === "settings" ? "page" : undefined}
          className={cx("group flex w-full items-center gap-2.5 rounded-[9px] px-2 py-2 text-left", view === "settings" ? CURRENT : HOVER)}>
          <Avatar person={person} size={32} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13.5px] font-semibold text-ink">
              {firstName(person)}<span className="font-medium text-ink-2"> · {titleOf(person)}</span>
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
        className={cx("relative grid size-10 flex-none place-items-center rounded-[10px] text-ink-2",
          on ? CURRENT : cx("hover:text-ink", HOVER))}>
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

const Rule = () => <span aria-hidden="true" className="my-1.5 h-px w-7 flex-none bg-line" />;

function Rail({ person, view, cases, activeId, onOpenCase, onNewCase, onSettings, className }: SidebarProps & { className?: string }) {
  const ordered = groups(person, cases).flatMap((g) => g.cases);
  return (
    <div className={cx("flex min-h-0 w-full flex-col items-center", className)}>
      <div className="flex h-14 flex-none items-center text-ink"><Logo /></div>
      <IconButton name="Expand sidebar" onClick={() => setSidebarPref("expanded")}><ExpandIcon /></IconButton>
      <div className="flex min-h-0 w-full flex-1 flex-col items-center gap-1 overflow-y-auto pb-3 pt-1">
        <RailItem name="New case" on={view === "new"} onClick={onNewCase}><PlusIcon /></RailItem>
        <Rule />
        {ordered.map((c) => (
          <RailItem key={c.id} name={caseLabel(c)} on={c.id === activeId && view === "case"} onClick={() => onOpenCase(c.id)}
            tip={<><b className="block font-semibold">{c.name}</b>{c.line.text}</>}>
            <span className="relative grid size-7 place-items-center rounded-[8px] border border-line-strong text-[11px] font-[650] tracking-[0.02em]">
              {caseInitials(c.name)}
              {c.line.needs && <StatusDot tone={c.line.tone} className="absolute -right-1 -top-1 ring-2 ring-sunken" />}
            </span>
          </RailItem>
        ))}
      </div>
      <div className="flex-none py-2">
        <RailItem name={settingsLabel(person)} on={view === "settings"} onClick={onSettings}
          tip={<><b className="block font-semibold">{displayName(person)}</b>{WORKSPACE.name} · Settings</>}>
          <Avatar person={person} size={28} />
        </RailItem>
      </div>
    </div>
  );
}
