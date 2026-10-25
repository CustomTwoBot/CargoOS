// One tab per thing to decide (docs/design.md §0, layout A): a disputed line, the question to
// answer (the dispute draft's tab is ApprovalDetail from the inboxes). Each tab tells one story: evidence on the left, the decision
// on the right; below 1024px they stack, the decision first (§0.3) and the question first.
import { useState } from "react";
import type { Question, SourceSpan } from "@/lib/types";
import { RowTagChip } from "./bits";
import { cx } from "./cx";
import { Chain, DocumentView } from "./evidence-panel";
import { delta, inCurrency, whenAt } from "./format";
import { StatusGlyph } from "./glyphs";
import { GROUP_NAME, type CaseInput, type Row, type RowTag } from "./view-model";

/** Row tags in this screen's words; "Dismissed by clerk" is a spec string and stays. */
export const tagLabel = (t: RowTag): string => (t === "Finding confirmed by clerk" ? "You agreed" : t);

const CARD = "rounded-xl border border-line bg-surface shadow-card";
/** Two columns from 1024px; below that the story stacks (§0.2, §0.3). */
export const ISSUE_GRID = "grid min-h-0 flex-1 grid-cols-1 content-start items-start gap-4 lg:grid-cols-[minmax(0,1fr)_360px]";
const TONE = { dispute: "text-dispute", waiting: "text-waiting", cleared: "text-ink [&_svg]:text-cleared" } as const;
const PRIMARY = "rounded-md bg-primary px-3.5 py-[7px] text-[13.5px] font-semibold text-primary-ink";
const SECONDARY = "rounded-md border border-line-strong bg-surface px-3.5 py-[7px] text-[13.5px] font-semibold text-ink hover:bg-sunken";

/** Evidence column: the chain, or the document a quote came from. */
function Evidence({ x, row }: { x: CaseInput; row: Row }) {
  const [open, setOpen] = useState<SourceSpan | null>(null);
  return (
    <section aria-label="Evidence" className={cx(CARD, "px-6 py-5")}>
      {open ? <DocumentView x={x} span={open} onBack={() => setOpen(null)} /> : (
        <>
          <h3 className="mb-4 text-meta font-medium text-ink-3">How CargoOS checked line {row.lineNo}</h3>
          <Chain x={x} row={row} onQuote={setOpen} />
        </>
      )}
    </section>
  );
}

type LineProps = { x: CaseInput; row: Row; canVerdict: boolean; onConfirm: (key: string) => void; onDismiss: (key: string) => void };

export function LineIssueView({ x, row, canVerdict, onConfirm, onDismiss }: LineProps) {
  const confirmed = row.finding.userVerdict === "confirmed";
  return (
    <div data-testid="issue-grid" className={ISSUE_GRID}>
      <Evidence key={row.key} x={x} row={row} />
      <aside aria-label="Decision" className={cx(CARD, "order-first flex flex-col gap-3 px-5 py-5 lg:sticky lg:top-0 lg:order-none")}>
        <div className="flex items-center gap-2">
          <span data-testid="decision-status" className={cx("inline-flex items-center gap-1.5 text-meta font-semibold", TONE[row.group])}>
            <StatusGlyph group={row.group} />{GROUP_NAME[row.group]}
          </span>
          {row.tag && <RowTagChip>{tagLabel(row.tag)}</RowTagChip>}
        </div>
        <div>
          <h2 className="text-title font-[650] tracking-[-0.012em]">{row.description}</h2>
          <p className="mt-0.5 text-[13px] text-ink-2">Line {row.lineNo}{row.group !== "dispute" && ` · billed ${inCurrency(row.billedCents, row.currency)}`}</p>
        </div>
        {row.group === "dispute" && <div className="text-delta font-[650] text-dispute">{delta(row.deltaCents)}</div>}
        <p className="text-why text-ink-2">{row.why}</p>
        {canVerdict && row.group !== "cleared" && (
          <div className="flex flex-wrap gap-2 pt-1">
            {row.group === "dispute" && !confirmed && (
              <button type="button" className={PRIMARY} onClick={() => onConfirm(row.key)}
                title="Agree with this finding. The line stays in the dispute draft.">Agree</button>
            )}
            <button type="button" className={SECONDARY} onClick={() => onDismiss(row.key)}
              title="Moves the line to Cleared. Saved to case history.">Not an issue</button>
          </div>
        )}
        <p className="text-xs text-ink-3">Checked by CargoOS rules, not guessed by AI.</p>
      </aside>
    </div>
  );
}

