// Evidence tab: the chain for the selected line, the agreement timeline when none is selected,
// and the full document with the quote highlighted (docs/design.md §7.7).
import { useState } from "react";
import type { SourceSpan } from "@/lib/types";
import { cx } from "./cx";
import { chainOf, highlight, timelineOf, type ChainStep } from "./evidence";
import { ChainGlyph } from "./glyphs";
import { GROUP_NAME, type CaseInput, type Row } from "./view-model";
import { delta } from "./format";

type Props = {
  x: CaseInput; row?: Row;
  canVerdict: boolean; onConfirm: (key: string) => void; onDismiss: (key: string) => void;
};

export function EvidencePanel(p: Props) {
  const [open, setOpen] = useState<SourceSpan | null>(null);
  if (open) return <DocumentView x={p.x} span={open} onBack={() => setOpen(null)} />;
  return p.row ? <ChainView {...p} row={p.row} onQuote={setOpen} /> : <Timeline x={p.x} onQuote={setOpen} />;
}

/** A quote that opens its document. Marked in the chain; plain in the timeline and for invoice lines. */
function Quote({ span, onQuote, plain, label }: { span: SourceSpan; onQuote: (s: SourceSpan) => void; plain?: boolean; label?: string }) {
  const text = label ?? span.quote.replace(/\s+/g, " ");
  return (
    <button type="button" onClick={() => onQuote(span)} title="Open the document with this quote highlighted"
      className={cx("mt-[3px] block text-left text-[13.5px] leading-[21px] hover:underline hover:decoration-ink-3 hover:underline-offset-4",
        plain && "text-ink-2")}>
      {plain ? text : <mark>{text}</mark>}
    </button>
  );
}

