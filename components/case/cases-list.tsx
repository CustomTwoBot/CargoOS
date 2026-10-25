// All cases: one row per invoice being checked, with what is at stake and what waits on you, and a
// filter by that status. Each case reports its live summary, so the list reflects what you did
// inside it. An uploader sees only the cases and their documents: no amounts, statuses or filter
// (docs/design.md §0.3). The invoice total column drops out below 1024px so the list fits from 768px.
import { useState } from "react";
import type { CaseStatus, CaseTone } from "@/components/shell/case-status";
import { StatusDot } from "@/components/shell/status-dot";
import { cx } from "./cx";
import type { DemoCase } from "./demo-case";
import { money } from "./format";

export type CaseSummary = {
  atStakeCents: number; billedCents: number; status: CaseStatus; openQuestions: number; toDecide: number; documents: number;
};

type Filter = "all" | CaseTone;
const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "you", label: "Waiting on you" },
  { id: "dispute", label: "Ready to dispute" },
  { id: "none", label: "Nothing to do" },
];

const COLS = "grid-cols-[minmax(0,1fr)_170px_120px] lg:grid-cols-[minmax(0,1fr)_180px_120px_140px]";
const PLAIN_COLS = "grid-cols-[minmax(0,1fr)_120px]";

type Props = {
  cases: DemoCase[]; summaries: Record<string, CaseSummary>; onOpen: (id: string) => void;
  /** Uploader: names and documents only. */
  plain?: boolean;
};

export function CasesList({ cases, summaries, onOpen, plain = false }: Props) {
  const [filter, setFilter] = useState<Filter>("all");
  const count = (f: Filter) => cases.filter((c) => f === "all" || summaries[c.id]?.status.tone === f).length;
  const shown = plain ? cases : cases.filter((c) => filter === "all" || summaries[c.id]?.status.tone === filter);
  const cols = plain ? PLAIN_COLS : COLS;
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto pb-6">
      <header className="px-4 pb-3 pt-3.5 md:px-6">
        <h1 className="flex items-center gap-2.5 text-title font-[650] tracking-[-0.012em]">
          Cases
          <span title="Replay of a recorded run. Nothing here reaches the backend or Claude."
            className="rounded-full border border-line-strong px-2 text-xs font-semibold leading-5 text-ink-2">Replay</span>
        </h1>
        <p className="mt-0.5 text-[13px] text-ink-2">
          {plain ? `${cases.length} cases. Open one to add its documents.` : `${cases.length} invoices checked before you pay.`}{" "}
          <span className="text-ink-3">Synthetic data. Nothing is sent or paid automatically.</span>
        </p>
      </header>

      {!plain && (
        <div role="group" aria-label="Show cases" className="mx-4 mb-2.5 flex flex-wrap gap-1 md:mx-6">
          {FILTERS.map((f) => {
            const n = count(f.id), on = filter === f.id;
            return (
              <button key={f.id} type="button" aria-pressed={on} onClick={() => setFilter(f.id)}
                className={cx("flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-[13px] font-medium",
                  on ? "border-line-strong bg-surface text-ink shadow-card" : "border-transparent text-ink-2 hover:bg-surface hover:text-ink")}>
                {f.id !== "all" && <StatusDot tone={f.id} />}
                {f.label}<span className={cx("font-normal", n ? "text-ink-3" : "text-ink-3/60")}>{n}</span>
              </button>
            );
          })}
        </div>
      )}

      <section aria-label="Cases" className="mx-4 overflow-hidden rounded-xl border border-line bg-surface shadow-card md:mx-6">
        <div className={cx("grid gap-4 px-5 py-2 text-[11.5px] font-medium text-ink-3", cols)}>
          <span className={plain ? undefined : "pl-[18px]"}>Case</span>
          {plain ? <span className="text-right">Documents</span> : (
            <>
              <span>Status</span>
              <span className="hidden text-right lg:block">Invoice total</span><span className="text-right">At stake</span>
            </>
          )}
        </div>
        <ul>
          {shown.map((c) => {
            const s = summaries[c.id];
            return (
              <li key={c.id} className="border-t border-line">
                <button type="button" onClick={() => onOpen(c.id)}
                  className={cx("grid w-full items-center gap-4 px-5 py-3.5 text-left hover:bg-sunken", cols)}>
                  <span className="flex min-w-0 items-center gap-2.5">
                    {s && !plain && <StatusDot tone={s.status.tone} />}
                    <span className="min-w-0">
                      <span className="block truncate text-row font-semibold">{c.title}</span>
                      {!plain && <span className="block truncate text-[13px] text-ink-2">{c.summary}</span>}
                    </span>
                  </span>
                  {plain ? <span className="text-right text-body text-ink-2">{s?.documents ?? "—"}</span> : (
                    <>
                      <span className="text-[13px]">
                        <span className={cx("rounded-full border px-2 text-xs font-semibold leading-5",
                          s?.status.tone === "you" ? "border-waiting-line text-waiting" : "border-line-strong text-ink-2")}>{s?.status.label ?? "Loading…"}</span>
                        {s && s.toDecide > 0 && <span className="mt-1 block text-xs text-ink-3">{s.toDecide} to decide</span>}
                      </span>
                      <span className="hidden text-right text-body font-semibold lg:block">{s ? money(s.billedCents) : "—"}</span>
                      <span className={cx("text-right text-[17px] font-[650]", s?.atStakeCents ? "text-dispute" : "text-ink-3")}>
                        {s ? money(s.atStakeCents) : "—"}
                      </span>
                    </>
                  )}
                </button>
              </li>
            );
          })}
          {!shown.length && (
            <li className="border-t border-line px-5 py-6 text-[13.5px] text-ink-2">
              No cases here. <button type="button" onClick={() => setFilter("all")} className="font-medium text-link underline underline-offset-[3px]">Show all cases</button>
            </li>
          )}
        </ul>
      </section>
    </div>
  );
}
