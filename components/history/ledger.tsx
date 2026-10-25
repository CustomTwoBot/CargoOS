"use client";
// Variation B: a dense table for accountants, newest first (docs/design.md §7.10), filtered by who.
import { useState } from "react";
import { cx } from "@/components/case/cx";
import { dayPT, secondsPT, WHO_NAME, type Entry, type Who as WhoKind } from "./history";
import { AppendOnly, Who } from "./bits";

type Filter = "all" | WhoKind;
const FILTERS: Filter[] = ["all", "you", "rules", "agent"];
const COLS = "grid grid-cols-[132px_172px_minmax(0,1fr)_150px] gap-x-4";

export function HistoryLedger({ entries }: { entries: Entry[] }) {
  const [filter, setFilter] = useState<Filter>("all");
  const shown = entries.filter((e) => filter === "all" || e.who === filter).reverse();
  const count = (f: Filter) => (f === "all" ? entries.length : entries.filter((e) => e.who === f).length);

  return (
    <section aria-label="History" className="w-full rounded-xl border border-line bg-surface shadow-card">
      <div className="flex items-center justify-between gap-4 border-b border-line px-4 py-2.5">
        <div className="inline-flex rounded-[9px] border border-line p-[3px] text-meta font-medium" role="group" aria-label="Who">
          {FILTERS.map((f) => (
            <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)}
              className={cx("rounded-[6px] px-2.5 py-0.5", filter === f ? "bg-line-strong text-ink" : "text-ink-3 hover:text-ink")}>
              {f === "all" ? "All" : WHO_NAME[f]} <span className="text-ink-3">{count(f)}</span>
            </button>
          ))}
        </div>
        <span className="text-meta text-ink-3">Newest first · Pacific time</span>
      </div>
      <div role="table" aria-label="Events" className="text-[13px] leading-5">
        <div role="row" className={cx(COLS, "border-b border-line px-4 py-1.5 text-[11.5px] font-medium text-ink-3")}>
          <span role="columnheader">When</span><span role="columnheader">Who</span>
          <span role="columnheader">What happened</span><span role="columnheader">Event</span>
        </div>
        {shown.map((e) => (
          <div role="row" key={e.id} data-testid="history-entry"
            className={cx(COLS, "items-baseline border-b border-line px-4 py-[7px] last:border-0 hover:bg-sunken")}>
            <time role="cell" dateTime={e.at} className="text-ink-3">{dayPT(e.at)}, {secondsPT(e.at)}</time>
            <span role="cell" className="min-w-0"><Who entry={e} /></span>
            <span role="cell" className={cx("min-w-0 text-ink-2", e.blocked && "text-dispute")}>{e.what}</span>
            <code role="cell" className={cx("truncate font-sans text-xs text-ink-3", e.blocked && "text-dispute")}>{e.code}</code>
          </div>
        ))}
      </div>
      <AppendOnly className="border-t border-line px-4 py-2.5" />
    </section>
  );
}
