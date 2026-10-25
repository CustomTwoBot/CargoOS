// Shared frame of both inboxes: header with the count, a list on the left, the selected item on
// the right (docs/design.md §0.1 "evidence left, decision right", §7.11 inbox).
import { useSyncExternalStore, type ReactNode } from "react";
import { cx } from "@/components/case/cx";

export const CARD = "rounded-xl border border-line bg-surface shadow-card";
export const PRIMARY = "rounded-md bg-primary px-3.5 py-[7px] text-[13.5px] font-semibold text-primary-ink";
export const SECONDARY = "rounded-md border border-line-strong bg-surface px-3.5 py-[7px] text-[13.5px] font-semibold text-ink hover:bg-sunken";

// The clock is read on the client only, so prerendering never bakes in "2 hours ago".
let clientNow: Date | undefined;
export const useNow = () => useSyncExternalStore(() => () => {}, () => (clientNow ??= new Date()), () => null);

type FrameProps = { title: string; count: string; sub: string; list: ReactNode; detail: ReactNode };

export function InboxFrame({ title, count, sub, list, detail }: FrameProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="px-6 pb-3 pt-3.5">
        <h1 className="flex items-baseline gap-2.5 text-title font-[650] tracking-[-0.012em]">
          {title}<span className="text-[13px] font-medium tracking-normal text-ink-2">{count}</span>
        </h1>
        <p className="mt-0.5 text-[13px] text-ink-2">{sub}</p>
      </header>
      <div className="grid min-h-0 flex-1 grid-cols-[340px_minmax(0,1fr)] gap-4 px-6 pb-4">
        <div className="min-h-0 overflow-auto">{list}</div>
        <div className="flex min-h-0 min-w-0 flex-col">{detail}</div>
      </div>
    </div>
  );
}

/** One quiet card saying why the list is empty and what would fill it. */
export function InboxEmpty({ title, text }: { title: string; text: string }) {
  return (
    <div className={cx(CARD, "px-5 py-5")}>
      <p className="text-row font-semibold">{title}</p>
      <p className="mt-1 text-why text-ink-2">{text}</p>
    </div>
  );
}

type ListProps = { label: string; quiet?: boolean; children: ReactNode };

/** The items of one section, in one card. `quiet` for the done section: no shadow, no fill. */
export function ItemList({ label, quiet, children }: ListProps) {
  return (
    <ul aria-label={label} className={cx("overflow-hidden rounded-xl border border-line", quiet ? "bg-transparent" : "bg-surface shadow-card")}>
      {children}
    </ul>
  );
}

type ItemProps = { selected: boolean; onSelect: () => void; children: ReactNode };

/** A selectable row. The row only selects; actions live in the detail next to the list. */
export function Item({ selected, onSelect, children }: ItemProps) {
  return (
    <li className="border-b border-line last:border-0">
      <button type="button" aria-current={selected || undefined} onClick={onSelect}
        className={cx("block w-full px-4 py-3 text-left outline-offset-[-2px]", selected ? "bg-sunken shadow-[inset_0_0_0_1px_var(--primary-ring)]" : "hover:bg-sunken")}>
        {children}
      </button>
    </li>
  );
}

export const SectionLabel = ({ children }: { children: string }) => (
  <h2 className="mb-2 mt-5 text-meta font-medium text-ink-3">{children}</h2>
);
