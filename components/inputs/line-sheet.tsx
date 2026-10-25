// Line editor C: the right panel becomes the editor. It shows the line exactly as printed on the
// invoice next to the fields, so you fix it against the source, then shows old → new.
import { useState } from "react";
import { money } from "@/components/case/format";
import type { Row } from "@/components/case/view-model";
import { useLineEditor, useLines, type EditableLine, type LineChange } from "./line-edit";
import { LineFields, LinkButton, SaveCancel } from "./fields";
import { EditLink, LineRow, LinesCard } from "./line-rows";

type Props = {
  rows: Row[]; lines: EditableLine[]; quotes: Record<string, string>; invoiceTitle: string;
  onSave?: (key: string, change: LineChange) => void; initialSelected?: string;
};

export function SheetLineEditor({ rows, lines: initial, quotes, invoiceTitle, onSave, initialSelected }: Props) {
  const { lines, edited, save } = useLines(initial, onSave);
  const [selected, setSelected] = useState(initialSelected);
  const [editing, setEditing] = useState<string>();
  const line = lines.find((l) => l.key === editing);
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_404px] items-start gap-4">
      <LinesCard>
        {rows.map((r) => (
          <LineRow key={r.key} r={r} line={lines.find((l) => l.key === r.key)!} edited={edited.has(r.key)}
            selected={selected === r.key || editing === r.key} onSelect={() => setSelected(r.key)}
            below={selected === r.key && editing !== r.key && <EditLink onClick={() => setEditing(r.key)} />} />
        ))}
      </LinesCard>
      <aside aria-label="Edit line" className="rounded-xl border border-line bg-surface shadow-card">
        {line ? <Sheet key={line.key} line={line} quote={quotes[line.key]} invoiceTitle={invoiceTitle} onSave={save} onClose={() => setEditing(undefined)} />
          : <p className="px-4 py-3 text-[13px] text-ink-2">Select a line, then Edit, to fix its description or amount.</p>}
      </aside>
    </div>
  );
}

type SheetProps = { line: EditableLine; quote?: string; invoiceTitle: string; onSave: (key: string, c: LineChange) => void; onClose: () => void };

function Sheet({ line, quote, invoiceTitle, onSave, onClose }: SheetProps) {
  const ed = useLineEditor(line, onSave, { open: true });
  const actions = { ...ed, save: () => { const r = ed.save(); if (r === "unchanged") onClose(); return r; }, cancel: () => { ed.cancel(); onClose(); } };
  return (
    <div>
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <h2 className="text-panel font-[650]">Line {line.lineNo}</h2>
        <LinkButton onClick={onClose}>Close</LinkButton>
      </div>
      <div className="grid gap-4 px-4 py-4">
        {quote && (
          <figure>
            <figcaption className="mb-1 text-xs font-semibold text-ink-2">On {invoiceTitle}</figcaption>
            <blockquote className="whitespace-pre-wrap rounded-lg border border-line bg-sunken px-3 py-2 text-[13px] leading-5 text-ink">{quote}</blockquote>
          </figure>
        )}
        {ed.open ? (
          <>
            <LineFields ed={actions} />
            <p className="text-xs text-ink-3">Your edit is saved to the case history. The invoice file stays as it was.</p>
            <div className="flex justify-end"><SaveCancel ed={actions} /></div>
          </>
        ) : (
          <div role="status" className="grid gap-1">
            <p className="text-xs font-semibold text-ink-2">Saved</p>
            <p className="text-delta font-[650]">
              {ed.saved && ed.saved.fromCents !== ed.saved.toCents
                ? <>{money(ed.saved.fromCents)} <span className="text-ink-3">→</span> {money(ed.saved.toCents)}</>
                : money(line.amountCents)}
            </p>
            {ed.saved && ed.saved.fromDescription !== ed.saved.toDescription && (
              <p className="text-[13px] text-ink-2"><s>{ed.saved.fromDescription}</s> → {ed.saved.toDescription}</p>
            )}
            <p className="mt-1 text-xs text-ink-3">In this replay the line isn&apos;t rechecked.</p>
            <div className="mt-2 flex gap-3"><LinkButton onClick={ed.start}>Edit again</LinkButton><LinkButton onClick={onClose}>Done</LinkButton></div>
          </div>
        )}
      </div>
    </div>
  );
}
