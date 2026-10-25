// At stake card with the stacked bar, and the four step cards (docs/design.md §7.3, §7.4, §0).
import { cx } from "./cx";
import { Hint, HINTS } from "./bits";
import { money } from "./format";
import { StatusGlyph } from "./glyphs";
import type { CaseTotals } from "./totals";
import type { Step } from "./view-model";

type AtStakeProps = { totals: CaseTotals; countLine: string; checked: string; rechecking: boolean };

export function AtStakeCard({ totals: t, countLine, checked, rechecking }: AtStakeProps) {
  const pct = (cents: number) => (t.billedCents ? `${(cents / t.billedCents) * 100}%` : "0%");
  const dim = rechecking ? "opacity-45 transition-opacity" : "";
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
          <span className="text-ink-3" aria-live="polite">
            {rechecking && <span className="mr-1.5 inline-block size-[11px] animate-spin rounded-full border-[1.5px] border-line-strong border-t-ink align-[-1px]" />}
            {rechecking ? "Rechecking charges with your answer…" : checked}
          </span>
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

export function StepCards({ steps }: { steps: Step[] }) {
  return (
    <ol aria-label="Next steps" className="grid grid-cols-4 gap-2">
      {steps.map((s, i) => (
        <li key={i} aria-current={s.state === "current" ? "step" : undefined}
          className={cx("flex items-center gap-[9px] rounded-lg border border-line bg-surface px-3 py-[9px] text-[13px] leading-[18px] text-ink-3 shadow-card",
            s.state === "done" && "text-ink-2",
            s.state === "current" && "border-primary-ring font-semibold text-ink")}>
          <span className={cx("grid size-[22px] flex-none place-items-center rounded-full border-[1.5px] border-line-strong text-[11.5px] font-bold",
            s.state === "done" && "border-cleared bg-cleared text-cleared-ink",
            s.state === "current" && "border-ink text-ink")}>
            {s.state === "done" ? <StatusGlyph group="cleared" /> : i + 1}
          </span>
          <span>{s.title}<small className="block text-[11.5px] font-normal text-ink-3">{s.sub}</small></span>
        </li>
      ))}
    </ol>
  );
}
