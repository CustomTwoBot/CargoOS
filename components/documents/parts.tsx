// Pieces every Documents variation shares: the page shell, the status text and the document
// with its quotes highlighted next to what each one became.
import { useState, type ReactNode } from "react";
import { Rail } from "@/components/case/chrome";
import { cx } from "@/components/case/cx";
import { ThemeToggle } from "@/components/case/theme-toggle";
import { latestQuestion, type CaseInput } from "@/components/case/view-model";
import { itemsOf, segmentsOf, usedFor, type DocRow, type DocStatus, type Item } from "./documents";

export function Shell({ x, count, children }: { x: CaseInput; count: number; children: ReactNode }) {
  return (
    <div className="flex h-dvh min-w-[1280px] overflow-hidden bg-bg text-ink">
      <Rail openQuestion={latestQuestion(x)?.status === "open"} active="documents" />
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-4 px-6 pb-3 pt-3.5">
          <div className="min-w-0">
            <h1 className="flex items-center gap-2.5 text-title font-[650] tracking-[-0.012em]">
              Documents
              <span title="Replay of a recorded run. Nothing here reaches the backend or Claude."
                className="rounded-full border border-line-strong px-2 text-xs font-semibold leading-5 text-ink-2">Replay</span>
            </h1>
            <p className="mt-0.5 text-[13px] text-ink-2">
              {x.case.title}. {count} documents, oldest first.{" "}
              <span className="text-ink-3">Synthetic data. Nothing is sent or paid automatically.</span>
            </p>
          </div>
          <ThemeToggle />
        </header>
        {children}
      </main>
    </div>
  );
}

export const meta = (r: DocRow) => [r.kind, r.sender, r.date].filter(Boolean).join(" · ");

export function StatusText({ status, className }: { status: DocStatus; className?: string }) {
  return (
    <span className={cx("block text-meta", status.state === "failed" ? "font-semibold text-waiting" : "text-ink-2", className)}>
      {status.label}
    </span>
  );
}

export const FAILED = "Couldn't read part of this document; affected lines are waiting on answers.";

/** The document text with one mark per quote; the active quote gets an outline. */
export function DocumentText({ text, items, active }: { text: string; items: Item[]; active?: string }) {
  const { segments } = segmentsOf(text, items);
  return (
    <p data-testid="document-text" className="whitespace-pre-wrap break-words rounded-lg border border-line bg-surface p-3 text-[13px] leading-5">
      {segments.map((s, i) => s.id
        ? <mark key={i} data-quote={s.id} className={cx(active === s.id && "outline-2 outline-offset-1 outline-ink")}>{s.text}</mark>
        : s.text)}
    </p>
  );
}

/** One thing CargoOS took from a document, in plain words. Hover or focus points at its quote. */
export function ItemButton({ item, active, missing, onActive, onShow }: {
  item: Item; active: boolean; missing?: boolean; onActive: (id?: string) => void; onShow?: (id: string) => void;
}) {
  const used = usedFor(item.lines);
  return (
    <button type="button" onClick={() => onShow?.(item.id)} onMouseEnter={() => onActive(item.id)} onFocus={() => onActive(item.id)}
      onMouseLeave={() => onActive(undefined)} title="Show it in the text"
      className={cx("-mx-2 block w-[calc(100%+16px)] rounded-[7px] px-2 py-1.5 text-left text-[13.5px] leading-5",
        active && "bg-sunken", missing && "text-ink-3")}>
      {item.text}{" "}
      {item.note && <span className="block text-xs text-ink-3">{item.note}</span>}
      {!item.note && used && <span className="block text-xs text-ink-3">{used}</span>}
      {missing && <span className="block text-xs text-ink-3">Not found in the text.</span>}
    </button>
  );
}

const scrollToQuote = (id: string) => document.querySelector(`[data-quote="${id}"]`)?.scrollIntoView?.({ block: "center" });

/** The selected document: its text with quotes highlighted, and what each quote became. */
export function DocumentCard({ x, row }: { x: CaseInput; row: DocRow }) {
  const [active, setActive] = useState<string>();
  const read = row.status.state === "read";
  const items = read ? itemsOf(x, row.doc) : [];
  const { missing } = segmentsOf(row.doc.text, items);

  return (
    <section aria-label={row.doc.title} className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-card">
      <div className="flex items-start justify-between gap-4 border-b border-line px-4 pb-2.5 pt-3">
        <div className="min-w-0">
          <div className="text-meta text-ink-3">{meta(row)}</div>
          <h2 className="mt-0.5 text-panel font-[650]">{row.doc.title}</h2>
        </div>
        <div className="pt-[18px]"><StatusText status={row.status} /></div>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-h-0 overflow-auto bg-sunken p-3">
          {row.status.state === "failed" && <p className="mb-3 rounded-lg bg-waiting-tint px-3 py-2 text-meta text-waiting">{FAILED}</p>}
          <DocumentText text={row.doc.text} items={items} active={active} />
        </div>
        <div className="min-h-0 overflow-auto border-l border-line px-4 pt-3">
          <h3 className="text-[13.5px] font-[650]">What CargoOS read</h3>
          {row.status.state === "waiting" && <p className="mt-1 text-why text-ink-2">Not read yet.</p>}
          {row.status.state === "failed" && <p className="mt-1 text-why text-ink-2">Nothing was taken from it.</p>}
          {read && !items.length && <p className="mt-1 text-why text-ink-2">Nothing to take from it.</p>}
          <ul className="mt-1.5 pb-3">
            {items.map((it) => (
              <li key={it.id}>
                <ItemButton item={it} active={active === it.id} missing={missing.includes(it.id)}
                  onActive={setActive} onShow={(id) => { setActive(id); scrollToQuote(id); }} />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
