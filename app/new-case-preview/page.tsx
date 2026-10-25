"use client";
// TEMPORARY preview of the New case flow, the live empty case and the empty cases list. Remove at integration.
// "Live (fake)" reads with a canned delay and Scenario A counts so the reading states can be seen;
// the chat fails once on messages 3–4 to show "Paste the text instead".
import { useState } from "react";
import { cx } from "@/components/case/cx";
import { ThemeToggle } from "@/components/case/theme-toggle";
import { CasesEmpty } from "@/components/new-case/cases-empty";
import { EmptyCaseUpload } from "@/components/new-case/empty-case";
import type { NewCaseDocType, NewCaseDraft, ReadDocument, ReadResult, ReadingItem } from "@/components/new-case/model";
import { NewCaseFlow } from "@/components/new-case/new-case-flow";
import { ReadingProgress } from "@/components/new-case/reading-progress";

type View = "replay" | "live" | "empty" | "none";
const VIEWS: [View, string][] = [["replay", "Replay"], ["live", "Live (fake)"], ["empty", "Empty case (live)"], ["none", "No cases"]];

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const failedOnce = new Set<string>();

const fakeRead: ReadDocument = async (doc) => {
  await wait(900 + Math.random() * 1400);
  if (doc.type === "chat" && !failedOnce.has(doc.title)) {
    failedOnce.add(doc.title);
    return { kind: "failed", where: "messages 3–4", facts: 1 };
  }
  const r: Partial<Record<NewCaseDocType, ReadResult>> = {
    freight_invoice: { kind: "read", facts: 0, charges: 8 },
    quote: { kind: "read", facts: 6 },
    email: { kind: "read", facts: 1 },
    chat: { kind: "read", facts: 2 },
  };
  return r[doc.type] ?? { kind: "no_amounts" };
};

/** What the overview would show from the backend while uploads are read. */
const BACKEND: ReadingItem[] = [
  { key: "1", title: "Invoice PCL-INV-1012", type: "freight_invoice", state: "read", charges: 8 },
  { key: "2", title: "Quote Q-PCL-0902", type: "quote", state: "read", facts: 6 },
  { key: "3", title: "Email: RE: Q-PCL-0902 revised", type: "email", state: "reading" },
  { key: "4", title: "WhatsApp chat", type: "chat", state: "reading" },
];

export default function NewCasePreview() {
  const [view, setView] = useState<View>("replay");
  const [run, setRun] = useState(0);
  const [log, setLog] = useState<string>();
  const [uploaded, setUploaded] = useState(0);
  const done = (s: string) => setLog(s);

  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <div className="flex items-center gap-3 border-b border-line bg-surface px-6 py-2 text-[13px]">
        <span className="font-semibold text-ink-2">Preview, remove at integration</span>
        <div role="group" aria-label="View" className="inline-flex rounded-[9px] border border-line bg-sunken p-[3px]">
          {VIEWS.map(([v, label]) => (
            <button key={v} type="button" aria-pressed={view === v}
              onClick={() => { setView(v); setRun((n) => n + 1); setLog(undefined); setUploaded(0); failedOnce.clear(); }}
              className={cx("rounded-[6px] px-3 font-semibold leading-[26px] text-ink-3", view === v && "bg-surface text-ink shadow-[0_0_0_1px_var(--line-strong)]")}>
              {label}
            </button>
          ))}
        </div>
        {log && <span className="truncate text-ink-2">{log}</span>}
        <span className="ml-auto"><ThemeToggle /></span>
      </div>
      <div className="flex flex-1 flex-col pt-2">
        {view === "none" ? (
          <>
            <header className="px-6 pb-3 pt-3.5">
              <h1 className="text-title font-[650] tracking-[-0.012em]">Cases</h1>
              <p className="mt-0.5 text-[13px] text-ink-3">Synthetic data. Nothing is sent or paid automatically.</p>
            </header>
            <CasesEmpty onNew={() => setView("replay")} onLoadExample={(id) => done(`onLoadExample("${id}")`)} />
          </>
        ) : view === "empty" ? (
          <div className="grid gap-4 px-6 pt-3.5">
            <h1 className="text-title font-[650] tracking-[-0.012em]">Bayline 40HC Ningbo-LB</h1>
            {uploaded === 0 ? (
              <EmptyCaseUpload uploadUrl="https://cargoos.example/upload/case_A"
                onAdd={(docs) => { setUploaded(docs.length); done(`onAdd(${docs.map((d) => d.type).join(", ")})`); }}
                onLoadScenarioA={() => done("onLoadScenarioA()")} />
            ) : (
              <section className="max-w-[760px] rounded-xl border border-line bg-surface px-5 pb-3 pt-4 shadow-card">
                <ReadingProgress items={BACKEND} />
              </section>
            )}
          </div>
        ) : (
          <NewCaseFlow key={run} onRead={view === "live" ? fakeRead : undefined}
            uploadUrl={view === "live" ? "https://cargoos.example/upload/new" : undefined}
            onCancel={() => done("onCancel()")}
            onLoadExample={(id) => done(`onLoadExample("${id}")`)}
            onCreate={(d: NewCaseDraft) => done(`onCreate("${d.title}", ${d.documents.map((x) => x.type).join(", ")})`)} />
        )}
      </div>
    </div>
  );
}
