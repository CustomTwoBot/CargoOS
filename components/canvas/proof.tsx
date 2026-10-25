// The proof under an open invoice line (docs/design.md §0.4 п.3): the quotes it was checked against,
// each with its source and a click into the document; the engine's why line; the clerk's decision
// (Keep in dispute / Not an issue) and the line edit.
import type { Charge } from "@/lib/types";
import { chainOf } from "@/components/case/evidence";
import { cx } from "@/components/case/cx";
import type { Focus } from "@/components/case/panes";
import type { CaseInput, Row } from "@/components/case/view-model";
import { useLineEditor, type LineChange } from "@/components/inputs/line-edit";
import { LineFields, SaveCancel, SavedNote } from "@/components/inputs/fields";

const EDGE: Record<Row["group"], string> = { dispute: "border-dispute", waiting: "border-waiting-fill", cleared: "border-cleared" };
const PRIMARY = "rounded-lg bg-primary px-3.5 py-[7px] text-[13.5px] font-semibold text-primary-ink";
const SECONDARY = "rounded-lg border border-line-strong bg-surface px-3.5 py-[7px] text-[13.5px] font-semibold text-ink hover:bg-sunken";

export type ProofProps = {
  x: CaseInput; row: Row; charge?: Charge; asked: string;
  /** A live case: a line edit is rechecked on the server. */
  live?: boolean;
  /** The screen holds clerk: Keep in dispute / Not an issue and the line edit. */
  canDecide: boolean;
  onVerdict: (key: string, v: "confirmed" | "false_positive") => void;
  onSaveLine: (key: string, change: LineChange) => void;
  onFocus: (f: Focus) => void;
};

export function Proof({ x, row, charge, asked, live, canDecide, onVerdict, onSaveLine, onFocus }: ProofProps) {
  const chain = chainOf(x, row, asked);
  // The first step is the invoice line itself, already in the row.
  const steps = chain.steps.slice(1).filter((s) => s.quote || s.text || s.struck);
  const verdict = row.finding.userVerdict;
  return (
    <div data-testid="proof" className={cx("border-l-2 py-1 pl-3 text-[13.5px] leading-[21px] text-ink-2", EDGE[row.group])}>
      <ul className="space-y-0.5">
        {steps.map((s, i) => (
          <li key={i} className="break-words">
            {s.quote ? (
              <>
                {/* An earlier invoice line (the duplicate) says what it is; other quotes say where they came from. */}
                <span>{s.icon === "invoice" ? s.title : s.where ?? s.title}: </span>
                <button type="button" onClick={() => onFocus({ kind: "doc", docId: s.quote!.docId, quote: s.quote!.quote })}
                  title="Open the document with this quote highlighted"
                  className="text-left hover:underline hover:decoration-ink-3 hover:underline-offset-4">
                  <mark>{s.quote.quote.replace(/\s+/g, " ")}</mark>
                </button>
                {s.text && s.icon !== "invoice" && <span className="text-ink-3"> {s.text}</span>}
              </>
            ) : (
              <span>{s.where ?? s.title}: {s.struck && <s className="mr-1 text-ink-3">{s.struck}</s>}{s.text}</span>
            )}
          </li>
        ))}
      </ul>
      <p data-testid="why" className="mt-1.5 text-ink">{row.why}</p>
      {canDecide && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {row.group === "dispute" && verdict !== "confirmed" && (
            <button type="button" className={PRIMARY} onClick={() => onVerdict(row.key, "confirmed")}
              title="Agree with this finding. The line stays in the dispute.">Keep in dispute</button>
          )}
          {row.group !== "cleared" && (
            <button type="button" className={SECONDARY} onClick={() => onVerdict(row.key, "false_positive")}
              title="Moves the line to Cleared. Saved to case history.">Not an issue</button>
          )}
          {verdict === "confirmed" && <span className="text-meta text-ink-3">You kept it in dispute.</span>}
          {charge && <LineEdit key={charge._id} charge={charge} onSave={onSaveLine} live={live} />}
        </div>
      )}
    </div>
  );
}

/** "Edit line": the invoice line's description and amount, inline. */
function LineEdit({ charge, onSave, live }: { charge: Charge; onSave: (key: string, change: LineChange) => void; live?: boolean }) {
  const ed = useLineEditor({ key: charge._id, lineNo: charge.lineNo, description: charge.description, amountCents: charge.amountCents, currency: charge.currency }, onSave);
  if (!ed.open) {
    return (
      <span className="ml-auto flex items-center gap-3">
        {ed.saved && <SavedNote saved={ed.saved} live={live} />}
        <button type="button" onClick={ed.start} className="text-meta font-medium text-ink-3 underline-offset-4 hover:text-ink hover:underline">
          Edit line
        </button>
      </span>
    );
  }
  return (
    <div className="mt-2 w-full rounded-lg border border-line bg-surface p-3">
      <LineFields ed={ed} layout="row" />
      <div className="mt-2.5"><SaveCancel ed={ed} /></div>
    </div>
  );
}
