// Pieces of the Documents view: the status text and the document with its quotes highlighted
// next to what each one became.
import { useRef, useState } from "react";
import { cx } from "@/components/case/cx";
import type { CaseInput } from "@/components/case/view-model";
import { itemsOf, segmentsOf, usedFor, type DocRow, type DocStatus, type Item } from "./documents";

export const meta = (r: DocRow) => [r.kind, r.sender, r.date].filter(Boolean).join(" · ");

export function StatusText({ status, className }: { status: DocStatus; className?: string }) {
  const failed = status.state === "failed" || status.state === "partial";
  return (
    <span className={cx("block text-meta", failed ? "font-semibold text-waiting" : "text-ink-2", className)}>
      {status.label}
    </span>
  );
}

export const FAILED = "Couldn't read part of this document; affected lines are waiting on answers.";

type Box = { top: number; bottom: number; height: number };

/**
 * Where to scroll `box` so `el` sits a third of the way down, or undefined when it is already in view.
 * Pure, so the long-document behavior is testable without a layout engine.
 */
export function scrollTopFor(box: Box, scrollTop: number, el: Pick<Box, "top" | "bottom">): number | undefined {
  if (el.top >= box.top && el.bottom <= box.bottom) return undefined;
  return Math.max(0, Math.round(scrollTop + el.top - box.top - box.height / 3));
}

/** Scrolls only `box` (never the page) to bring `el` into view; no smooth scroll, one motion per screen. */
function bringIntoView(box: HTMLElement | null, el: Element | null | undefined) {
  if (!box || !el) return;
  const top = scrollTopFor(box.getBoundingClientRect(), box.scrollTop, el.getBoundingClientRect());
  if (top !== undefined) box.scrollTo?.({ top });
}

// Every quote is marked lightly so a long chat isn't a wall of yellow; the selected one gets the full mark.
const LIGHT = "bg-highlight/30 text-ink dark:bg-highlight/20";

/** The document text with one mark per quote: the selected quote in full, the hovered one outlined. */
export function DocumentText({ text, items, active, selected, onPick }: {
  text: string; items: Pick<Item, "id" | "quote">[]; active?: string; selected?: string; onPick?: (id: string) => void;
}) {
  const { segments } = segmentsOf(text, items);
  return (
    <p data-testid="document-text" className="min-w-0 whitespace-pre-wrap rounded-lg border border-line bg-surface p-3 text-[13px] leading-5 [overflow-wrap:anywhere]">
      {segments.map((s, i) => s.id
        ? <mark key={i} data-quote={s.id} data-selected={selected === s.id || undefined} onClick={() => onPick?.(s.id!)}
            className={cx("cursor-pointer", selected !== s.id && LIGHT,
              active === s.id && "outline-2 outline-offset-1 outline-ink")}>{s.text}</mark>
        : s.text)}
    </p>
  );
}

/** One thing CargoOS took from a document, in plain words. Hover or focus points at its quote; a click selects it. */
export function ItemButton({ item, active, selected, missing, onActive, onShow }: {
  item: Item; active: boolean; selected?: boolean; missing?: boolean; onActive: (id?: string) => void; onShow?: (id: string) => void;
}) {
  const used = usedFor(item.lines);
  return (
    <button type="button" data-item={item.id} onClick={() => onShow?.(item.id)} onMouseEnter={() => onActive(item.id)}
      onFocus={() => onActive(item.id)} onMouseLeave={() => onActive(undefined)} aria-pressed={selected ?? false}
      title="Show it in the text"
      className={cx("-mx-2 block w-[calc(100%+16px)] break-words rounded-[7px] px-2 py-1.5 text-left text-[13.5px] leading-5",
        selected ? "bg-line-strong/60" : active && "bg-sunken", missing && "text-ink-3")}>
      {item.text}{" "}
      {item.note && <span className="block text-xs text-ink-3">{item.note}</span>}
      {!item.note && used && <span className="block text-xs text-ink-3">{used}</span>}
      {missing && <span className="block text-xs text-ink-3">Not found in the text.</span>}
    </button>
  );
}

/** The selected document: its text with quotes highlighted, and what each quote became (unless `facts` is off). */
export function DocumentCard({ x, row, facts = true }: { x: CaseInput; row: DocRow; facts?: boolean }) {
  const [active, setActive] = useState<string>();
  const [selected, setSelected] = useState<string>();
  const textBox = useRef<HTMLDivElement>(null);
  const listBox = useRef<HTMLDivElement>(null);
  const st = row.status;
  const read = st.state === "read" || st.state === "partial";
  const items = read && facts ? itemsOf(x, row.doc) : [];
  const { missing } = segmentsOf(row.doc.text, items);

  // From the list: select it and scroll the text. From the text: select it and scroll the list.
  const show = (id: string) => { setSelected(id); bringIntoView(textBox.current, textBox.current?.querySelector(`[data-quote="${id}"]`)); };
  const pick = (id: string) => { setSelected(id); bringIntoView(listBox.current, listBox.current?.querySelector(`[data-item="${id}"]`)); };

  return (
    <section aria-label={row.doc.title} className="flex flex-none flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-card lg:min-h-0 lg:flex-auto">
      <div className="flex items-start justify-between gap-4 border-b border-line px-4 pb-2.5 pt-3">
        <div className="min-w-0">
          <div className="text-meta text-ink-3">{meta(row)}</div>
          <h2 className="mt-0.5 break-words text-panel font-[650]">{row.doc.title}</h2>
        </div>
        <div className="shrink-0 pt-[18px]"><StatusText status={st} /></div>
      </div>
      <div className={cx("grid min-h-0 flex-1 grid-cols-1 lg:grid-rows-[minmax(0,1fr)]", facts && "lg:grid-cols-[minmax(0,1fr)_300px]")}>
        <div ref={textBox} data-testid="document-scroll" className="max-h-[60vh] min-h-0 overflow-auto bg-sunken p-3 lg:max-h-none">
          {(st.state === "failed" || st.state === "partial") && (
            <div role="status" className="mb-3 rounded-lg bg-waiting-tint px-3 py-2 text-meta text-waiting">
              <p>{FAILED}</p>
              {st.where && <p className="text-ink-2">Not read: {st.where}.</p>}
            </div>
          )}
          <DocumentText text={row.doc.text} items={items} active={active} selected={selected} onPick={pick} />
        </div>
        {facts && <div ref={listBox} className="min-h-0 overflow-auto border-t border-line px-4 pt-3 lg:border-l lg:border-t-0">
          <h3 className="text-[13.5px] font-[650]">What CargoOS read</h3>
          {st.state === "waiting" && <p className="mt-1 text-why text-ink-2">Not read yet.</p>}
          {st.state === "failed" && <p className="mt-1 text-why text-ink-2">Nothing was taken from it.</p>}
          {read && !items.length && <p className="mt-1 text-why text-ink-2">Nothing to take from it.</p>}
          <ul className="mt-1.5 pb-3">
            {items.map((it) => (
              <li key={it.id}>
                <ItemButton item={it} active={active === it.id} selected={selected === it.id} missing={missing.includes(it.id)}
                  onActive={setActive} onShow={show} />
              </li>
            ))}
          </ul>
        </div>}
      </div>
    </section>
  );
}
