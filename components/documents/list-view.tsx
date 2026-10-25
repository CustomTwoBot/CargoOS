// The case's Documents: document list on the left, the selected document with its quotes on the right.
import { useState } from "react";
import { cx } from "@/components/case/cx";
import { ChainGlyph } from "@/components/case/glyphs";
import type { CaseInput } from "@/components/case/view-model";
import type { DocRow } from "./documents";
import { DocumentCard, meta, StatusText } from "./parts";

export function ListView({ x, rows }: { x: CaseInput; rows: DocRow[] }) {
  const [selectedId, setSelectedId] = useState(rows[0]?.doc._id);
  const selected = rows.find((r) => r.doc._id === selectedId) ?? rows[0];
  return (
    <div className="grid min-h-0 flex-1 grid-cols-[300px_minmax(0,1fr)] gap-4 px-6 pb-4">
      <ul aria-label="Documents" className="min-h-0 overflow-auto rounded-xl border border-line bg-surface p-1.5 shadow-card">
        {rows.map((r) => (
          <li key={r.doc._id}>
            <button type="button" onClick={() => setSelectedId(r.doc._id)} aria-current={r === selected || undefined}
              className={cx("grid w-full grid-cols-[28px_minmax(0,1fr)] gap-2.5 rounded-lg px-2.5 py-2 text-left",
                r === selected ? "bg-sunken" : "hover:bg-sunken")}>
              <span className="mt-0.5 grid size-7 place-items-center rounded-full border border-line-strong bg-surface text-ink-2">
                <ChainGlyph icon={r.icon} />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[13.5px] font-[650] leading-[19px]">{r.doc.title}</span>
                <span className="block text-meta text-ink-3">{meta(r)}</span>
                <StatusText status={r.status} />
              </span>
            </button>
          </li>
        ))}
      </ul>
      {selected ? <DocumentCard key={selected.doc._id} x={x} row={selected} />
        : <p className="text-why text-ink-2">No documents in this case yet.</p>}
    </div>
  );
}
