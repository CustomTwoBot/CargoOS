"use client";
// The case History: a dense table for accountants, newest first (docs/design.md §7.10), filtered by who.
// With rounds, each check gets a thin divider so "what changed when" reads at a glance; a long
// history also gets a search box.
import { useState } from "react";
import { cx } from "@/components/case/cx";
import { dayPT, matches, secondsPT, WHO_NAME, type Entry, type Round, type Who as WhoKind } from "./history";
import { AppendOnly, Who } from "./bits";

type Filter = "all" | WhoKind;
const FILTERS: Filter[] = ["all", "you", "rules", "agent"];
// The event code is for whoever checks the log against the database: a quiet fourth column from 1280px only.
const COLS = "grid grid-cols-[120px_150px_minmax(0,1fr)] gap-x-4 xl:grid-cols-[132px_172px_minmax(0,1fr)_150px]";
const EVENT_COL = "hidden xl:block";
/** Below this many entries the table fits a screen or two and a search box would only add noise. */
export const SEARCH_FROM = 25;

export function HistoryLedger({ entries, rounds }: { entries: Entry[]; rounds?: Round[] }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const searchable = entries.length >= SEARCH_FROM;
  const q = searchable ? query.trim() : "";
  const fits = (e: Entry) => matches(e, q);
  const shows = (e: Entry) => (filter === "all" || e.who === filter) && fits(e);
  const count = (f: Filter) => entries.filter((e) => (f === "all" || e.who === f) && fits(e)).length;
  // Newest first: the latest round on top, and inside each round the latest entry on top.
  const groups = (rounds ?? [{ key: "all", label: "", entries }])
    .map((r) => ({ ...r, shown: r.entries.filter(shows).reverse() }))
    .filter((r) => r.shown.length)
    .reverse();

  return (
    <section aria-label="History" className="w-full rounded-xl border border-line bg-surface shadow-card">
      <div className="flex items-center gap-4 border-b border-line px-4 py-2.5">
        <div className="inline-flex shrink-0 rounded-[9px] border border-line p-[3px] text-meta font-medium" role="group" aria-label="Who">
          {FILTERS.map((f) => (
            <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)}
              className={cx("rounded-[6px] px-2.5 py-0.5", filter === f ? "bg-line-strong text-ink" : "text-ink-3 hover:text-ink")}>
              {f === "all" ? "All" : WHO_NAME[f]} <span className="text-ink-3">{count(f)}</span>
            </button>
          ))}
        </div>
        {searchable && (
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search history"
            placeholder="Search, for example line 9"
            className="h-[30px] w-[240px] min-w-0 rounded-md border border-line-strong bg-surface px-2.5 text-meta text-ink placeholder:text-ink-3" />
        )}
        <span className="ml-auto shrink-0 text-meta text-ink-3">Newest first · Pacific time</span>
      </div>
      <div role="table" aria-label="Events" className="text-[13px] leading-5">
        <div role="row" className={cx(COLS, "border-b border-line px-4 py-1.5 text-[11.5px] font-medium text-ink-3")}>
          <span role="columnheader">When</span><span role="columnheader">Who</span>
          <span role="columnheader">What happened</span><span role="columnheader" className={EVENT_COL}>Event</span>
        </div>
        {groups.map((g) => (
          <div role="rowgroup" key={g.key} aria-label={g.label || undefined}>
            {g.label && (
              <div role="row" data-testid="history-round"
                className={cx(COLS, "sticky top-0 z-[1] items-baseline border-b border-line bg-sunken px-4 py-1 text-meta")}>
                <span role="cell" className="col-span-3 min-w-0 truncate font-semibold text-ink-2 xl:col-span-4">{g.label}</span>
              </div>
            )}
            {g.shown.map((e) => <EntryRow key={e.id} e={e} />)}
          </div>
        ))}
      </div>
      {!groups.length && (
        <div className="flex items-baseline gap-3 px-4 py-6 text-why text-ink-2">
          <p>{emptyText(entries.length, filter, q)}</p>
          {(filter !== "all" || q) && (
            <button type="button" onClick={() => { setFilter("all"); setQuery(""); }} className="text-meta font-medium text-ink underline underline-offset-2">
              Show everything
            </button>
          )}
        </div>
      )}
      <AppendOnly className="border-t border-line px-4 py-2.5" />
    </section>
  );
}

function emptyText(total: number, filter: Filter, q: string): string {
  if (!total) return "Nothing has happened in this case yet.";
  const from = filter === "all" ? "" : ` from ${WHO_NAME[filter]}`;
  return q ? `Nothing${from} matches “${q}”.` : `Nothing${from} in this case yet.`;
}

/** One event. A step caused by quoted words opens to show them, verbatim. */
function EntryRow({ e }: { e: Entry }) {
  const [open, setOpen] = useState(false);
  const tone = e.blocked ? "text-dispute" : "text-ink-2";
  return (
    <div role="row" data-testid="history-entry"
      className={cx(COLS, "items-baseline border-b border-line px-4 py-[7px] last:border-0 hover:bg-sunken")}>
      <time role="cell" dateTime={e.at} className="text-ink-3">{dayPT(e.at)}, {secondsPT(e.at)}</time>
      <span role="cell" className="min-w-0"><Who entry={e} /></span>
      <span role="cell" className="min-w-0 break-words">
        {e.quotes.length ? (
          <button type="button" aria-expanded={open} onClick={() => setOpen(!open)}
            className={cx("inline text-left hover:text-ink", tone)}>
            {e.what}
            <svg aria-hidden viewBox="0 0 10 10" className={cx("ml-1.5 inline size-2.5 align-[0px] text-ink-3", open && "rotate-90")}>
              <path d="M3.5 2 7 5 3.5 8" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        ) : <span className={tone}>{e.what}</span>}
        {open && (
          <ul aria-label="Quoted words" className="mb-0.5 mt-1 space-y-1 text-why text-ink-2">
            {e.quotes.map((quote, i) => <li key={i} className="break-words">“{quote}”</li>)}
          </ul>
        )}
      </span>
      <code role="cell" className={cx("truncate font-sans text-xs text-ink-3", EVENT_COL, e.blocked && "text-dispute")}>{e.code}</code>
    </div>
  );
}
