// The money strip pinned above every case tab (docs/design.md §0.2): At stake on the left, one
// invoice bar and one line of figures on the right. Rechecking uses the quiet state (§7.14).
import { Fragment } from "react";
import { cx } from "./cx";
import { Hint, HINTS } from "./bits";
import { inCurrency, money } from "./format";
import { QuietRecheckLine, QUIET_DIM } from "@/components/states/quiet";
import type { CaseTotals } from "./totals";

type StripProps = { totals: CaseTotals; countLine: string; checked: string; rechecking: boolean; chargeCount: number };

const HATCH = "bg-[repeating-linear-gradient(135deg,var(--waiting-fill)_0_3px,transparent_3px_6px)]";

export function MoneyStrip({ totals: t, countLine, checked, rechecking, chargeCount }: StripProps) {
  const pct = (cents: number) => (t.billedCents ? `${(cents / t.billedCents) * 100}%` : "0%");
  const dim = rechecking ? QUIET_DIM : "";
  const figures: { label: string; cents: number; swatch?: string; value?: string }[] = [
    { label: "Matches", cents: t.agreedCents, swatch: "bg-line-strong" },
    { label: "At stake", cents: t.atStakeCents, swatch: "bg-dispute", value: "text-dispute" },
    // Nothing waiting: the figure goes, like its segment in the bar.
    ...(t.waitingCents ? [{ label: "Waiting", cents: t.waitingCents, swatch: HATCH }] : []),
    ...(t.waivedCents ? [{ label: "Not an issue", cents: t.waivedCents, swatch: "border border-line-strong" }] : []),
    { label: "Invoice", cents: t.billedCents },
  ];
  return (
    <section aria-label="Case totals" title={checked}
      className="grid min-h-16 grid-cols-[auto_minmax(0,1fr)] items-center gap-x-6 rounded-xl border border-line bg-surface px-5 py-2 shadow-card">
      <div>
        <div className="flex items-center gap-[5px] text-meta font-medium text-ink-2">
          At stake <Hint label="At stake" text={HINTS.atStake} />
        </div>
        <div data-testid="at-stake" className={cx("text-[30px] font-[650] leading-[34px] tracking-[-0.02em] text-dispute", dim)}>{money(t.atStakeCents)}</div>
      </div>
      <div className="min-w-0">
        <div className={cx("flex h-2 gap-0.5 overflow-hidden rounded-[4px] bg-sunken", dim)} aria-hidden="true">
          <i className="block h-full bg-line-strong" style={{ width: pct(t.agreedCents) }} />
          <i className="block h-full bg-dispute" style={{ width: pct(t.atStakeCents) }} />
          <i className={cx("block h-full", HATCH)} style={{ width: pct(t.waitingCents) }} />
          {t.waivedCents > 0 && <i className="block h-full bg-line" style={{ width: pct(t.waivedCents) }} />}
        </div>
        <p data-testid="money-figures" className="mt-1.5 text-meta text-ink-2">
          {rechecking ? <QuietRecheckLine count={chargeCount} /> : (
            <>
              {figures.map((f, i) => (
                <Fragment key={f.label}>
                  {i > 0 && <span className="text-ink-3"> · </span>}
                  <span className="whitespace-nowrap">
                    {f.swatch && <span aria-hidden="true" className={cx("mr-1.5 inline-block size-2 rounded-[2px] align-[1px]", f.swatch)} />}
                    {f.label} <b className={cx("font-semibold text-ink", f.value)}>{money(f.cents)}</b>
                  </span>
                </Fragment>
              ))}
              {t.unconverted.map((u) => (
                <Fragment key={u.currency}>
                  <span className="text-ink-3"> · </span>
                  <span className="whitespace-nowrap text-ink-3" title="Billed in another currency. CargoOS doesn't convert it, so it isn't in the USD totals.">
                    {inCurrency(u.cents, u.currency)} not converted
                  </span>
                </Fragment>
              ))}
            </>
          )}
        </p>
        <p className="sr-only">{countLine}</p>
      </div>
    </section>
  );
}
