// The verdict at the top of the canvas (docs/design.md §0.4 п.3): what may not be owed, one sentence
// that explains every part of the bar, the bar itself, and the sources it was checked against.
import { useEffect, useState } from "react";
import { cx } from "@/components/case/cx";
import { money } from "@/components/case/format";
import type { Focus } from "@/components/case/panes";
import type { CaseTotals } from "@/components/case/totals";
import { TONE_TEXT } from "@/components/case/words";
import { QuietRecheckLine, QUIET_DIM } from "@/components/states/quiet";
import { verdictSentence, type SourceChip } from "./model";

const COUNT_MS = 600;

const ease = (k: number) => 1 - (1 - k) ** 3;
const reducedMotion = () => typeof window === "undefined" || !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/**
 * The number on screen, counting from the last value to `cents` when it changes (one motion, §9).
 * Whole dollars while counting; the final value is exact. Jumps straight there with reduced motion.
 */
export function useCountUp(cents: number): number {
  const [run, setRun] = useState({ from: cents, to: cents });
  const [k, setK] = useState(1);
  const at = (r: typeof run, p: number) => (p >= 1 ? r.to : Math.round((r.from + (r.to - r.from) * ease(p)) / 100) * 100);
  if (run.to !== cents) {
    setRun({ from: at(run, k), to: cents });
    setK(0);
  }
  useEffect(() => {
    if (run.from === run.to || typeof requestAnimationFrame === "undefined") return;
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / COUNT_MS);
      setK(p);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [run]);
  return reducedMotion() ? cents : at(run, k);
}

type Props = {
  totals: CaseTotals; forwarder?: string; asked: string;
  /** At stake before the latest recheck; shown as "was $300" when it differs. */
  was?: number;
  rechecking: boolean; chargeCount: number;
  sources: SourceChip[]; onFocus: (f: Focus) => void;
};

export function Verdict({ totals: t, forwarder, asked, was, rechecking, chargeCount, sources, onFocus }: Props) {
  const shown = useCountUp(t.atStakeCents);
  const pct = (cents: number) => `${t.billedCents ? (cents / t.billedCents) * 100 : 0}%`;
  const dim = rechecking ? QUIET_DIM : "";
  return (
    <section aria-label="Verdict" className="rounded-[14px] border border-line bg-surface px-5 py-5 shadow-card sm:px-[22px]">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <b data-testid="at-stake" aria-label={money(t.atStakeCents)}
          className={cx("text-[44px] font-[650] leading-[48px] tracking-[-0.02em]", t.atStakeCents ? "text-dispute" : "text-ink-3", dim)}>
          {money(shown)}
        </b>
        <span className="text-[18px] font-semibold">may not be owed</span>
        {was !== undefined && was !== t.atStakeCents && !rechecking && (
          <span data-testid="was" className="rounded-full border border-dispute px-2.5 text-[15px] font-semibold leading-6 text-dispute">was {money(was)}</span>
        )}
      </div>
      <p data-testid="verdict-sentence" className={cx("mt-2 max-w-[600px] text-[15px] leading-[23px] text-ink-2", dim)}>
        {rechecking ? <QuietRecheckLine count={chargeCount} source={asked === "you" ? undefined : `${asked}'s answer`} />
          : verdictSentence(t, forwarder, asked).map((p, i) => (
            <span key={i} className={cx(p.tone === "ink" ? "font-semibold text-ink" : p.tone ? cx("font-semibold", TONE_TEXT[p.tone]) : undefined)}>{p.text}</span>
          ))}
      </p>
      <div aria-hidden="true" className={cx("mt-4 flex h-2 gap-0.5 overflow-hidden rounded-full bg-sunken", dim)}>
        <i className="block h-full bg-line-strong" style={{ width: pct(t.agreedCents) }} />
        <i className="block h-full bg-dispute" style={{ width: pct(t.atStakeCents) }} />
        <i className="block h-full bg-waiting-fill" style={{ width: pct(t.waitingCents) }} />
        {t.waivedCents > 0 && <i className="block h-full bg-line" style={{ width: pct(t.waivedCents) }} />}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2 text-meta">
        <span className="text-ink-3">Checked against</span>
        {sources.map((s) => (
          <button key={s.docId} type="button" onClick={() => onFocus({ kind: "doc", docId: s.docId })}
            className="rounded-[7px] border border-line bg-sunken px-2.5 py-[3px] font-medium text-ink-2 hover:border-line-strong hover:text-ink">
            {s.label}
          </button>
        ))}
      </div>
    </section>
  );
}
