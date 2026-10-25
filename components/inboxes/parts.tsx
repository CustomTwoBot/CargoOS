// Shared frame of both inboxes (docs/design.md §0.2 decisions 5 and 6): a light list on the left,
// the selected item with the room on the right. Below 1024px the screen shows one of the two: the
// list, or the item full width with a link back to the list.
import { useSyncExternalStore, type ReactNode } from "react";
import { cx } from "@/components/case/cx";

export const CARD = "rounded-xl border border-line bg-surface shadow-card";
export const PRIMARY = "rounded-md bg-primary px-3.5 py-[7px] text-[13.5px] font-semibold text-primary-ink";
export const SECONDARY = "rounded-md border border-line-strong bg-surface px-3.5 py-[7px] text-[13.5px] font-semibold text-ink hover:bg-sunken";

// The clock is read on the client only, so prerendering never bakes in "2 hours ago".
let clientNow: Date | undefined;
export const useNow = () => useSyncExternalStore(() => () => {}, () => (clientNow ??= new Date()), () => null);

/** Wide enough for list and detail side by side. Prerendering and browsers without matchMedia count as wide. */
export const WIDE = "(min-width: 1024px)";
const subscribeWide = (onChange: () => void) => {
  const m = typeof window.matchMedia === "function" ? window.matchMedia(WIDE) : undefined;
  m?.addEventListener("change", onChange);
  return () => m?.removeEventListener("change", onChange);
};
export const useWide = () => useSyncExternalStore(subscribeWide,
  () => (typeof window.matchMedia === "function" ? window.matchMedia(WIDE).matches : true), () => true);

type FrameProps = {
  title: string; count: string; sub: string; list: ReactNode; detail: ReactNode;
  /** Narrow screens only: the detail replaces the list, with this link back ("Back to questions"). */
  reading: boolean; backLabel: string; onBack: () => void;
};

export function InboxFrame({ title, count, sub, list, detail, reading, backLabel, onBack }: FrameProps) {
  const wide = useWide();
  const showDetail = wide || (reading && !!detail);
  const showList = wide || !showDetail;
  return (
    <div className={cx("flex min-h-0 flex-1 flex-col", !wide && "overflow-auto")}>
      {showList && (
        <header className="px-4 pb-3 pt-3.5 md:px-6">
          <h1 className="flex items-baseline gap-2.5 text-title font-[650] tracking-[-0.012em]">
            {title}<span className="text-[13px] font-medium tracking-normal text-ink-2">{count}</span>
          </h1>
          <p className="mt-0.5 text-[13px] text-ink-2">{sub}</p>
        </header>
      )}
      <div className={cx("px-4 pb-4 md:px-6", wide ? "grid min-h-0 flex-1 grid-cols-[320px_minmax(0,1fr)] gap-6" : "flex flex-col")}>
        {showList && <div className={cx(wide && "min-h-0 overflow-auto")}>{list}</div>}
        {showDetail && (
          <div className={cx("flex min-w-0 flex-col", wide ? "min-h-0 overflow-auto" : "pt-3.5")}>
            {!wide && (
              <button type="button" onClick={onBack}
                className="mb-3 flex items-center gap-1 self-start text-[13.5px] font-semibold text-link hover:underline">
                <Chevron dir="left" />{backLabel}
              </button>
            )}
            {detail}
          </div>
        )}
      </div>
    </div>
  );
}

export const Chevron = ({ dir }: { dir: "left" | "right" | "down" }) => (
  <svg viewBox="0 0 16 16" width={14} height={14} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"
    strokeLinejoin="round" aria-hidden="true" className="block flex-none">
    <path d={dir === "left" ? "M10 3.5L5.5 8l4.5 4.5" : dir === "right" ? "M6 3.5L10.5 8 6 12.5" : "M3.5 6l4.5 4.5L12.5 6"} />
  </svg>
);

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

type ItemProps = {
  selected: boolean; onSelect: () => void; title: string; meta: string;
  /** A dot before the title for what still waits on you, with this text for screen readers ("Unanswered"). */
  dot?: string;
};

/** A selectable row: title and one line of meta. The row only selects; actions live in the detail. */
export function Item({ selected, onSelect, title, meta, dot }: ItemProps) {
  return (
    <li className="border-b border-line last:border-0">
      <button type="button" aria-current={selected || undefined} onClick={onSelect}
        className={cx("block w-full px-4 py-3 text-left outline-offset-[-2px]", selected ? "bg-sunken shadow-[inset_0_0_0_1px_var(--primary-ring)]" : "hover:bg-sunken")}>
        <span className="flex items-center gap-2">
          <span aria-hidden="true" className={cx("size-2 flex-none rounded-full", dot && "bg-waiting-fill")} />
          {dot && <span className="sr-only">{dot}: </span>}
          <span className={cx("truncate text-row font-semibold", !dot && "text-ink-2")}>{title}</span>
        </span>
        <span className="mt-0.5 block truncate pl-4 text-meta text-ink-2">{meta}</span>
      </button>
    </li>
  );
}

type FoldProps = { label: string; count: number; open: boolean; onToggle: () => void; children: ReactNode };

/** A done section folded to one line ("Answered (3)") at the bottom of the list. */
export function Fold({ label, count, open, onToggle, children }: FoldProps) {
  return (
    <div className="mt-4">
      <button type="button" aria-expanded={open} onClick={onToggle}
        className="flex items-center gap-1.5 rounded-md px-1 py-1 text-meta font-medium text-ink-2 hover:text-ink">
        <Chevron dir={open ? "down" : "right"} />{label} ({count})
      </button>
      {open && <div className="mt-2">{children}</div>}
    </div>
  );
}

type HeadProps = { title: string; meta?: string; onOpen?: () => void };

/** Top of a detail: the case, one muted line, and the way into the case. */
export function DetailHead({ title, meta, onOpen }: HeadProps) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <h2 className="truncate text-panel font-[650]">{title}</h2>
        {meta && <p className="mt-0.5 text-meta text-ink-3">{meta}</p>}
      </div>
      {onOpen && <button type="button" className={cx(SECONDARY, "flex-none")} onClick={onOpen}>Open case</button>}
    </div>
  );
}

export type LineRow = { key: string; lineNo: number; description: string; chip: ReactNode; amount?: string };

/** Invoice lines as compact rows: line number, name, one chip, amount. The chip wraps under the name when narrow. */
export function LineRows({ label, rows }: { label: string; rows: LineRow[] }) {
  return (
    <ul aria-label={label}>
      {rows.map((r) => (
        <li key={r.key} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-line py-2 last:border-0">
          <span className="w-5 flex-none text-xs text-ink-3">{r.lineNo}</span>
          <span className="min-w-[9rem] flex-1 text-[14px] font-semibold">{r.description}</span>
          <span className="inline-flex items-center gap-1 rounded-sm border border-line px-2 text-meta font-semibold leading-[22px] text-ink-2">{r.chip}</span>
          {r.amount && <b className="min-w-[4.5rem] flex-none text-right text-[14px] font-semibold">{r.amount}</b>}
        </li>
      ))}
    </ul>
  );
}
