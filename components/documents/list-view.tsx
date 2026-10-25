// The case's Documents: document list on the left, the selected document with its quotes on the right;
// below 1024px the list sits above the document.
import { useState } from "react";
import { cx } from "@/components/case/cx";
import { ChainGlyph } from "@/components/case/glyphs";
import type { CaseInput } from "@/components/case/view-model";
import { linesText, type DocRow } from "./documents";
import { DocumentCard, meta, StatusText } from "./parts";

/** "Read, 7 facts · lines 2, 3, 5, 7 and 8": the status, then where it was used, on one line. */
function StatusLine({ row }: { row: DocRow }) {
  const used = row.lines.length ? linesText(row.lines) : undefined;
  return (
    <span className="flex min-w-0 gap-1 text-meta" title={[row.status.label, used].filter(Boolean).join(" · ")}>
      <StatusText status={row.status} className="shrink-0" />
      {used && <span className="min-w-0 truncate text-ink-3">· {used}</span>}
    </span>
  );
}

export function ListView({ x, rows, facts = true }: { x: CaseInput; rows: DocRow[]; facts?: boolean }) {
  const [selectedId, setSelectedId] = useState(rows[0]?.doc._id);
  const selected = rows.find((r) => r.doc._id === selectedId) ?? rows[0];
  return (
    <div data-testid="documents-layout" className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto px-6 pb-16 lg:grid lg:grid-cols-[300px_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)] lg:overflow-visible">
      <ul aria-label="Documents" className="max-h-[220px] flex-none overflow-auto rounded-xl border border-line bg-surface p-1.5 shadow-card lg:max-h-none lg:min-h-0">
        {rows.map((r) => (
          <li key={r.doc._id}>
            <button type="button" onClick={() => setSelectedId(r.doc._id)} aria-current={r === selected || undefined}
              className={cx("grid w-full grid-cols-[28px_minmax(0,1fr)] gap-2.5 rounded-lg px-2.5 py-2 text-left",
                r === selected ? "bg-sunken" : "hover:bg-sunken")}>
              <span className="mt-0.5 grid size-7 place-items-center rounded-full border border-line-strong bg-surface text-ink-2">
                <ChainGlyph icon={r.icon} />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[13.5px] font-[650] leading-[19px]" title={r.doc.title}>{r.doc.title}</span>
                <span className="block truncate text-meta text-ink-3">{meta(r)}</span>
                <StatusLine row={r} />
              </span>
            </button>
          </li>
        ))}
      </ul>
      {selected ? <DocumentCard key={selected.doc._id} x={x} row={selected} facts={facts} />
        : <p className="text-why text-ink-2">No documents in this case yet.</p>}
    </div>
  );
}
