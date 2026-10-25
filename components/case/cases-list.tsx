// All cases: one row per invoice being checked, with what is at stake and what waits on you.
// Each case reports its live summary, so the list reflects what you did inside it.
import { cx } from "./cx";
import type { DemoCase } from "./demo-case";
import { money } from "./format";

export type CaseSummary = { atStakeCents: number; billedCents: number; pill: string; openQuestions: number; toDecide: number };

type Props = { cases: DemoCase[]; summaries: Record<string, CaseSummary>; onOpen: (id: string) => void };

export function CasesList({ cases, summaries, onOpen }: Props) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="px-6 pb-3 pt-3.5">
        <h1 className="flex items-center gap-2.5 text-title font-[650] tracking-[-0.012em]">
          Cases
          <span title="Replay of a recorded run. Nothing here reaches the backend or Claude."
            className="rounded-full border border-line-strong px-2 text-xs font-semibold leading-5 text-ink-2">Replay</span>
        </h1>
        <p className="mt-0.5 text-[13px] text-ink-2">
          {cases.length} invoices checked before you pay. <span className="text-ink-3">Synthetic data. Nothing is sent or paid automatically.</span>
        </p>
      </header>
      <section aria-label="Cases" className="mx-6 overflow-hidden rounded-xl border border-line bg-surface shadow-card">
        <div className="grid grid-cols-[minmax(0,1fr)_180px_120px_140px] gap-4 px-5 py-2 text-[11.5px] font-medium text-ink-3">
          <span>Case</span><span>Status</span><span className="text-right">Invoice total</span><span className="text-right">At stake</span>
        </div>
        <ul>
          {cases.map((c) => {
            const s = summaries[c.id];
            return (
              <li key={c.id} className="border-t border-line">
                <button type="button" onClick={() => onOpen(c.id)}
                  className="grid w-full grid-cols-[minmax(0,1fr)_180px_120px_140px] items-center gap-4 px-5 py-3.5 text-left hover:bg-sunken">
                  <span className="min-w-0">
                    <span className="block truncate text-row font-semibold">{c.title}</span>
                    <span className="block text-[13px] text-ink-2">{c.summary}</span>
                  </span>
                  <span className="text-[13px]">
                    <span className={cx("rounded-full border px-2 text-xs font-semibold leading-5",
                      s?.openQuestions ? "border-waiting-line text-waiting" : "border-line-strong text-ink-2")}>{s?.pill ?? "Loading…"}</span>
                    {s && s.toDecide > 0 && <span className="mt-1 block text-xs text-ink-3">{s.toDecide} to decide</span>}
                  </span>
                  <span className="text-right text-body font-semibold">{s ? money(s.billedCents) : "—"}</span>
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
