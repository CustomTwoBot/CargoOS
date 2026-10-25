// Variation C: a tracker. Every document's three steps (received, read, used in the checks) in one
// table, so a gap shows at a glance; the selected document opens below.
import { useState } from "react";
import { cx } from "@/components/case/cx";
import { ChainGlyph } from "@/components/case/glyphs";
import type { CaseInput } from "@/components/case/view-model";
import { trackOf, type DocRow } from "./documents";
import { DocumentCard, meta } from "./parts";

type StepState = "done" | "todo" | "failed";

function Step({ state, label }: { state: StepState; label: string }) {
  return (
    <span className={cx("inline-flex items-center gap-1.5 text-meta",
      state === "done" && "text-ink", state === "todo" && "text-ink-3", state === "failed" && "font-semibold text-waiting")}>
      <svg viewBox="0 0 14 14" width="14" height="14" aria-hidden="true" className="block flex-none">
        {state === "done"
          ? <path d="M3.2 7.4l2.6 2.6 5-5.4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          : <circle cx="7" cy="7" r="5.25" fill="none" stroke="currentColor" strokeWidth="1.4" strokeDasharray="2.1 1.7" />}
      </svg>
      {label}
    </span>
  );
}

export function TrackerView({ x, rows }: { x: CaseInput; rows: DocRow[] }) {
  const [selectedId, setSelectedId] = useState(rows[0]?.doc._id);
  const selected = rows.find((r) => r.doc._id === selectedId) ?? rows[0];
  const th = "px-3 pb-2 pt-2.5 text-left text-xs font-medium text-ink-3";
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 px-6 pb-4">
      <div className="flex-none overflow-hidden rounded-xl border border-line bg-surface shadow-card">
        <table aria-label="Documents" className="w-full table-fixed border-collapse">
          <thead className="border-b border-line">
            <tr>
              <th className={cx(th, "pl-4")}>Document</th>
              <th className={cx(th, "w-[140px]")}>Received</th>
              <th className={cx(th, "w-[190px]")}>Read</th>
              <th className={cx(th, "w-[190px]")}>Used in checks</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const t = trackOf(x, r.doc);
              const on = r === selected;
              return (
                <tr key={r.doc._id} onClick={() => setSelectedId(r.doc._id)}
                  className={cx("cursor-pointer border-b border-line last:border-b-0", on ? "bg-sunken" : "hover:bg-sunken")}>
                  <td className="py-2 pl-4 pr-3">
                    <button type="button" onClick={() => setSelectedId(r.doc._id)} aria-current={on || undefined}
                      className="grid w-full grid-cols-[24px_minmax(0,1fr)] items-center gap-2.5 text-left">
                      <span className="text-ink-2"><ChainGlyph icon={r.icon} /></span>
                      <span className="min-w-0">
                        <span className="block truncate text-[13.5px] font-[650] leading-[19px]">{r.doc.title}</span>
                        <span className="block text-meta text-ink-3">{meta(r)}</span>
                      </span>
                    </button>
                  </td>
                  <td className="px-3"><Step state={t.received ? "done" : "todo"} label={t.received ?? "Not yet"} /></td>
                  <td className="px-3">
                    {t.read.state === "read" ? <Step state="done" label={t.read.read} />
                      : <Step state={t.read.state === "failed" ? "failed" : "todo"} label={t.read.label} />}
                  </td>
                  <td className="px-3">
                    {t.used ? <Step state={t.used.n > 0 ? "done" : "todo"} label={`${t.used.n} of ${t.used.of}`} />
                      : <Step state="todo" label="—" />}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {selected && <DocumentCard key={selected.doc._id} x={x} row={selected} />}
    </div>
  );
}
