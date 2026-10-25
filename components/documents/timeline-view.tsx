// Variation B: the documents as a timeline, each with what it added to the agreement.
// The text with highlighted quotes opens inline, one document at a time.
import { useState } from "react";
import { cx } from "@/components/case/cx";
import { ChainGlyph } from "@/components/case/glyphs";
import type { CaseInput } from "@/components/case/view-model";
import { itemsOf, type DocRow } from "./documents";
import { DocumentText, FAILED, ItemButton, StatusText } from "./parts";

export function TimelineView({ x, rows }: { x: CaseInput; rows: DocRow[] }) {
  const [openId, setOpenId] = useState<string>();
  return (
    <div className="min-h-0 flex-1 overflow-auto px-6 pb-6">
      <ol aria-label="Documents" className="mx-auto max-w-[780px] rounded-xl border border-line bg-surface px-5 pb-2 pt-4 shadow-card">
        {rows.map((r, i) => (
          <Entry key={r.doc._id} x={x} row={r} last={i === rows.length - 1}
            open={openId === r.doc._id} onToggle={() => setOpenId(openId === r.doc._id ? undefined : r.doc._id)} />
        ))}
      </ol>
    </div>
  );
}

function Entry({ x, row, last, open, onToggle }: { x: CaseInput; row: DocRow; last: boolean; open: boolean; onToggle: () => void }) {
  const [active, setActive] = useState<string>();
  const items = row.status.state === "read" ? itemsOf(x, row.doc) : [];
  return (
    <li className={cx("relative grid grid-cols-[52px_28px_minmax(0,1fr)] gap-3 pb-5",
      !last && "before:absolute before:bottom-1 before:left-[77.5px] before:top-8 before:w-px before:bg-line-strong")}>
      <span className="pt-1 text-right text-meta font-semibold text-ink-2">{row.date ?? "—"}</span>
      <span className="grid size-7 place-items-center rounded-full border border-line-strong bg-surface text-ink-2">
        <ChainGlyph icon={row.icon} />
      </span>
      <div className="min-w-0">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="truncate text-[14.5px] font-[650] leading-[21px]">{row.doc.title}</h2>
          <StatusText status={row.status} className="flex-none" />
        </div>
        <div className="text-meta text-ink-3">{[row.kind, row.sender].filter(Boolean).join(" · ")}</div>
        {row.status.state === "failed" && <p className="mt-2 rounded-lg bg-waiting-tint px-3 py-2 text-meta text-waiting">{FAILED}</p>}
        {items.length > 0 && (
          <ul className="mt-1.5">
            {items.map((it) => (
              <li key={it.id}><ItemButton item={it} active={open && active === it.id} onActive={setActive} onShow={() => !open && onToggle()} /></li>
            ))}
          </ul>
        )}
        <button type="button" onClick={onToggle} aria-expanded={open}
          className="mt-1 text-meta font-medium text-link underline underline-offset-[3px]">
          {open ? "Hide the text" : "Show the text"}
        </button>
        {open && (
          <div className="mt-2 rounded-lg bg-sunken p-2.5">
            <DocumentText text={row.doc.text} items={items} active={active} />
          </div>
        )}
      </div>
    </li>
  );
}
