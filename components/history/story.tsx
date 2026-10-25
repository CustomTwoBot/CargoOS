// Variation C: the case as a story, oldest first. One sentence per step, the words that caused it
// under it, and the raw events folded away in each step's code line.
import { cx } from "@/components/case/cx";
import { clockPT, secondsPT, storySteps, type Entry } from "./history";
import { AppendOnly, Who } from "./bits";

export function HistoryStory({ entries }: { entries: Entry[] }) {
  const steps = storySteps(entries);
  return (
    <section aria-label="History" className="mx-auto w-full max-w-[680px] rounded-xl border border-line bg-surface shadow-card">
      <ol className="px-6 py-2">
        {steps.map((s) => {
          const blocked = s.entries.some((e) => e.blocked);
          const code = s.entries[0].code;
          return (
            <li key={s.id} data-testid="history-step" className="grid grid-cols-[72px_minmax(0,1fr)] gap-3 border-b border-line py-3.5 last:border-0">
              <time dateTime={s.at} className="pt-px text-meta text-ink-3">{clockPT(s.at)}</time>
              <div className="min-w-0">
                <Who entry={s} className="block text-meta" />
                <p className={cx("mt-0.5 text-row font-semibold", blocked && "text-dispute")}>{s.what}</p>
                {s.quotes.map((q) => (
                  <blockquote key={q} className="mt-1.5 border-l-2 border-line-strong pl-2.5 text-why text-ink-2">“{q}”</blockquote>
                ))}
                <details className="group mt-1.5 text-xs text-ink-3">
                  <summary className="w-fit cursor-pointer list-none hover:text-ink [&::-webkit-details-marker]:hidden">
                    <span className={cx(blocked && "text-dispute")}>{code}</span>
                    {s.entries.length > 1 && <span> ×{s.entries.length}</span>}
                    <span aria-hidden className="ml-1 inline-block group-open:rotate-90">›</span>
                  </summary>
                  <ul className="mt-1 grid gap-0.5">
                    {s.entries.map((e: Entry) => (
                      <li key={e.id} data-testid="history-entry" className="grid grid-cols-[96px_140px_minmax(0,1fr)] gap-2">
                        <span>{secondsPT(e.at)}</span><code className="font-sans">{e.code}</code><span>{e.id}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              </div>
            </li>
          );
        })}
      </ol>
      <AppendOnly className="border-t border-line px-6 py-3" />
    </section>
  );
}
