// The approval track (round 4, P3): who did what on this bill, in five steps. Read from the case's
// events and its draft by `trackOf`; the decision itself lives in the next-step card below it.
import { cx } from "@/components/case/cx";
import type { TrackStep } from "./models";

const AVATAR: Record<string, string> = {
  C: "bg-ink text-bg",
  S: "bg-[var(--lime-ink)] text-lime dark:bg-lime dark:text-lime-ink",
  M: "bg-maya text-maya-ink",
};

export function Track({ steps }: { steps: TrackStep[] }) {
  return (
    <section aria-label="Who does what on this bill" className="overflow-x-auto rounded-[20px] border border-line bg-surface px-5 py-4 shadow-card sm:px-6">
      <ol className="relative flex min-w-[640px]">
        <span aria-hidden="true" className="absolute left-4 right-4 top-[15px] h-0.5 bg-line" />
        {steps.map((s) => (
          <li key={s.key} className="relative flex min-w-0 flex-1 flex-col gap-1.5 pr-3" aria-current={s.state === "now" ? "step" : undefined}>
            <span aria-hidden="true" className={cx("relative z-[1] inline-flex size-8 items-center justify-center rounded-full border-2 text-[12px] font-bold",
              s.state === "done" && cx("border-transparent", AVATAR[s.who] ?? "bg-raised text-ink-2"),
              s.state === "now" && "border-ink bg-surface text-ink",
              s.state === "later" && "border-line bg-sunken text-ink-4",
              s.state === "bad" && "border-hold bg-hold-tint text-hold")}>
              {s.who}
            </span>
            <span className={cx("text-[13.5px] font-bold leading-5", s.state === "later" ? "text-ink-4" : s.state === "bad" ? "text-hold" : "text-ink")}>{s.title}</span>
            <span className="text-[12.5px] leading-[18px] text-ink-3">{s.sub}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
