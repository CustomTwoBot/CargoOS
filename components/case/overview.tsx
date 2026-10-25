// At stake card with the stacked bar (docs/design.md §7.3). Rechecking uses the quiet state (§7.14).
import { cx } from "./cx";
import { Hint, HINTS } from "./bits";
import { money } from "./format";
import { QuietRecheckLine, QUIET_DIM } from "@/components/states/quiet";
import type { CaseTotals } from "./totals";

type AtStakeProps = { totals: CaseTotals; countLine: string; checked: string; rechecking: boolean; chargeCount: number };

export function AtStakeCard({ totals: t, countLine, checked, rechecking, chargeCount }: AtStakeProps) {
  const pct = (cents: number) => (t.billedCents ? `${(cents / t.billedCents) * 100}%` : "0%");
  const dim = rechecking ? QUIET_DIM : "";
  const legend: { label: string; cents: number; swatch: string; amount?: string }[] = [
    { label: "Matches the agreement", cents: t.agreedCents, swatch: "bg-line-strong" },
    { label: "At stake", cents: t.atStakeCents, swatch: "bg-dispute", amount: "text-dispute" },
    { label: "Waiting for answers", cents: t.waitingCents, swatch: "bg-waiting-fill", amount: t.waitingCents ? "" : "text-ink-3" },
    ...(t.waivedCents ? [{ label: "Waived by clerk", cents: t.waivedCents, swatch: "bg-sunken border border-line-strong" }] : []),
  ];
  return (
    <section aria-label="Case totals"
      className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-8 rounded-xl border border-line bg-surface px-[22px] py-3.5 shadow-card">
      <div>
        <div className="flex items-center gap-[5px] text-meta font-medium text-ink-2">
          At stake, may not be owed <Hint label="At stake" text={HINTS.atStake} />
        </div>
        <div data-testid="at-stake" className={cx("text-hero font-[650] text-dispute", dim)}>{money(t.atStakeCents)}</div>
        <div className="text-[13px] text-ink-2">{countLine}</div>
        <div className="mt-0.5 text-meta text-ink-3">Checked before you pay.</div>
      </div>
      <div>
        <div className="mb-2 flex justify-between text-meta">
          {rechecking ? <QuietRecheckLine count={chargeCount} /> : <span className="text-ink-3">{checked}</span>}
          <span className="font-medium text-ink-2">Invoice total <b className={cx("text-ink", dim)}>{money(t.billedCents)}</b></span>
        </div>
        <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-[5px] bg-sunken" aria-hidden="true">
          <i className="block h-full bg-line-strong" style={{ width: pct(t.agreedCents) }} />
          <i className="block h-full bg-dispute" style={{ width: pct(t.atStakeCents) }} />
          <i className="block h-full bg-[repeating-linear-gradient(135deg,var(--waiting-fill)_0_3px,transparent_3px_6px)]" style={{ width: pct(t.waitingCents) }} />
        </div>
        <dl className="mt-2.5 flex gap-[26px] text-meta text-ink-2">
          {legend.map((l) => (
            <div key={l.label}>
              <dt><span className={cx("mr-1.5 inline-block size-2 rounded-[2px]", l.swatch)} />{l.label}</dt>
              <dd className={cx("mt-px text-panel font-semibold text-ink", l.amount, dim)}>{money(l.cents)}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
