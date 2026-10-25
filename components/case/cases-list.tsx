// All cases: one row per invoice being checked, with what is at stake and what waits on you.
// Each case reports its live summary, so the list reflects what you did inside it. The invoice
// total column drops out below 1024px so the list fits from 768px up.
import type { CaseStatus } from "@/components/shell/case-status";
import { StatusDot } from "@/components/shell/status-dot";
import { cx } from "./cx";
import type { DemoCase } from "./demo-case";
import { money } from "./format";

export type CaseSummary = {
  atStakeCents: number; billedCents: number; pill: string; status: CaseStatus; openQuestions: number; toDecide: number;
};

const COLS = "grid-cols-[minmax(0,1fr)_170px_120px] lg:grid-cols-[minmax(0,1fr)_180px_120px_140px]";

type Props = { cases: DemoCase[]; summaries: Record<string, CaseSummary>; onOpen: (id: string) => void };

export function CasesList({ cases, summaries, onOpen }: Props) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto pb-6">
      <header className="px-4 pb-3 pt-3.5 md:px-6">
        <h1 className="flex items-center gap-2.5 text-title font-[650] tracking-[-0.012em]">
          Cases
          <span title="Replay of a recorded run. Nothing here reaches the backend or Claude."
            className="rounded-full border border-line-strong px-2 text-xs font-semibold leading-5 text-ink-2">Replay</span>
        </h1>
        <p className="mt-0.5 text-[13px] text-ink-2">
          {cases.length} invoices checked before you pay. <span className="text-ink-3">Synthetic data. Nothing is sent or paid automatically.</span>
        </p>
      </header>
      <section aria-label="Cases" className="mx-4 overflow-hidden md:mx-6 rounded-xl border border-line bg-surface shadow-card">
        <div className={cx("grid gap-4 px-5 py-2 text-[11.5px] font-medium text-ink-3", COLS)}>
          <span className="pl-[18px]">Case</span><span>Status</span>
          <span className="hidden text-right lg:block">Invoice total</span><span className="text-right">At stake</span>
        </div>
        <ul>
          {cases.map((c) => {
            const s = summaries[c.id];
            return (
              <li key={c.id} className="border-t border-line">
                <button type="button" onClick={() => onOpen(c.id)}
                  className={cx("grid w-full items-center gap-4 px-5 py-3.5 text-left hover:bg-sunken", COLS)}>
                  <span className="flex min-w-0 items-center gap-2.5">
                    {s && <StatusDot tone={s.status.tone} />}
                    <span className="min-w-0">
                      <span className="block truncate text-row font-semibold">{c.title}</span>
                      <span className="block truncate text-[13px] text-ink-2">{c.summary}</span>
                    </span>
                  </span>
                  <span className="text-[13px]">
                    <span className={cx("rounded-full border px-2 text-xs font-semibold leading-5",
                      s?.openQuestions ? "border-waiting-line text-waiting" : "border-line-strong text-ink-2")}>{s?.pill ?? "Loading…"}</span>
                    {s && s.toDecide > 0 && <span className="mt-1 block text-xs text-ink-3">{s.toDecide} to decide</span>}
                  </span>
                  <span className="hidden text-right text-body font-semibold lg:block">{s ? money(s.billedCents) : "—"}</span>
                  <span className={cx("text-right text-[17px] font-[650]", s?.atStakeCents ? "text-dispute" : "text-ink-3")}>
                    {s ? money(s.atStakeCents) : "—"}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
