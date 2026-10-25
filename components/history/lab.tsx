"use client";
// Lab: the case History screen in three variations on Scenario A, to pick one. Not product UI.
import { useState } from "react";
import { cx } from "@/components/case/cx";
import { DocumentsIcon, HistoryIcon, ListIcon, Logo, QuestionsIcon } from "@/components/case/glyphs";
import { ThemeToggle } from "@/components/case/theme-toggle";
import { historyEntries, scenarioAHistory } from "./history";
import { HistoryLedger } from "./ledger";
import { HistoryStory } from "./story";
import { HistoryTimeline } from "./timeline";

export type Variant = "a" | "b" | "c";

export const VARIANTS: { id: Variant; name: string; idea: string }[] = [
  { id: "a", name: "Timeline", idea: "Quiet timeline by phase, codes behind a toggle. Calm to read; long cases get tall." },
  { id: "b", name: "Table", idea: "Dense table, newest first, filter by who. Fast to audit; reads as a log, not a story." },
  { id: "c", name: "Story", idea: "One sentence per step with the words that caused it. Explains the case; hides repeats inside steps." },
];

export function HistoryLab({ initial = "a" }: { initial?: Variant }) {
  const [v, setV] = useState<Variant>(initial);
  const x = scenarioAHistory();
  const entries = historyEntries(x);
  const current = VARIANTS.find((o) => o.id === v)!;

  return (
    <div className="flex min-h-dvh min-w-[1280px] bg-bg text-ink">
      <nav aria-label="Sections" className="flex w-[60px] flex-none flex-col items-center gap-2 border-r border-line bg-surface py-4">
        <span className="mb-2.5 text-ink"><Logo /></span>
        {([["Cases", <ListIcon key="l" />], ["Questions", <QuestionsIcon key="q" />], ["Documents", <DocumentsIcon key="d" />], ["History", <HistoryIcon key="h" />]] as const)
          .map(([label, icon]) => (
            <span key={label} title={label} aria-label={label} role="img"
              className={cx("grid size-[38px] place-items-center rounded-[10px] text-ink-3", label === "History" && "bg-sunken text-ink")}>
              {icon}
            </span>
          ))}
      </nav>
      <main className="min-w-0 flex-1 px-6 pb-8">
        <div className="flex items-center gap-3 border-b border-dashed border-line-strong py-2 text-meta">
          <span className="font-semibold text-ink-3">History lab</span>
          <div className="inline-flex rounded-[9px] border border-line bg-surface p-[3px] font-medium" role="group" aria-label="Variation">
            {VARIANTS.map((o) => (
              <button key={o.id} type="button" aria-pressed={v === o.id} onClick={() => setV(o.id)}
                className={cx("rounded-[6px] px-2.5 py-0.5", v === o.id ? "bg-line-strong text-ink" : "text-ink-3 hover:text-ink")}>
                {o.id.toUpperCase()} · {o.name}
              </button>
            ))}
          </div>
          <span className="text-ink-2">{current.idea}</span>
        </div>
        <header className="flex items-center justify-between gap-4 pb-3 pt-3.5">
          <div>
            <h1 className="text-title font-[650] tracking-[-0.012em]">History</h1>
            <p className="mt-0.5 text-[13px] text-ink-2">
              {x.case.title} · Invoice {x.case.shipmentRef} <span className="text-ink-3">Times in Pacific time.</span>
            </p>
          </div>
          <ThemeToggle />
        </header>
        {v === "a" && <HistoryTimeline entries={entries} />}
        {v === "b" && <HistoryLedger entries={entries} />}
        {v === "c" && <HistoryStory entries={entries} />}
      </main>
    </div>
  );
}
