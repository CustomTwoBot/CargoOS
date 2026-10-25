// Questions inbox: every question CargoOS asked you across cases (docs/design.md §0.2 decision 5).
// The list stays light (case, charges and amount, how long it has waited); the selected question gets
// the room: the question itself, the lines it covers, what the sources said (folded), and the answer box.
// Answered ones fold into "Answered (n)" at the bottom of the list. The owner (ops_lead) answers;
// the bookkeeper reads the same questions as waiting for the owner (docs/design.md §0.3).
import { useState } from "react";
import { cx } from "@/components/case/cx";
import { whenAt } from "@/components/case/format";
import { StatusGlyph } from "@/components/case/glyphs";
import { canAct } from "@/components/case/roles";
import { ago, replayNow, type InboxLine, type QuestionItem } from "./items";
import { CARD, Chevron, DetailHead, Fold, InboxEmpty, InboxFrame, Item, ItemList, LineRows, PRIMARY, useNow, useWide } from "./parts";
import { ASKED, firstName, reasonFor, SAM, type Person } from "./people";

type Props = {
  items: QuestionItem[];
  onOpen: (caseId: string, questionId: string) => void;
  onReply: (caseId: string, questionId: string, text: string) => void;
  /** The person this screen is set to (Settings); the answer box shows only if they hold ops_lead. Default: Sam. */
  viewer?: Person;
  /** Fixed clock for tests; the client clock otherwise. */
  now?: Date;
};

export const QUESTIONS_EMPTY = {
  title: "No questions waiting.",
  text: "CargoOS asks only when the documents can't settle a charge.",
};

/** For a screen that only uploads documents. */
export const NO_QUESTIONS = {
  title: "Questions aren't on this device.",
  text: "This device uploads documents. CargoOS's questions go to the owner.",
};

const charges = (n: number) => `${n} ${n === 1 ? "charge" : "charges"}`;

export function QuestionsInbox({ items, onOpen, onReply, viewer = SAM, now: fixed }: Props) {
  const clock = useNow();
  // A replay has its own clock (recorded times); the wall clock only when the items carry none.
  const now = fixed ?? replayNow(items) ?? clock;
  const wide = useWide();
  const open = items.filter((q) => q.status === "open");
  const answered = items.filter((q) => q.status === "answered");
  const [picked, setPicked] = useState<string | undefined>();
  const [reading, setReading] = useState(false);
  const [fold, setFold] = useState<boolean | undefined>();
  const selected = items.find((q) => q.id === picked) ?? open[0];
  // Answered stays folded unless you open it, or the selected question sits in it.
  const showAnswered = fold ?? selected?.status === "answered";
  const canReply = canAct(viewer.roles, "reply");
  const askedName = firstName(ASKED);
  const asked = canReply ? "you" : askedName;

  const row = (q: QuestionItem) => {
    const when = now && (q.status === "open" ? ago(q.askedAt, now) : q.answer?.at && `answered ${ago(q.answer.at, now)}`);
    return (
      // On a narrow screen the list shows alone, so nothing is marked until you have opened one.
      <Item key={q.id} selected={(wide || !!picked) && q.id === selected?.id} onSelect={() => { setPicked(q.id); setReading(true); }}
        dot={q.status === "open" ? "Unanswered" : undefined} title={q.caseTitle}
        meta={[q.label, charges(q.lines.length), q.total, when].filter(Boolean).join(" · ")} />
    );
  };

  if (!canReply && !canAct(viewer.roles, "confirm")) {
    return <InboxFrame title="Questions" count="" sub="" reading={false} backLabel="" onBack={() => {}} list={<InboxEmpty {...NO_QUESTIONS} />} detail={null} />;
  }
  return (
    <InboxFrame
      title="Questions"
      // No count when nothing waits: the empty card says so (once).
      count={open.length ? `${open.length} waiting` : ""}
      sub={`What CargoOS asked ${asked}, across your cases. Oldest first.`}
      reading={reading} backLabel="Back to questions" onBack={() => setReading(false)}
      list={
        <>
          {open.length ? (
            <ItemList label={canReply ? "Waiting for your answer" : `Waiting for ${askedName}`}>{open.map(row)}</ItemList>
          ) : !wide && <InboxEmpty {...QUESTIONS_EMPTY} />}
          {answered.length > 0 && (
            <Fold label="Answered" count={answered.length} open={showAnswered} onToggle={() => setFold(!showAnswered)}>
              <ItemList label="Answered" quiet>{answered.map(row)}</ItemList>
            </Fold>
          )}
        </>
      }
      detail={!selected ? (wide && <InboxEmpty {...QUESTIONS_EMPTY} />) : (
        <QuestionDetail key={selected.id} q={selected} now={now} viewer={viewer} canReply={canReply} asked={asked} askedName={askedName}
          onOpen={() => onOpen(selected.caseId, selected.questionId)}
          // Keep it selected once it moves to Answered, so you see your answer quoted.
          onReply={(text) => { setPicked(selected.id); onReply(selected.caseId, selected.questionId, text); }} />
      )}
    />
  );
}

