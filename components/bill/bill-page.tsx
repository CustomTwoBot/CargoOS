"use client";
// One bill (docs/design.md §0.5): how much is safe to pay, who does what, the one next step for the
// person on this screen, then the lines grouped Hold / Ask / Pay. Documents and History are tabs of
// the same page so a quote opens its document without losing the place. Leo sees documents only.
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import type { SourceSpan } from "@/lib/types";
import { cx } from "@/components/case/cx";
import { money } from "@/components/case/format";
import { historyEntries } from "@/components/history/history";
import { isRechecking } from "@/components/case/view-model";
import { useBills, type Bill } from "@/components/app/bills-provider";
import { nextStep } from "@/components/app/next-step";
import { LinkButton } from "@/components/app/ui";
import { isUploaderOnly } from "@/components/shell/person";
import { DocumentsTab } from "./documents-tab";
import { HistoryTab } from "./history-tab";
import { Hero } from "./hero";
import { Lines } from "./lines";
import { trackOf, splitOf } from "./models";
import { NextStepCard, ReadingCard } from "./next-step-card";
import { Track } from "./track";

type Tab = "bill" | "documents" | "history";
const TABS: Tab[] = ["bill", "documents", "history"];

export function BillPage({ id }: { id: string }) {
  const { bill, person, now } = useBills();
  const b = bill(id);
  if (!b) {
    return (
      <div className="mx-auto flex max-w-[920px] flex-col items-start gap-3 px-4 pt-10 sm:px-6">
        <h1 className="text-[24px] font-bold">This bill isn’t on this screen.</h1>
        <p className="text-ink-3">It may still be loading, or it was created on another device.</p>
        <LinkButton href="/bills" variant="secondary">All bills</LinkButton>
      </div>
    );
  }
  return <Body key={b.id} b={b} person={person} now={now} />;
}

function Body({ b, person, now }: { b: Bill; person: ReturnType<typeof useBills>["person"]; now: Date | null }) {
  const params = useSearchParams();
  const asked = params?.get("tab");
  const uploader = isUploaderOnly(person);
  const [tab, setTab] = useState<Tab>(uploader ? "documents" : TABS.includes(asked as Tab) ? (asked as Tab) : "bill");
  const [focus, setFocus] = useState<{ docId: string; quote?: string }>();

  const step = nextStep(b.x, person);
  const docsCount = b.x.documents.length;
  const historyCount = historyEntries(b.x).length;
  const openQuote = (span: SourceSpan) => { setFocus({ docId: span.docId, quote: span.quote }); setTab("documents"); };
  const invoice = b.x.documents.find((d) => d.type === "freight_invoice");

  return (
    <div className={cx("mx-auto flex w-full flex-col gap-4 px-4 pt-5 sm:px-6", tab === "documents" ? "max-w-[1240px]" : "max-w-[960px]")}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Link href="/bills" className="font-semibold text-link no-underline hover:underline">← All bills</Link>
        <span className="text-ink-4">/</span>
        <span className="font-semibold">{b.forwarder}</span>
        <span className="text-ink-3">
          {[b.invoiceRef, !uploader && splitOf(b.x).billed ? money(splitOf(b.x).billed) : undefined, b.live ? undefined : "replay"].filter(Boolean).join(" · ")}
        </span>
      </div>

      <div role="tablist" aria-label="This bill" className="flex w-fit gap-1 rounded-full bg-raised p-[3px]">
        {(uploader ? (["documents"] as Tab[]) : TABS).map((t) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
            className={cx("inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[13.5px] font-semibold",
              tab === t ? "bg-surface text-ink shadow-card" : "text-ink-2 hover:text-ink")}>
            {t === "bill" ? "Bill" : t === "documents" ? "Documents" : "History"}
            {t !== "bill" && <span className="tabular-nums text-ink-3">{t === "documents" ? docsCount : historyCount}</span>}
          </button>
        ))}
      </div>

      {tab === "bill" && !uploader && (
        <div role="tabpanel" aria-label="Bill" className="flex flex-col gap-4">
          <Hero x={b.x} now={now} rechecking={step.kind === "rechecking" || isRechecking(b.x)} />
          <Track steps={trackOf(b.x, step, b.forwarder)} />
          <NextStepCard bill={b} step={step} person={person} />
          {step.kind !== "answer" && step.kind !== "rechecking" && (
            <ReadingCard bill={b} person={person} onCorrect={() => { setFocus(undefined); setTab("documents"); }} />
          )}
          <Lines bill={b} person={person} onQuote={openQuote} />
          {invoice && <p className="text-center text-[12.5px] text-ink-3">Checked against everything in Documents. Open a line to see the words CargoOS used.</p>}
        </div>
      )}
      {tab === "documents" && (
        <div role="tabpanel" aria-label="Documents"><DocumentsTab bill={b} focus={focus} /></div>
      )}
      {tab === "history" && !uploader && (
        <div role="tabpanel" aria-label="History"><HistoryTab bill={b} /></div>
      )}
    </div>
  );
}
