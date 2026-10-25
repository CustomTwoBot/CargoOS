// Questions inbox: every question CargoOS asked you across cases (docs/design.md §7.11, §0 "you").
// Open ones oldest first; pick one to read it in full and answer next to the list. Answered ones
// sit in a quiet section below with your answer quoted.
import { useState } from "react";
import type { Role } from "@/lib/types";
import { StatusTag } from "@/components/case/bits";
import { cx } from "@/components/case/cx";
import { whenAt } from "@/components/case/format";
import { StatusGlyph } from "@/components/case/glyphs";
import { ALL_ROLES, canAct } from "@/components/case/roles";
import { ago, type QuestionItem } from "./items";
import { CARD, InboxEmpty, InboxFrame, Item, ItemList, PRIMARY, SECONDARY, SectionLabel, useNow } from "./parts";

type Props = {
  items: QuestionItem[];
  onOpen: (caseId: string, questionId: string) => void;
  onReply: (caseId: string, questionId: string, text: string) => void;
  /** Roles this screen holds; the answer box shows only with ops_lead. Default: all three. */
  roles?: readonly Role[];
  /** Fixed clock for tests; the client clock otherwise. */
  now?: Date;
};

export const QUESTIONS_EMPTY = {
  title: "No questions waiting.",
  text: "CargoOS asks only when the documents can't settle a charge.",
};

export function QuestionsInbox({ items, onOpen, onReply, roles = ALL_ROLES, now: fixed }: Props) {
  const clock = useNow();
  const now = fixed ?? clock;
  const open = items.filter((q) => q.status === "open");
  const answered = items.filter((q) => q.status === "answered");
  const [picked, setPicked] = useState<string | undefined>();
  const selected = items.find((q) => q.id === picked) ?? open[0];

  const row = (q: QuestionItem) => (
    <Item key={q.id} selected={q.id === selected?.id} onSelect={() => setPicked(q.id)}>
      {q.status === "open" ? (
        <>
          <span className="block truncate text-meta font-semibold text-ink-2">{q.caseTitle}</span>
          <span className="mt-1 line-clamp-2 text-[14px] leading-[20px]">{q.text}</span>
          <span className="mt-1.5 block text-meta text-ink-2">
            {q.lines.map((l) => (
              <span key={l.key} className="flex justify-between gap-3">
                <span className="truncate"><span className="mr-1.5 text-ink-3">{l.lineNo}</span>{l.description}</span>
                <b className="flex-none font-semibold text-ink">{l.billed}</b>
              </span>
            ))}
          </span>
          {now && <span className="mt-1.5 flex items-center gap-1 text-meta font-medium text-waiting"><StatusGlyph group="waiting" />Asked {ago(q.askedAt, now)}</span>}
        </>
      ) : (
        <>
          <span className="block truncate text-meta font-medium text-ink-3">{q.caseTitle}</span>
          <span className="mt-0.5 line-clamp-1 text-[13px] text-ink-2">{q.text}</span>
          {q.answer && <span className="mt-0.5 line-clamp-1 text-[13px] text-ink-3">“{q.answer.text}”</span>}
        </>
      )}
    </Item>
  );

  return (
    <InboxFrame
      title="Questions"
      count={open.length ? `${open.length} waiting` : "None waiting"}
      sub="Every question CargoOS asked you, across your cases. Oldest first."
      list={
        <>
          {open.length ? <ItemList label="Waiting for your answer">{open.map(row)}</ItemList> : <InboxEmpty {...QUESTIONS_EMPTY} />}
          {answered.length > 0 && (
            <>
              <SectionLabel>Answered</SectionLabel>
              <ItemList label="Answered" quiet>{answered.map(row)}</ItemList>
            </>
          )}
        </>
      }
      detail={selected && (
        <QuestionDetail key={selected.id} q={selected} now={now} canReply={canAct(roles, "reply")}
          onOpen={() => onOpen(selected.caseId, selected.questionId)}
          // Keep it selected once it moves to Answered, so you see your answer quoted.
          onReply={(text) => { setPicked(selected.id); onReply(selected.caseId, selected.questionId, text); }} />
      )}
    />
  );
}

type DetailProps = { q: QuestionItem; now: Date | null; canReply: boolean; onOpen: () => void; onReply: (text: string) => void };

