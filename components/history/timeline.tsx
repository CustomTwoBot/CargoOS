"use client";
// Variation A: a quiet timeline grouped by phase, oldest first. Event codes stay hidden until asked for.
import { useState } from "react";
import { cx } from "@/components/case/cx";
import { byPhase, clockPT, PHASE_NAME, type Entry } from "./history";
import { AppendOnly, Who } from "./bits";

export function HistoryTimeline({ entries }: { entries: Entry[] }) {
  const [codes, setCodes] = useState(false);
  return (
    <section aria-label="History" className="mx-auto w-full max-w-[760px] rounded-xl border border-line bg-surface shadow-card">
      <div className="flex items-center justify-between border-b border-line px-5 py-3">
        <h2 className="text-panel font-[650]">What happened</h2>
        <button type="button" aria-pressed={codes} onClick={() => setCodes((c) => !c)}
          className={cx("rounded-md border px-2.5 py-1 text-meta font-medium",
            codes ? "border-line-strong bg-sunken text-ink" : "border-line text-ink-3 hover:text-ink")}>
          Event codes
        </button>
      </div>
      <div className="px-5 pb-1 pt-2">
        {byPhase(entries).map(({ phase, entries: es }) => (
          <section key={phase} aria-label={PHASE_NAME[phase]} className="py-2">
            <h3 className="mb-1 text-[13px] font-semibold text-ink-2">{PHASE_NAME[phase]}</h3>
            <ol className="relative ml-[5px] border-l border-line-strong">
              {es.map((e) => (
                <li key={e.id} data-testid="history-entry"
                  className="relative grid grid-cols-[64px_150px_minmax(0,1fr)_auto] items-baseline gap-3 py-[5px] pl-4 text-[13.5px] leading-5">
                  <span aria-hidden className={cx("absolute -left-[4px] top-[11px] size-[7px] rounded-full border border-surface",
                    e.who === "you" ? "bg-ink" : "bg-line-strong", e.blocked && "bg-dispute")} />
                  <time dateTime={e.at} className="text-meta text-ink-3">{clockPT(e.at)}</time>
                  <Who entry={e} />
                  <span className={cx("min-w-0 text-ink-2", e.blocked && "text-dispute")}>{e.what}</span>
                  {codes && <code className={cx("font-sans text-xs text-ink-3", e.blocked && "text-dispute")}>{e.code}</code>}
                </li>
              ))}
            </ol>
          </section>
        ))}
      </div>
      <AppendOnly className="border-t border-line px-5 py-3" />
    </section>
  );
}
