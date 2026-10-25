// Invoice lines (docs/design.md §0.4 п.3): the invoice as a table in its own order, # · Charge · Billed ·
// Agreed · Result. The status is a coloured word; disputed and waiting rows are lightly tinted.
// A click opens the proof under the row. After a recheck, changed rows say "New" and flash once.
// In a narrow pane (under 512px) the Agreed column folds under the charge name.
import { Fragment, useEffect, useRef, useState } from "react";
import type { Charge } from "@/lib/types";
import { cx } from "@/components/case/cx";
import { inCurrency } from "@/components/case/format";
import type { Focus } from "@/components/case/panes";
import type { Row } from "@/components/case/view-model";
import { resultWord, TONE_TEXT } from "@/components/case/words";
import { agreedText, chargeName, countsOf, FILTER_LABEL, type Filter } from "./model";

const TINT: Record<Row["group"], string> = { dispute: "bg-dispute-tint", waiting: "bg-waiting-row", cleared: "" };
const FILTERS: Filter[] = ["all", "dispute", "waiting", "cleared"];

type Props = {
  rows: Row[]; charges: Charge[]; asked: string;
  /** The open row, from the shared focus. */
  open?: string; onFocus: (f: Focus) => void;
  /** Lines the latest recheck moved. */
  changed: string[];
  /** The proof under an open row. */
  proofFor: (r: Row) => React.ReactNode;
};

export function InvoiceLines({ rows, charges, asked, open, onFocus, changed, proofFor }: Props) {
  const [chosen, setFilter] = useState<Filter>("all");
  const counts = countsOf(rows);
  // A filter whose lines all moved away falls back to everything.
  const filter: Filter = counts[chosen] ? chosen : "all";
  const shown = rows.filter((r) => filter === "all" || r.group === filter || r.key === open);
  const body = useRef<HTMLTableSectionElement>(null);
  useFlash(body, changed);

  return (
    <section aria-label="Invoice lines" className="@container mt-4 overflow-hidden rounded-[14px] border border-line bg-surface shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-line px-[18px] py-3">
        <h2 className="text-row font-[650]">Invoice lines</h2>
        <div role="group" aria-label="Show lines" className="flex gap-0.5 rounded-lg border border-line bg-sunken p-0.5 text-meta font-semibold">
          {FILTERS.filter((f) => f === "all" || counts[f]).map((f) => (
            <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)}
              className={cx("whitespace-nowrap rounded-md px-2.5 py-[3px]", filter === f ? "bg-surface text-ink shadow-[0_0_0_1px_var(--line)]" : "text-ink-2 hover:text-ink")}>
              {FILTER_LABEL[f]} {counts[f]}
            </button>
          ))}
        </div>
      </div>
      <table className="w-full border-collapse text-[14px]">
        <thead>
          <tr className="text-left text-xs font-semibold text-ink-3">
            <th scope="col" className="w-11 min-w-11 py-2 pl-4 font-semibold @lg:pl-[18px]"><span className="sr-only">Line</span></th>
            <th scope="col" className="py-2 pr-3 font-semibold">Charge</th>
            <th scope="col" className="py-2 pr-3 text-right font-semibold">Billed</th>
            <th scope="col" className="hidden py-2 pr-3 text-right font-semibold @lg:table-cell">Agreed</th>
            <th scope="col" className="py-2 pr-4 text-right font-semibold @lg:pr-[18px]">Result</th>
          </tr>
        </thead>
        <tbody ref={body}>
          {shown.map((r) => {
            const isOpen = r.key === open;
            const word = resultWord(r, asked);
            const agreed = agreedText(r, asked);
            const isNew = changed.includes(r.key);
            const charge = charges.find((c) => c._id === r.finding.chargeId);
            return (
              <Fragment key={r.key}>
                <tr data-key={r.key} onClick={() => onFocus(isOpen ? { kind: "invoice" } : { kind: "line", key: r.key })}
                  className={cx("cursor-pointer border-t border-line align-top hover:brightness-[.985]", TINT[r.group], isOpen && "[&>td]:pb-2")}>
                  <td className="py-[11px] pl-4 pr-2 text-meta text-ink-3 @lg:pl-[18px]">{r.lineNo}</td>
                  <td className="py-[11px] pr-3">
                    <button type="button" aria-expanded={isOpen} onClick={(e) => { e.stopPropagation(); onFocus(isOpen ? { kind: "invoice" } : { kind: "line", key: r.key }); }}
                      className={cx("text-left", (isOpen || r.group === "dispute") && "font-semibold")}>
                      {chargeName(charge?.description ?? r.description)}
                    </button>
                    {isNew && <span className="ml-2 rounded-[5px] border border-line-strong px-1.5 align-[1px] text-[11px] font-semibold leading-[17px] text-ink-2">New</span>}
                    <span data-narrow="" className={cx("block text-meta @lg:hidden", agreed.muted ? "text-ink-3" : "text-ink-2")}>{agreed.muted ? agreed.text : `Agreed ${agreed.text}`}</span>
                  </td>
                  <td className="whitespace-nowrap py-[11px] pr-3 text-right">{inCurrency(charge?.amountCents ?? r.billedCents, charge?.currency ?? r.currency)}</td>
                  <td className={cx("hidden py-[11px] pr-3 text-right @lg:table-cell", agreed.muted && "text-ink-3")}>{agreed.text}</td>
                  <td className={cx("whitespace-nowrap py-[11px] pr-4 text-right font-semibold @lg:pr-[18px]", TONE_TEXT[word.tone])}>{word.text}</td>
                </tr>
                {isOpen && (
                  <tr data-key={`${r.key}-proof`} className={TINT[r.group]}>
                    <td />
                    <td colSpan={4} className="pb-4 pr-4 @lg:pr-[18px]">{proofFor(r)}</td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

/** One short ring on rows that just changed, when the set of changed rows changes. Respects reduced motion. */
function useFlash(body: React.RefObject<HTMLTableSectionElement | null>, keys: string[]) {
  const seen = useRef("");
  const id = keys.join("|");
  useEffect(() => {
    if (id === seen.current) return;
    seen.current = id;
    if (!id || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    for (const k of keys) {
      const row = body.current?.querySelector<HTMLElement>(`[data-key="${k}"]`);
      row?.animate?.([{ boxShadow: "inset 0 0 0 2px var(--primary-ring)" }, { boxShadow: "inset 0 0 0 2px transparent" }],
        { duration: 1400, easing: "cubic-bezier(0.2, 0, 0, 1)" });
    }
  }, [id, keys, body]);
}
