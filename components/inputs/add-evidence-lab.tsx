"use client";
// /lab/add-evidence: three ways to paste evidence into the case, on Scenario A.
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { cx } from "@/components/case/cx";
import type { AddEvidence, EvidenceOutcome } from "./evidence-input";
import { EvidenceBar } from "./evidence-bar";
import { EvidenceDrawer } from "./evidence-drawer";
import { DocumentsWithAdd } from "./evidence-inline";
import { scenarioADocuments, scenarioALines } from "./lab-data";
import { LabShell, pickVariation, type Variation } from "./lab-shell";
import { LineRow, LinesCard } from "./line-rows";

export const EVIDENCE_VARIATIONS: Variation[] = [
  { id: "a", name: "Drawer from the header", idea: "Add evidence sits next to Draft dispute and opens a roomy panel on the right. Easy to find; covers the evidence panel while open." },
  { id: "b", name: "Last row of the documents", idea: "The form opens in place under the quote, email and chat, and the new item joins them. Shows where it goes; needs the documents list on screen." },
  { id: "c", name: "One field, type guessed", idea: "Paste into a single field under the header; CargoOS guesses email, chat or note. Fastest; the guess can be wrong, so it says what it picked." },
];

type Mode = "replay" | "live";

/** Lab only: "Live preview" fakes the backend so the reading state can be seen. */
function adder(mode: Mode): AddEvidence {
  if (mode === "replay") return () => ({ kind: "replay" });
  return (e) => new Promise<EvidenceOutcome>((done) =>
    setTimeout(() => done(/\$\s?\d|\d[\d,]*\.\d{2}/.test(e.text) ? { kind: "changed", lines: 1 } : { kind: "no_amounts" }), 1400));
}

export function AddEvidenceLab() {
  const v = useSearchParams().get("v") ?? undefined;
  const current = pickVariation(EVIDENCE_VARIATIONS, v);
  const [mode, setMode] = useState<Mode>("replay");
  const onAdd = useMemo(() => adder(mode), [mode]);
  const data = useMemo(() => scenarioALines(), []);
  const docs = useMemo(() => scenarioADocuments().filter((d) => d.type !== "reply"), []);
  const list = (
    <LinesCard>{data.rows.map((r) => <LineRow key={r.key} r={r} line={data.lines.find((l) => l.key === r.key)!} />)}</LinesCard>
  );
  const header = (button?: React.ReactNode) => (
    <div className="mb-3 flex items-center justify-between rounded-xl border border-line bg-surface px-4 py-3 shadow-card">
      <div>
        <p className="text-panel font-[650]">{data.invoiceTitle}</p>
        <p className="text-meta text-ink-3">Synthetic data. Nothing is sent or paid automatically.</p>
      </div>
      <div className="flex items-center gap-2.5">
        {button}
        <span className="rounded-md bg-primary px-3.5 py-1.5 text-[13px] font-semibold text-primary-ink opacity-50">Draft dispute</span>
      </div>
    </div>
  );

  return (
    <LabShell title="Add evidence" variations={EVIDENCE_VARIATIONS} current={current} aside={
      <div role="group" aria-label="Mode" className="inline-flex rounded-[9px] border border-line bg-surface p-[3px]">
        {(["replay", "live"] as const).map((m) => (
          <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)}
            title={m === "live" ? "Lab only: fakes a backend so you can see the reading state." : "What the replay app does today."}
            className={cx("rounded-[6px] px-2.5 text-xs font-semibold leading-6 text-ink-3", mode === m && "bg-line-strong text-ink")}>
            {m === "replay" ? "Replay" : "Live preview"}
          </button>
        ))}
      </div>
    }>
      <div key={`${current.id}-${mode}`}>
        {current.id === "a" && <>{header(<EvidenceDrawer onAdd={onAdd} />)}{list}</>}
        {current.id === "b" && (
          <>{header()}<div className="grid grid-cols-[minmax(0,1fr)_404px] items-start gap-4">{list}<DocumentsWithAdd documents={docs} onAdd={onAdd} /></div></>
        )}
        {current.id === "c" && <>{header()}<div className="mb-3"><EvidenceBar onAdd={onAdd} /></div>{list}</>}
      </div>
    </LabShell>
  );
}
