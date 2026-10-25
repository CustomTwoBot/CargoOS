"use client";
// TEMPORARY preview of the New case flow and the empty cases list. Remove at integration.
// "Live (fake)" reads with a canned delay and Scenario A counts so the reading states can be seen;
// the chat fails once on messages 3–4 to show "Paste the text instead".
import { useState } from "react";
import { cx } from "@/components/case/cx";
import { ThemeToggle } from "@/components/case/theme-toggle";
import { CasesEmpty } from "@/components/new-case/cases-empty";
import type { NewCaseDraft, ReadDocument, ReadResult } from "@/components/new-case/model";
import { NewCaseFlow } from "@/components/new-case/new-case-flow";

type View = "replay" | "live" | "empty";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

const fakeRead: ReadDocument = async (doc) => {
  await wait(900 + Math.random() * 1400);
  const r: Record<string, ReadResult> = {
    freight_invoice: { kind: "read", facts: 0, charges: 8 },
    quote: { kind: "read", facts: 6 },
    email: { kind: "read", facts: 1 },
    chat: /may be extra/.test(doc.text) && !/^PASTED/.test(doc.text)
      ? { kind: "failed", where: "messages 3–4", facts: 1 }
      : { kind: "read", facts: 2 },
  };
  return r[doc.type] ?? { kind: "no_amounts" };
};

export default function NewCasePreview() {
  const [view, setView] = useState<View>("replay");
  const [run, setRun] = useState(0);
  const [log, setLog] = useState<string>();
  const done = (s: string) => setLog(s);

  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <div className="flex items-center gap-3 border-b border-line bg-surface px-6 py-2 text-[13px]">
        <span className="font-semibold text-ink-2">Preview, remove at integration</span>
        <div role="group" aria-label="View" className="inline-flex rounded-[9px] border border-line bg-sunken p-[3px]">
          {(["replay", "live", "empty"] as View[]).map((v) => (
            <button key={v} type="button" aria-pressed={view === v} onClick={() => { setView(v); setRun((n) => n + 1); setLog(undefined); }}
              className={cx("rounded-[6px] px-3 font-semibold leading-[26px] text-ink-3", view === v && "bg-surface text-ink shadow-[0_0_0_1px_var(--line-strong)]")}>
              {v === "replay" ? "Replay" : v === "live" ? "Live (fake)" : "No cases"}
            </button>
          ))}
        </div>
        {log && <span className="truncate text-ink-2">{log}</span>}
        <span className="ml-auto"><ThemeToggle /></span>
      </div>
      <div className="flex flex-1 flex-col pt-2">
        {view === "empty" ? (
          <>
            <header className="px-6 pb-3 pt-3.5">
              <h1 className="text-title font-[650] tracking-[-0.012em]">Cases</h1>
              <p className="mt-0.5 text-[13px] text-ink-3">Synthetic data. Nothing is sent or paid automatically.</p>
            </header>
            <CasesEmpty onNew={() => setView("replay")} onLoadExample={(id) => done(`onLoadExample("${id}")`)} />
          </>
        ) : (
          <NewCaseFlow key={run} onRead={view === "live" ? fakeRead : undefined}
            onCancel={() => done("onCancel()")}
            onLoadExample={(id) => done(`onLoadExample("${id}")`)}
            onCreate={(d: NewCaseDraft) => done(`onCreate("${d.title}", ${d.documents.map((x) => x.type).join(", ")})`)} />
        )}
      </div>
    </div>
  );
}