function ChainView({ x, row, canVerdict, onConfirm, onDismiss, onQuote }: Props & { row: Row; onQuote: (s: SourceSpan) => void }) {
  const chain = chainOf(x, row);
  const steps: (ChainStep | "result")[] = [...chain.steps, "result"];
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-line px-4 pb-2.5 pt-3">
        <div className="text-xs font-medium text-ink-3">Line {row.lineNo}, {GROUP_NAME[row.group].toLowerCase()}</div>
        <h2 className="mt-0.5 text-panel font-[650]">{row.description}</h2>
        {row.group === "dispute" && <div className="mt-1 text-delta font-[650] text-dispute">{delta(row.deltaCents)}</div>}
      </div>
      <ol className="px-4 pt-3">
        {steps.map((s, i) => {
          const last = i === steps.length - 1;
          const isResult = s === "result";
          return (
            <li key={i} className={cx("relative grid grid-cols-[28px_minmax(0,1fr)] gap-3 pb-2.5",
              !last && "before:absolute before:bottom-0.5 before:left-[13.5px] before:top-7 before:w-px before:bg-line-strong")}>
              <span className={cx("grid size-7 place-items-center rounded-full border text-ink-2",
                isResult && chain.result.tone === "dispute" ? "border-dispute bg-dispute text-dispute-ink"
                  : isResult && chain.result.tone === "cleared" ? "border-cleared bg-cleared text-cleared-ink"
                  : isResult ? "border-waiting-line bg-waiting-tint text-waiting" : "border-line-strong bg-surface")}>
                <ChainGlyph icon={isResult ? "result" : s.icon} />
              </span>
              {isResult ? (
                <div>
                  <div className="text-[13.5px] font-[650] leading-[19px]">Result</div>
                  <div className="mt-[3px] text-[15px] leading-5">
                    {chain.result.text}{chain.result.amount && <b className="ml-1.5 text-[17px] font-[650] text-dispute">{chain.result.amount}</b>}
                  </div>
                  <div className="mt-[3px] text-xs text-ink-3">Checked by CargoOS rules, not guessed by AI.</div>
                </div>
              ) : (
                <div className="min-w-0">
                  <div className="text-[13.5px] font-[650] leading-[19px]">
                    {s.title}{s.where && <span className="ml-1 text-xs font-normal text-ink-3">{s.where}</span>}
                  </div>
                  {s.quote && s.icon === "invoice" ? <Quote span={s.quote} onQuote={onQuote} plain label={s.text} />
                    : s.quote && <Quote span={s.quote} onQuote={onQuote} />}
                  {(s.text || s.struck) && !(s.quote && s.icon === "invoice") && (
                    <p className="mt-[3px] text-[13.5px] leading-5 text-ink-2">
                      {s.struck && <s className="mr-1 text-ink-3">{s.struck}</s>}{s.text}
                    </p>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>
      {canVerdict && row.group !== "cleared" && (
        <div className="mt-auto flex flex-wrap gap-2 border-t border-line px-4 py-2.5">
          {row.group === "dispute" && row.finding.userVerdict !== "confirmed" && (
            <button type="button" onClick={() => onConfirm(row.key)}
              className="rounded-md bg-primary px-3.5 py-1.5 text-[13.5px] font-semibold text-primary-ink">
              Agree<small className="ml-[5px] text-[11.5px] font-normal opacity-70">keep in dispute</small>
            </button>
          )}
          <button type="button" onClick={() => onDismiss(row.key)}
            className="rounded-md border border-line-strong bg-surface px-3 py-1.5 text-[13px] font-semibold">
            Not an issue<small className="ml-[5px] text-[11.5px] font-normal text-ink-3">accept charge</small>
          </button>
        </div>
      )}
    </div>
  );
}

function Timeline({ x, onQuote }: { x: CaseInput; onQuote: (s: SourceSpan) => void }) {
  const entries = timelineOf(x);
  return (
    <div className="px-4 pt-3">
      <h2 className="text-panel font-[650]">What was agreed</h2>
      <p className="mt-1 text-why text-ink-2">Every document in the case, oldest first. Select a line to see how it was checked.</p>
      <ol className="mt-3">
        {entries.map((e, i) => (
          <li key={e.key} className={cx("relative grid grid-cols-[28px_minmax(0,1fr)] gap-3 pb-3",
            i < entries.length - 1 && "before:absolute before:bottom-0.5 before:left-[13.5px] before:top-7 before:w-px before:bg-line-strong")}>
            <span className="grid size-7 place-items-center rounded-full border border-line-strong bg-surface text-ink-2">
              <ChainGlyph icon={e.where.startsWith("Email") ? "mail" : e.where.startsWith("Chat") ? "chat" : e.where.startsWith("Invoice") ? "invoice" : e.where.startsWith("Your answer") ? "answer" : "quote"} />
            </span>
            <div className="min-w-0">
              <div className="text-[13.5px] font-[650] leading-[19px]">{e.where}<span className="ml-1 text-xs font-normal text-ink-3">{e.title}</span></div>
              {e.quotes.map((q) => (
                <div key={q.span.quote}>
                  {q.struck ? (
                    <p className="mt-[3px] text-[13.5px] leading-5 text-ink-2"><s className="mr-1 text-ink-3">{q.span.quote.replace(/\s+/g, " ")}</s>{q.note}</p>
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
    </div>
  );
}

function DocumentView({ x, span, onBack }: { x: CaseInput; span: SourceSpan; onBack: () => void }) {
  const doc = x.documents.find((d) => d._id === span.docId);
  const h = doc ? highlight(doc.text, span.quote) : null;
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-line px-4 pb-2.5 pt-3">
        <h2 className="text-panel font-[650]">{doc?.title ?? "Document"}</h2>
        <button type="button" onClick={onBack} className="text-meta font-medium text-link underline underline-offset-[3px]">Back to evidence</button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto bg-sunken p-3">
        {!h && <p className="mb-2 text-meta text-waiting">Quote not found in this document. Nothing is highlighted.</p>}
        <p className="whitespace-pre-wrap break-words rounded-lg border border-line bg-surface p-3 text-[13px] leading-5">
          {h ? <>{h.before}<mark ref={(el) => { el?.scrollIntoView?.({ block: "center" }); }}>{h.match}</mark>{h.after}</> : doc?.text}
        </p>
      </div>
    </div>
  );
}
