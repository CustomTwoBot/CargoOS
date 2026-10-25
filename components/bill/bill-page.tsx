"use client";
// One bill (docs/design.md §0.5): how much is safe to pay, who does what, the one next step for the
// person on this screen, then the lines grouped Hold / Ask / Pay. Documents and History are tabs of
// the same page so a quote opens its document without losing the place. Leo sees documents only.
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { Person, SourceSpan } from "@/lib/types";
import { cx } from "@/components/case/cx";
import { money } from "@/components/case/format";
import { historyEntries } from "@/components/history/history";
import { isRechecking } from "@/components/case/view-model";
import { useBills, type Bill } from "@/components/app/bills-provider";
import { nextStep, type Step } from "@/components/app/next-step";
import { LinkButton } from "@/components/app/ui";
import { ArrowDown, FileText, History, MoneyIcon, Receipt, type LucideIcon } from "@/components/app/icons";
import { RISE } from "@/components/app/motion";
import { isUploaderOnly } from "@/components/shell/person";
import { DocumentsTab } from "./documents-tab";
import { HistoryTab } from "./history-tab";
import { Hero } from "./hero";
import { Lines } from "./lines";
import { trackOf, splitOf } from "./models";
import { NextStepCard, ReadingCard, RecheckStrip } from "./next-step-card";
import { Track } from "./track";

type Tab = "bill" | "documents" | "history";
const TABS: Tab[] = ["bill", "documents", "history"];
const TAB: Record<Tab, { name: string; icon: LucideIcon }> = {
  bill: { name: "Bill", icon: Receipt }, documents: { name: "Documents", icon: FileText }, history: { name: "History", icon: History },
};

export function BillPage({ id }: { id: string }) {
  const { bill, person, now, mode, rememberBill } = useBills();
  const b = bill(id);
  // A live bill opened by its link (from the other laptop, or the phone's QR) joins this screen's list.
  const convexId = mode === "live" && /^[a-z0-9]{20,}$/.test(id);
  useEffect(() => { if (!b && convexId) rememberBill(id); }, [b, convexId, id, rememberBill]);
  const [waited, setWaited] = useState(false);
  useEffect(() => {
    if (b) return;
    const t = setTimeout(() => setWaited(true), convexId ? 8000 : 1500);
    return () => clearTimeout(t);
  }, [b, convexId]);
  if (!b) {
    if (!waited) return <BillSkeleton />;
    return (
      <div className="mx-auto flex max-w-[920px] flex-col items-start gap-3 px-4 pt-10 sm:px-6">
        <h1 className="text-[24px] font-bold">This bill isn’t on this screen.</h1>
        <p className="text-ink-3">The link may be old, or the bill was reset with the demo.</p>
        <LinkButton href="/bills" variant="secondary">All bills</LinkButton>
      </div>
    );
  }
  return <Body key={b.id} b={b} person={person} now={now} />;
}

/** Bring the next-step card into view and give it focus, so keyboard users land on it too. */
function toCard(el: HTMLElement | null) {
  if (!el) return;
  const smooth = typeof window !== "undefined" && window.matchMedia && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  el.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "center" });
  el.focus({ preventScroll: true });
}