type DetailProps = {
  q: QuestionItem; now: Date | null; viewer: Person; canReply: boolean; asked: string; askedName: string;
  onOpen: () => void; onReply: (text: string) => void;
};

function QuestionDetail({ q, now, viewer, canReply, asked, askedName, onOpen, onReply }: DetailProps) {
  const [text, setText] = useState("");
  const isOpen = q.status === "open";
  const id = `inbox-answer-${q.id}`;
  const meta = [q.label, now && `Asked ${whenAt(q.askedAt, now)}`, isOpen && `${q.waiting} is waiting on this answer`].filter(Boolean).join(" · ");
  const status = !isOpen ? "Answered" : canReply ? undefined : `Waiting for ${askedName}`;
  // The same chip on every row says nothing new: say it once above the rows.
  const chips = isOpen ? q.lines.map(openChip) : [];
  const sameChip = chips.length > 1 && chips.every((c) => c === chips[0]) ? chips[0] : undefined;
  return (
    <div className="flex max-w-[780px] flex-col gap-3">
      <DetailHead title={q.caseTitle} meta={meta} onOpen={onOpen} />
      {/* A plain card: waiting shows in the label's dashed glyph, not a dashed tinted card around the form. */}
      <section aria-label="Question" className={cx(CARD, "px-5 py-5 md:px-6")}>
        <div className={cx("flex justify-between gap-3 text-meta font-semibold", isOpen ? "text-waiting" : "text-ink-3")}>
          <span className="flex items-center gap-1.5">
            <StatusGlyph group={isOpen ? "waiting" : "cleared"} />
            {q.followUpOf ? `CargoOS asked ${asked} a follow-up` : `CargoOS asked ${asked}`}
          </span>
          {status && <span>{status}</span>}
        </div>
        {q.followUpOf?.answer && (
          <p className="mt-1.5 truncate text-[13.5px] text-ink-2" title={q.followUpOf.answer}>
            {canReply ? "Your" : `${askedName}’s`} earlier answer: “{q.followUpOf.answer}”
          </p>
        )}
        <p className="mt-2 text-[18px] leading-[28px]">{q.text}</p>

        <div className="mt-4 border-t border-line pt-1">
          {sameChip && <p className="pb-1 pt-2 text-meta font-medium text-ink-3">{sameChip} for all {q.lines.length} charges</p>}
          <LineRows label={isOpen ? "Charges it covers" : "Where these charges stand now"}
            rows={q.lines.map((l) => ({ ...l, amount: l.billed, chip: sameChip ? undefined : isOpen ? openChip(l) : <StandsChip l={l} reason={reasonFor(l.reason, viewer)} /> }))} />
        </div>
        {q.mentions.length > 0 && <Mentions q={q} />}

        {isOpen && canReply && (q.replay?.blocked ? (
          <p className="mt-4 text-[13.5px] font-semibold text-waiting">{q.replay.blocked}</p>
        ) : (
          <form className="mt-4" onSubmit={(e) => { e.preventDefault(); if (text.trim()) onReply(text.trim()); }}>
            <label htmlFor={id} className="mb-1.5 block text-meta font-semibold">Your answer</label>
            <textarea id={id} value={text} onChange={(e) => setText(e.target.value)} rows={3}
              placeholder="Answer in your own words, for example “approved on WhatsApp” or “nobody agreed to this”."
              className="w-full resize-y rounded-md border border-line-strong bg-surface px-3 py-2 text-body text-ink placeholder:text-ink-3" />
            <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <span className="min-w-0 flex-1 basis-64 text-xs text-ink-3">
                Your answer becomes evidence and {linesPhrase(q)} rechecked. Nothing is paid or sent.{q.replay && ` ${q.replay.note}`}
              </span>
              <button type="submit" aria-disabled={!text.trim() || undefined} className={cx(PRIMARY, "flex-none aria-disabled:opacity-50")}>Reply</button>
            </div>
          </form>
        ))}
        {!isOpen && q.answer && (
          <figure className="mt-4">
            <figcaption className="mb-1.5 text-meta font-semibold">{canReply ? "Your answer" : `${askedName}’s answer`}</figcaption>
            <blockquote className="rounded-lg bg-sunken px-4 py-3 text-body">“{q.answer.text}”</blockquote>
            {q.answer.at && now && <p className="mt-2 text-xs text-ink-3">Answered {whenAt(q.answer.at, now)}.</p>}
          </figure>
        )}
      </section>
    </div>
  );
}

