// The approval track (round 4, P3): who did what on this bill, in five steps. Read from the case's
// events and its draft by `trackOf`; the decision itself lives in the next-step card below it.
// Done steps carry a check, the current one breathes softly, a rejection carries an X; the line
// between them fills up to the current step.
import { cx } from "@/components/case/cx";
import { Check, X } from "@/components/app/icons";
import type { TrackStep } from "./models";

// The same colors as PersonAvatar: Sam forest + lime, Maya yellow; CargoOS ink.
const AVATAR: Record<string, string> = {
  C: "bg-ink text-bg",
  S: "bg-[var(--lime-ink)] text-lime dark:bg-lime dark:text-lime-ink",
  M: "bg-maya text-maya-ink",
};

const STATE_WORD: Record<TrackStep["state"], string> = { done: "Done", now: "Now", later: "Later", bad: "Rejected" };

export function Track({ steps }: { steps: TrackStep[] }) {
  // The line fills to the last step that is done or happening now.
  const reached = steps.reduce((n, s, i) => (s.state === "later" ? n : i), 0);
  const fill = `${(reached / Math.max(1, steps.length)) * 100}%`;
  const bad = steps.some((s) => s.state === "bad");
  return (
    <section aria-label="Who does what on this bill" className="overflow-x-auto rounded-[20px] border border-line bg-surface px-5 py-4 shadow-card sm:px-6">
      <ol className="relative flex min-w-[640px]">
        <span aria-hidden="true" className="absolute left-4 right-4 top-[15px] h-0.5 rounded-full bg-line" />
        <span aria-hidden="true" style={{ width: fill }}
          className={cx("absolute left-4 top-[15px] h-0.5 rounded-full transition-[width] duration-700 ease-move motion-reduce:transition-none", bad ? "bg-hold" : "bg-pay-fill")} />
        {steps.map((s) => (
          <li key={s.key} className="relative flex min-w-0 flex-1 flex-col gap-1.5 pr-3" aria-current={s.state === "now" ? "step" : undefined}>
            <span aria-hidden="true" className="relative z-[1] inline-flex size-8">
              {s.state === "now" && <span className="absolute -inset-1 rounded-full bg-ink/10 motion-safe:animate-pulse" />}
              <span className={cx("relative inline-flex size-8 items-center justify-center rounded-full border-2 text-[12px] font-bold transition-colors duration-500",
                s.state === "done" && cx("border-transparent", AVATAR[s.who] ?? "bg-raised text-ink-2"),
                s.state === "now" && "border-ink bg-surface text-ink",
                s.state === "later" && "border-line bg-sunken text-ink-4",
                s.state === "bad" && "border-hold bg-hold-tint text-hold")}>
                {s.who}
              </span>
              {s.state === "done" && (
                <span className="absolute -bottom-1 -right-1.5 inline-flex size-[15px] items-center justify-center rounded-full bg-pay-fill text-white ring-2 ring-surface animate-in zoom-in-50 duration-300 motion-reduce:animate-none">
                  <Check strokeWidth={3.2} className="size-[9px]" />
                </span>
              )}
              {s.state === "bad" && (
                <span className="absolute -bottom-1 -right-1.5 inline-flex size-[15px] items-center justify-center rounded-full bg-hold-fill text-white ring-2 ring-surface">
                  <X strokeWidth={3.2} className="size-[9px]" />
                </span>
              )}
            </span>
            <span className="sr-only">{STATE_WORD[s.state]}:</span>
            <span className={cx("text-[13.5px] font-bold leading-5", s.state === "later" ? "text-ink-4" : s.state === "bad" ? "text-hold" : "text-ink")}>{s.title}</span>
            <span className="text-[12.5px] leading-[18px] text-ink-3">{s.sub}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
