// The CargoOS thread (docs/design.md §0.4 п.4): what CargoOS did and asked, people's answers and
// decisions, in time order, and at the bottom this person's next step (answer box or action card).
// SKELETON: the inbox-calm session replaces this with the real thread (see docs/mockups/d.html, d2.html).
import type { ThreadProps } from "@/components/case/panes";
import { openQuestions } from "@/components/case/issues";

export function CaseThread({ x, onFocus }: ThreadProps) {
  const question = openQuestions(x)[0];
  return (
    <aside aria-label="CargoOS" className="flex min-h-0 w-[420px] flex-none flex-col border-l border-line bg-surface max-xl:w-[360px]">
      <div className="border-b border-line px-[18px] pb-3 pt-3.5">
        <p className="text-[14.5px] font-[650]">CargoOS</p>
        <p className="text-meta text-ink-3">Checks every line. Asks when it can’t tell. Never pays or sends.</p>
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-[18px] py-4 text-body">
        {question ? <p>{question.text}</p> : <p className="text-ink-3">Nothing waiting.</p>}
        <button type="button" className="mt-3 text-link" onClick={() => onFocus({ kind: "invoice" })}>Show the invoice</button>
      </div>
    </aside>
  );
}