/** One chip for a line still waiting: what is missing, in two words where we can. */
const openChip = (l: InboxLine) => (l.code === "R6" ? "No agreement" : l.code === "R7" ? "Sources disagree" : l.reason);

/** Where an answered question's line stands now: its status glyph and plain reason. */
const StandsChip = ({ l, reason }: { l: InboxLine; reason: string }) => (
  <>
    <span className={cx(l.group === "dispute" ? "text-dispute" : l.group === "waiting" ? "text-waiting" : "text-cleared")}>
      <StatusGlyph group={l.group} />
    </span>
    {reason}
  </>
);

const SOURCE: Record<string, string> = { chat: "the chat", email: "the email", quote: "the quote", proforma: "the proforma", reply: "your answer" };

/** The closest mention (or each source, when they disagree), folded behind one link. */
function Mentions({ q }: { q: QuestionItem }) {
  const [shown, setShown] = useState(false);
  const label = q.conflict ? "Show what each source says" : `Show what ${SOURCE[q.mentions[0].docType ?? ""] ?? "the document"} said`;
  return (
    <div className="mt-3">
      <button type="button" aria-expanded={shown} onClick={() => setShown(!shown)}
        className="flex items-center gap-1 text-[13.5px] font-semibold text-link underline decoration-line-strong underline-offset-[3px] hover:decoration-current">
        <Chevron dir={shown ? "down" : "right"} />{shown ? label.replace("Show", "Hide") : label}
      </button>
      {shown && (
        <div className="mt-2 rounded-lg bg-sunken px-4 py-3">
          {q.mentions.map((m) => (
            <figure key={`${m.docId}:${m.quote}`} className="mb-2 last:mb-0">
              <blockquote className="text-[14px] leading-[22px]"><mark>{m.quote}</mark></blockquote>
              {m.docTitle && <figcaption className="text-xs text-ink-3">{m.docTitle}</figcaption>}
            </figure>
          ))}
          <p className="mt-2 text-xs text-ink-3">
            {q.conflict ? "They disagree, so CargoOS asks you instead of picking one." : "The closest mention, not an agreement to pay."}
          </p>
        </div>
      )}
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
