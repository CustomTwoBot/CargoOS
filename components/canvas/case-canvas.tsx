// The invoice canvas (docs/design.md §0.4 п.3): the verdict, the marked-up invoice lines, and in
// their place a source document or the message to the seller when focused.
// SKELETON: the case-calm session replaces this with the real canvas (see docs/mockups/d.html).
import { money } from "@/components/case/format";
import type { CanvasProps } from "@/components/case/panes";
import { toRows, totalsOf } from "@/components/case/view-model";

export function CaseCanvas({ x, focus, onFocus }: CanvasProps) {
  const totals = totalsOf(x);
  return (
    <section aria-label="Invoice" className="min-h-0 flex-1 overflow-auto bg-bg px-7 pb-24 pt-6">
      <div className="mx-auto max-w-[760px] rounded-[14px] border border-line bg-surface p-5">
        <p className="text-[44px] font-[650] leading-[48px] text-dispute">{money(totals.atStakeCents)}</p>
        <p className="mt-1 text-ink-2">may not be owed · focus: {focus.kind}</p>
        <ul className="mt-4">
          {toRows(x).map((r) => (
            <li key={r.key}>
              <button type="button" className="py-1 text-left" onClick={() => onFocus({ kind: "line", key: r.key })}>
                {r.lineNo}. {r.description}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
