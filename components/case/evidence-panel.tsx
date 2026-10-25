// Evidence pieces: the chain for one line, the agreement timeline, and the full document with
// the quote highlighted (docs/design.md §7.7). Used inside the issue tabs.
import type { SourceSpan } from "@/lib/types";
import { cx } from "./cx";
import { chainOf, highlight, timelineOf, type ChainStep } from "./evidence";
import { ChainGlyph, StatusGlyph } from "./glyphs";
import type { CaseInput, Row } from "./view-model";

type OnQuote = (s: SourceSpan) => void;

/** A quote that opens its document. Marked in the chain; plain in the timeline and for invoice lines. */
function Quote({ span, onQuote, plain, label }: { span: SourceSpan; onQuote: OnQuote; plain?: boolean; label?: string }) {
  const text = label ?? span.quote.replace(/\s+/g, " ");
  return (
    <button type="button" onClick={() => onQuote(span)} title="Open the document with this quote highlighted"
      className={cx("mt-[3px] block text-left text-[14px] leading-[22px] hover:underline hover:decoration-ink-3 hover:underline-offset-4",
        plain && "text-ink-2")}>
      {plain ? text : <mark>{text}</mark>}
    </button>
  );
}

const RESULT_TONE = { dispute: "text-dispute", waiting: "text-waiting", cleared: "text-cleared" } as const;

const STEP = "relative grid grid-cols-[28px_minmax(0,1fr)] gap-3 pb-4";
const LINE = "before:absolute before:bottom-1 before:left-[13.5px] before:top-8 before:w-px before:bg-line-strong";

export function Chain({ x, row, onQuote }: { x: CaseInput; row: Row; onQuote: OnQuote }) {
  const chain = chainOf(x, row);
  const steps: (ChainStep | "result")[] = [...chain.steps, "result"];
  return (
    <ol>
      {steps.map((s, i) => {
        const isResult = s === "result";
        return (
          <li key={i} className={cx(STEP, i < steps.length - 1 && LINE)}>
            {isResult ? (
              // The same status glyph as the tab and the Overview row, outlined, the size of a step (§0.3 п.5).
              <span data-testid="chain-result-glyph" className={cx("grid size-7 place-items-center rounded-full bg-surface", RESULT_TONE[chain.result.tone],
                chain.result.tone === "cleared" && "border border-cleared")}>
                {chain.result.tone === "cleared" ? <StatusGlyph group="cleared" size={16} /> : <StatusGlyph group={chain.result.tone} size={28} />}
              </span>
            ) : (
              <span className="grid size-7 place-items-center rounded-full border border-line-strong bg-surface text-ink-2">
                <ChainGlyph icon={s.icon} />
              </span>
            )}
            {isResult ? (
              <div>
                <div className="text-[14px] font-[650] leading-5">Result</div>
                <div className="mt-[3px] text-[15px] leading-[22px]">
                  {chain.result.text}
                </div>
              </div>
            ) : (
              <div className="min-w-0">
                <div className="text-[14px] font-[650] leading-5">
                  {s.title}{s.where && <span className="ml-1.5 text-xs font-normal text-ink-3">{s.where}</span>}
                </div>
                {s.quote && s.icon === "invoice" ? <Quote span={s.quote} onQuote={onQuote} plain label={s.text} />
                  : s.quote && <Quote span={s.quote} onQuote={onQuote} />}
                {(s.text || s.struck) && !(s.quote && s.icon === "invoice") && (
                  <p className="mt-[3px] text-[14px] leading-[21px] text-ink-2">
                    {s.struck && <s className="mr-1 text-ink-3">{s.struck}</s>}{s.text}
                  </p>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

export function Timeline({ x, onQuote }: { x: CaseInput; onQuote: OnQuote }) {
  const entries = timelineOf(x);
  return (
    <ol>
      {entries.map((e, i) => (
        <li key={e.key} className={cx(STEP, i < entries.length - 1 && LINE)}>
          <span className="grid size-7 place-items-center rounded-full border border-line-strong bg-surface text-ink-2">
            <ChainGlyph icon={e.where.startsWith("Email") ? "mail" : e.where.startsWith("Chat") ? "chat" : e.where.startsWith("Invoice") ? "invoice" : e.where.startsWith("Your answer") ? "answer" : "quote"} />
          </span>
          <div className="min-w-0">
            <div className="text-[14px] font-[650] leading-5">{e.where}<span className="ml-1.5 text-xs font-normal text-ink-3">{e.title}</span></div>
            {e.quotes.map((q) => (
              <div key={q.id}>
                {q.struck ? (
                  <p className="mt-[3px] text-[14px] leading-[21px] text-ink-2"><s className="mr-1 text-ink-3">{q.span.quote.replace(/\s+/g, " ")}</s>{q.note}</p>
                ) : (
                  <>
                    <Quote span={q.span} onQuote={onQuote} plain />
                    {q.note && <p className="text-xs text-ink-3">{q.note}</p>}
                  </>
                )}
              </div>
            ))}
          </div>
        </li>
      ))}
    </ol>
  );
}

export function DocumentView({ x, span, onBack }: { x: CaseInput; span: SourceSpan; onBack: () => void }) {
  const doc = x.documents.find((d) => d._id === span.docId);
  const h = doc ? highlight(doc.text, span.quote) : null;
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-panel font-[650]">{doc?.title ?? "Document"}</h3>
        <button type="button" onClick={onBack} className="text-meta font-medium text-link underline underline-offset-[3px]">Back to evidence</button>
      </div>
      <div className="rounded-lg bg-sunken p-3">
        {!h && <p className="mb-2 text-meta text-waiting">Quote not found in this document. Nothing is highlighted.</p>}
        <p className="whitespace-pre-wrap break-words rounded-md border border-line bg-surface p-3 text-[13.5px] leading-[21px]">
          {h ? <>{h.before}<mark ref={(el) => { el?.scrollIntoView?.({ block: "center" }); }}>{h.match}</mark>{h.after}</> : doc?.text}
        </p>
      </div>
    </div>
  );
}