type QuestionProps = {
  x: CaseInput; question: Question; rows: Row[]; amount: string; now: Date;
  canReply: boolean; replyNote?: string; onReply: (questionId: string, text: string) => void;
  /** Why the answer box is closed in this replay (e.g. "Answer Question 1 first."); open when absent. */
  blockedReason?: string;
  /** Who answers when this screen can't: "Sam". */
  asked?: string;
};

export function QuestionView({ x, question: q, rows, amount, now, canReply, replyNote, onReply, blockedReason, asked = "the owner" }: QuestionProps) {
  const [text, setText] = useState("");
  const [open, setOpen] = useState<SourceSpan | null>(null);
  const id = `answer-${q._id}`;
  const conflict = rows.length > 0 && rows.every((r) => r.finding.ruleId === "R7_CONFLICT");
  // A follow-up says why CargoOS asked again: the earlier answer, word for word.
  const earlier = q.followupOf ? x.replies.find((r) => r.questionId === q.followupOf) : undefined;
  const earlierText = earlier && x.documents.find((d) => d._id === earlier.docId)?.text;
  return (
    <div data-testid="issue-grid" className={ISSUE_GRID}>
      <section aria-label="Question" className={cx(CARD, "border-dashed border-waiting-line bg-waiting-row px-6 py-5")}>
        <div className="flex justify-between text-meta font-semibold text-waiting">
          <span>{q.followupOf ? "CargoOS asked a follow-up" : `CargoOS asked ${canReply ? "you" : asked}`}</span>
          <span>{canReply ? "Waiting for your answer" : `Waiting for ${asked}`}</span>
        </div>
        {earlierText && (
          <p className="mt-2 text-[13.5px] leading-5 text-ink-2">
            Your earlier answer wasn&apos;t clear enough to settle it: <mark>“{earlierText}”</mark>
          </p>
        )}
        <p className="mt-2 text-[17px] leading-[27px]">{q.text}</p>
        {canReply && blockedReason && <p className="mt-4 text-[13.5px] font-semibold text-waiting">{blockedReason}</p>}
        {canReply && !blockedReason && (
          <form className="mt-4" onSubmit={(e) => { e.preventDefault(); if (text.trim()) onReply(q._id, text.trim()); }}>
            <label htmlFor={id} className="mb-1.5 block text-meta font-semibold">Your answer</label>
            <textarea id={id} value={text} onChange={(e) => setText(e.target.value)} rows={3}
              placeholder="Answer in your own words, for example “approved on WhatsApp” or “nobody agreed to this”."
              className="w-full resize-y rounded-md border border-line-strong bg-surface px-3 py-2 text-body text-ink placeholder:text-ink-3" />
            <div className="mt-2 flex items-center justify-between gap-3">
              <span className="text-xs text-ink-3">{replyNote ?? "Your answer is added to the case as evidence. Nothing is paid or sent."}</span>
              <button type="submit" aria-disabled={!text.trim() || undefined} className={cx(PRIMARY, "flex-none aria-disabled:opacity-50")}>Reply</button>
            </div>
          </form>
        )}
        {!canReply && <p className="mt-4 text-[13.5px] text-ink-2">{asked} answers this. The lines recheck when the answer arrives.</p>}
        <p className="mt-3 text-xs text-ink-3">Asked {whenAt(q.createdAt, now)}. {amount} is waiting on this answer.</p>
      </section>
      <aside aria-label="What it's about" className={cx(CARD, "px-5 py-5")}>
        {open ? <DocumentView x={x} span={open} onBack={() => setOpen(null)} /> : (
          <>
            <h3 className="text-meta font-medium text-ink-3">{conflict ? "Charges where the sources disagree" : "Charges nobody agreed to yet"}</h3>
            <ul className="mt-2">
              {rows.map((r) => (
                <li key={r.key} className="flex justify-between border-b border-line py-2 text-[14px] last:border-0">
                  <span><span className="mr-2 text-xs text-ink-3">{r.lineNo}</span>{r.description}</span>
                  <b className="font-semibold">{inCurrency(r.billedCents, r.currency)}</b>
                </li>
              ))}
            </ul>
            {q.citations.length > 0 && (
              <>
                <h3 className="mt-4 text-meta font-medium text-ink-3">{conflict ? "What each source says" : "Closest mention"}</h3>
                {q.citations.map((c) => (
                  <button key={c.quote} type="button" onClick={() => setOpen(c)} className="mt-1 block text-left text-[14px] leading-[22px] hover:underline">
                    <mark>{c.quote}</mark>
                  </button>
                ))}
                {!conflict && <p className="mt-1 text-xs text-ink-3">A warning, not an agreement to pay.</p>}
              </>
            )}
          </>
        )}
      </aside>
    </div>
  );
}
