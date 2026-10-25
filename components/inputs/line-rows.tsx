// A plain invoice-line row in the case list's grid (docs/design.md §7.5), with slots so each
// line-editor variation can put its control where its idea says. Read-only use of case/*.
import type { ReactNode } from "react";
import { RowTagChip, StatusTag } from "@/components/case/bits";
import { cx } from "@/components/case/cx";
import { delta, money } from "@/components/case/format";
import type { Row } from "@/components/case/view-model";
import type { EditableLine } from "./line-edit";

export const GRID = "grid grid-cols-[22px_minmax(0,1fr)_168px_90px_84px] gap-x-3";

type Props = {
  r: Row; line: EditableLine; edited?: boolean; selected?: boolean; onSelect?: () => void;
  /** Replaces the description, status, billed and over-by cells (an editor across the row). */
  replace?: ReactNode;
  /** Under the why-line: an Edit link, a saved note. */
  below?: ReactNode;
  /** Replaces the billed amount (a clickable amount). */
  billed?: ReactNode;
};

export function LineRow({ r, line, edited, selected, onSelect, replace, below, billed }: Props) {
  return (
    <li data-testid={`row-${r.lineNo}`} aria-current={selected || undefined}
      onClick={onSelect} onKeyDown={onSelect && ((e) => { if (e.key === "Enter" && e.target === e.currentTarget) onSelect(); })}
      tabIndex={onSelect ? 0 : undefined}
      className={cx(GRID, "relative items-start border-t border-line bg-surface px-4 py-2.5", onSelect && "cursor-pointer",
        selected && "bg-sunken after:absolute after:inset-y-0 after:left-0 after:w-0.5 after:bg-primary")}>
      <span className="pt-0.5 text-right text-xs text-ink-3">{r.lineNo}</span>
      {replace ? <div className="col-span-4 min-w-0">{replace}</div> : (
        <>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-row font-semibold">
              {line.description}{edited && <RowTagChip>Edited by you</RowTagChip>}
            </div>
            <p className="mt-0.5 text-why text-ink-2">{r.why}</p>
            {below}
          </div>
          <div>
            <StatusTag group={r.group} />
            <div className="mt-[5px] text-xs leading-[17px] text-ink-2">{r.reason.plain}</div>
          </div>
          <span className="text-right text-body font-semibold leading-[21px]">{billed ?? money(line.amountCents)}</span>
          <span className="text-right text-[13px] leading-[21px]">
            {r.group === "dispute" ? <span className="font-semibold text-dispute">{delta(r.deltaCents)}</span>
              : r.group === "waiting" ? <span className="text-meta font-medium text-waiting">unconfirmed</span>
              : <span className="text-ink-3">—</span>}
          </span>
        </>
      )}
    </li>
  );
}

export function LinesCard({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-card">
      <ul aria-label="Invoice lines">
        <li aria-hidden="true" className={cx(GRID, "px-4 pb-[7px] pt-[9px] text-[11.5px] font-medium text-ink-3")}>
          <span /><span>Line</span><span>Status and reason</span><span className="text-right">Billed</span><span className="text-right">Over by</span>
        </li>
        {children}
      </ul>
    </div>
  );
}

export const EditLink = ({ onClick }: { onClick: () => void }) => (
  <button type="button" onClick={(e) => { e.stopPropagation(); onClick(); }}
    className="mt-1.5 text-meta font-medium text-link underline underline-offset-[3px]">Edit</button>
);