/** After the hero scrolls away: who the bill is from, the three amounts, and a way back to the next step. */
function SummaryBar({ b, onNext }: { b: Bill; onNext?: () => void }) {
  const s = splitOf(b.x);
  const part = (kind: "pay" | "hold" | "ask", word: string, cents: number, cls: string) => (
    <span className={cx("inline-flex items-center gap-1 whitespace-nowrap font-semibold tabular-nums", cls)}>
      <MoneyIcon kind={kind} className="size-3.5" />{word} {money(cents)}
    </span>
  );
  return (
    <div className="fixed inset-x-0 top-16 z-10 border-b border-line/70 bg-bg/90 backdrop-blur animate-in fade-in slide-in-from-top-1 duration-200 motion-reduce:animate-none">
      <div className="mx-auto flex h-12 w-full max-w-[960px] items-center gap-x-4 px-4 text-[13.5px] sm:px-6">
        <span className="hidden min-w-0 truncate font-bold sm:block">{b.forwarder}</span>
        {part("pay", "Pay", s.pay, "text-pay")}
        {s.hold > 0 && part("hold", "Hold", s.hold, "text-hold")}
        {s.ask > 0 && <span className="hidden sm:inline-flex">{part("ask", "Ask", s.ask, "text-ask")}</span>}
        <span className="flex-1" />
        {onNext && (
          <button type="button" onClick={onNext}
            className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-[10px] bg-brand px-3 text-[13px] font-semibold text-brand-ink hover:opacity-90">
            Next step<ArrowDown aria-hidden="true" strokeWidth={2.2} className="size-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

/** While a live bill loads: the page's shape, quietly. */
function BillSkeleton() {
  const bar = "rounded-[8px] bg-raised motion-safe:animate-pulse";
  return (
    <div aria-busy="true" aria-label="Loading the bill" className="mx-auto flex w-full max-w-[960px] flex-col gap-4 px-4 pt-5 sm:px-6">
      <div className={cx(bar, "h-5 w-64")} />
      <div className="flex flex-col gap-4 rounded-[20px] border border-line bg-surface p-7">
        <div className={cx(bar, "h-10 w-3/4")} />
        <div className={cx(bar, "h-[18px] w-full rounded-full")} />
        <div className="grid grid-cols-3 gap-4">{[0, 1, 2].map((i) => <div key={i} className={cx(bar, "h-12")} />)}</div>
      </div>
      <div className={cx(bar, "h-24 w-full rounded-[20px]")} />
      <div className={cx(bar, "h-64 w-full rounded-[20px]")} />
    </div>
  );
}

function Body({ b, person, now }: { b: Bill; person: Person; now: Date | null }) {
  const params = useSearchParams();
  const asked = params?.get("tab");
  const uploader = isUploaderOnly(person);
  const [tab, setTab] = useState<Tab>(uploader ? "documents" : TABS.includes(asked as Tab) ? (asked as Tab) : "bill");
  const [focus, setFocus] = useState<{ docId: string; quote?: string }>();

  // While a replayed answer is still moving lines, the card keeps showing the recheck.
  const busy = isRechecking(b.x) || (!b.live && b.local.replaying);
  const found = nextStep(b.x, person);
  const step: Step = busy && found.kind !== "documents" && found.kind !== "reading" ? { kind: "rechecking" } : found;
  const docsCount = b.x.documents.length;
  const historyCount = historyEntries(b.x).length;
  const openQuote = (span: SourceSpan) => { setFocus({ docId: span.docId, quote: span.quote }); setTab("documents"); };
  const [openKey, setOpenKey] = useState<string>();
  /** From a document's "Used for line N": back to the bill with that line open. */
  const showLine = (lineNo: number) => {
    const f = b.x.findings.find((v) => v.revision === b.x.case.revision && v.lineNo === lineNo);
    setOpenKey(f?.key);
    setTab("bill");
  };
  const invoice = b.x.documents.find((d) => d.type === "freight_invoice");

  useEffect(() => {
    const prev = document.title;
    document.title = [b.forwarder, b.invoiceRef, "CargoOS"].filter(Boolean).join(" · ");
    return () => { document.title = prev; };
  }, [b.forwarder, b.invoiceRef]);

  // The slim summary bar shows once the hero has scrolled under the top bar.
  const heroRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const [past, setPast] = useState(false);
  useEffect(() => {
    const el = heroRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setPast(!e.isIntersecting && e.boundingClientRect.top < 0), { rootMargin: "-64px 0px 0px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [tab]);

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
        {(uploader ? (["documents"] as Tab[]) : TABS).map((t) => {
          const Icon = TAB[t].icon;
          return (
            <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
              className={cx("inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[13.5px] font-semibold transition-colors",
                tab === t ? "bg-surface text-ink shadow-card" : "text-ink-2 hover:text-ink")}>
              <Icon aria-hidden="true" strokeWidth={1.9} className={cx("size-4", tab === t ? "text-ink" : "text-ink-3")} />
              {TAB[t].name}
              {t !== "bill" && <span className="tabular-nums text-ink-3">{t === "documents" ? docsCount : historyCount}</span>}
            </button>
          );
        })}
      </div>

      {tab === "bill" && !uploader && (
        <div role="tabpanel" aria-label="Bill" className="flex flex-col gap-4">
          {past && <SummaryBar b={b} onNext={step.kind === "clear" ? undefined : () => toCard(cardRef.current)} />}
          <div ref={heroRef}><Hero x={b.x} now={now} rechecking={step.kind === "rechecking"} dim={isRechecking(b.x)} /></div>
          <Track steps={trackOf(b.x, step, b.forwarder)} />
          <RecheckStrip bill={b} busy={busy} person={person} />
          {step.kind !== "documents" && (
            <div key={step.kind} ref={cardRef} tabIndex={-1} className={cx(RISE, "rounded-[20px] outline-none")}>
              <NextStepCard bill={b} step={step} person={person} />
            </div>
          )}
          {step.kind !== "answer" && step.kind !== "rechecking" && (
            <ReadingCard bill={b} person={person} onCorrect={() => { setFocus(undefined); setTab("documents"); }} />
          )}
          <Lines bill={b} person={person} onQuote={openQuote} openKey={openKey} />
          {invoice && <p className="text-center text-[12.5px] text-ink-3">Checked against everything in Documents. Open a line to see the words CargoOS used.</p>}
        </div>
      )}
      {tab === "documents" && (
        <div role="tabpanel" aria-label="Documents"><DocumentsTab bill={b} focus={focus} onLine={showLine} /></div>
      )}
      {tab === "history" && !uploader && (
        <div role="tabpanel" aria-label="History"><HistoryTab bill={b} /></div>
      )}
    </div>
  );
}