function QuestionDetail({ q, now, canReply, onOpen, onReply }: DetailProps) {
  const [text, setText] = useState("");
  const isOpen = q.status === "open";
  const id = `inbox-answer-${q.id}`;
  return (
    <div className="flex min-h-0 flex-col gap-3">
      <div className="flex items-center justify-between gap-4">
        <h2 className="truncate text-panel font-[650]">{q.caseTitle}</h2>
        <button type="button" className={cx(SECONDARY, "flex-none")} onClick={onOpen}>Open case</button>
      </div>
      <div className="grid min-h-0 grid-cols-[minmax(0,1fr)_300px] items-start gap-4">
        <section aria-label="Question"
          className={cx(CARD, "px-6 py-5", isOpen && "border-dashed border-waiting-line bg-waiting-row")}>
          <div className={cx("flex justify-between text-meta font-semibold", isOpen ? "text-waiting" : "text-ink-3")}>
            <span>CargoOS asked you</span><span>{isOpen ? "Waiting for your answer" : "Answered"}</span>
          </div>
          <p className="mt-2 text-[17px] leading-[27px]">{q.text}</p>
          {isOpen && canReply && (
            <form className="mt-4" onSubmit={(e) => { e.preventDefault(); if (text.trim()) onReply(text.trim()); }}>
              <label htmlFor={id} className="mb-1.5 block text-meta font-semibold">Your answer</label>
              <textarea id={id} value={text} onChange={(e) => setText(e.target.value)} rows={3}
                placeholder="Answer in your own words, for example “approved on WhatsApp” or “nobody agreed to this”."
                className="w-full resize-y rounded-md border border-line-strong bg-surface px-3 py-2 text-body text-ink placeholder:text-ink-3" />
              <div className="mt-2 flex items-center justify-between gap-3">
                <span className="text-xs text-ink-3">Your answer is added to the case as evidence, and {linesPhrase(q)} rechecked. Nothing is paid or sent.</span>
                <button type="submit" aria-disabled={!text.trim() || undefined} className={cx(PRIMARY, "flex-none aria-disabled:opacity-50")}>Reply</button>
              </div>
            </form>
          )}
          {!isOpen && q.answer && (
            <figure className="mt-4">
              <figcaption className="mb-1.5 text-meta font-semibold">Your answer</figcaption>
              <blockquote className="rounded-lg bg-sunken px-4 py-3 text-body">“{q.answer.text}”</blockquote>
              {q.answer.at && now && <p className="mt-2 text-xs text-ink-3">Answered {whenAt(q.answer.at, now)}.</p>}
            </figure>
          )}
          {isOpen && now && (
            <p className="mt-3 text-xs text-ink-3">Asked {whenAt(q.askedAt, now)}. {q.waiting} is waiting on this answer.</p>
          )}
        </section>
        <aside aria-label="What it's about" className={cx(CARD, "px-5 py-5")}>
          <h3 className="text-meta font-medium text-ink-3">{isOpen ? "Charges nobody agreed to yet" : "Where these charges stand now"}</h3>
          <ul className="mt-2">
            {q.lines.map((l) => (
              <li key={l.key} className="border-b border-line py-2 text-[14px] last:border-0">
                <span className="flex justify-between gap-3">
                  <span className="min-w-0"><span className="mr-2 text-xs text-ink-3">{l.lineNo}</span>{l.description}</span>
                  <b className="flex-none font-semibold">{l.billed}</b>
                </span>
                {!isOpen && <span className="mt-1 block"><StatusTag group={l.group} /></span>}
              </li>
            ))}
          </ul>
          {isOpen && q.citations.length > 0 && (
            <>
              <h3 className="mt-4 text-meta font-medium text-ink-3">Closest mention</h3>
              {q.citations.map((c) => <p key={c.quote} className="mt-1 text-[14px] leading-[22px]"><mark>{c.quote}</mark></p>)}
              <p className="mt-1 text-xs text-ink-3">A warning, not an agreement to pay.</p>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}

/** "line 4 is" / "lines 4 and 6 are" / "lines 2, 4 and 6 are". */
function linesPhrase(q: QuestionItem): string {
  const n = q.lines.map((l) => l.lineNo);
  if (n.length === 0) return "the case is";
  if (n.length === 1) return `line ${n[0]} is`;
  return `lines ${n.slice(0, -1).join(", ")} and ${n.at(-1)} are`;
}
