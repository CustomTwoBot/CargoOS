// A source document on the canvas (docs/design.md §0.4 п.3): "← Invoice", the document, and the quote
// that was clicked marked in full and scrolled into view. Everything else CargoOS took from it is
// marked lightly, so the reader sees what was used.
import { useEffect, useRef } from "react";
import type { CaseInput } from "@/components/case/view-model";
import { docRows, itemsOf } from "@/components/documents/documents";
import { DocumentText, FAILED, meta, StatusText } from "@/components/documents/parts";

const FOCUS = "focus";
const same = (a: string, b: string) => a.replace(/\s+/g, " ").trim() === b.replace(/\s+/g, " ").trim();

type Props = { x: CaseInput; docId: string; quote?: string; onBack: () => void; marks: boolean };

export function DocView({ x, docId, quote, onBack, marks }: Props) {
  const row = docRows(x).find((r) => r.doc._id === docId);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = box.current?.querySelector("[data-selected]");
    el?.scrollIntoView?.({ block: "center" });
  }, [docId, quote]);
  if (!row) return <Back onBack={onBack}><p className="text-why text-ink-2">This document isn&apos;t in the case.</p></Back>;
  const items = marks ? itemsOf(x, row.doc) : [];
  const hit = quote ? items.find((i) => same(i.quote, quote)) : undefined;
  // The clicked quote goes first, so it wins where marks overlap.
  const marked = quote ? [{ id: hit?.id ?? FOCUS, quote }, ...items.filter((i) => i !== hit)] : items;
  const st = row.status;
  return (
    <Back onBack={onBack}>
      <article aria-label={row.doc.title} className="overflow-hidden rounded-[14px] border border-line bg-surface shadow-card">
        <header className="flex items-start justify-between gap-4 border-b border-line px-5 pb-3 pt-4">
          <div className="min-w-0">
            <p className="text-meta text-ink-3">{meta(row)}</p>
            <h2 className="mt-0.5 break-words text-panel font-[650]">{row.doc.title}</h2>
          </div>
          <StatusText status={st} className="shrink-0 pt-[18px]" />
        </header>
        <div ref={box} className="bg-sunken p-3">
          {(st.state === "failed" || st.state === "partial") && (
            <div role="status" className="mb-3 rounded-lg bg-waiting-tint px-3 py-2 text-meta text-waiting">
              <p>{FAILED}</p>
              {st.where && <p className="text-ink-2">Not read: {st.where}.</p>}
            </div>
          )}
          <DocumentText text={row.doc.text} items={marked} selected={quote ? hit?.id ?? FOCUS : undefined} />
        </div>
      </article>
    </Back>
  );
}

/** "← Invoice" above whatever replaced the invoice on the canvas. */
export function Back({ onBack, children }: { onBack: () => void; children: React.ReactNode }) {
  return (
    <div>
      <button type="button" onClick={onBack} className="mb-3 text-[13.5px] font-semibold text-ink-2 hover:text-ink">← Invoice</button>
      {children}
    </div>
  );
}
