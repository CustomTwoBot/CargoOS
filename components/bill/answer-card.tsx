// The answer moment (round 3, M3). CargoOS asks; the owner answers in his own words; before the
// bill is rechecked CargoOS shows how it read the answer, line by line, quoting the words it used.
// Replay reads the recorded answer, so the reading can be shown before the recheck. Live, the
// backend reads and applies the answer in one step: the reading shows right after the recheck in
// ReadingCard, with a way to add a correction.
// TODO(Pranav): a "proposed reading" step in interpretReply would let live answers be confirmed first.
import { useEffect, useRef, useState } from "react";
import type { Question } from "@/lib/types";
import { money } from "@/components/case/format";
import { highlight } from "@/components/case/evidence";
import { groupTotals } from "@/components/case/totals";
import type { Bill } from "@/components/app/bills-provider";
import { Button, Card, Kicker } from "@/components/app/ui";
import { CircleHelp, SendHorizontal } from "@/components/app/icons";
import { RISE } from "@/components/app/motion";
import { cx } from "@/components/case/cx";
import { readingOf, type Reading } from "./models";

type Phase = "ask" | "reading" | "confirm";

const VERDICT: Record<Reading["verdict"], { label: string; tone: string; then: string }> = {
  agreed: { label: "Agreed", tone: "text-pay", then: "moves to Pay" },
  not_agreed: { label: "Not agreed", tone: "text-hold", then: "moves to Hold" },
  unsure: { label: "Not sure yet", tone: "text-ask", then: "stays in Ask" },
};

export function AnswerCard({ bill, question }: { bill: Bill; question: Question }) {
  const [phase, setPhase] = useState<Phase>("ask");
  const [text, setText] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const recorded = bill.demo.answers[question._id];
  const replay = !bill.live;
  const lines = question.findingKeys.length;
  const asked = bill.x.findings.filter((f) => f.revision === bill.x.case.revision && question.findingKeys.includes(f.key));
  const total = money(groupTotals(asked).billedCents);
  const shown = text.trim() || recorded?.text || "";

  // In replay the answer's first beat holds the facts CargoOS read from it.
  const readings = replay && recorded ? readingOf(bill.demo.at(recorded.beats[0]?.stage ?? bill.demo.end), question) : [];

  const answer = () => {
    if (replay) {
      if (!recorded) return;
      setPhase("reading");
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setPhase("confirm"), 1100);
      return;
    }
    if (!text.trim()) return;
    bill.actions.reply(question._id, text.trim());
  };

  return (
    <Card focus className="flex flex-col gap-3.5 px-5 py-[22px] sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="inline-flex items-center gap-1.5">
          <CircleHelp aria-hidden="true" strokeWidth={2.2} className="size-3.5 shrink-0 text-ask" />
          <Kicker tone="ask">CargoOS asks you · {lines === 1 ? "1 line" : `${lines} lines`} · {total}</Kicker>
        </span>
        {question.followupOf && <Kicker>Follow-up · asked once, then it waits</Kicker>}
      </div>
      <p className="text-[19px] font-bold leading-7 sm:text-[20px]">{question.text}</p>
      {question.citations.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {question.citations.map((c, i) => {
            const doc = bill.x.documents.find((d) => d._id === c.docId);
            return (
              <li key={i} className="text-[13.5px] text-ink-2">
                <span className="font-semibold text-ink">{doc?.title ?? "Document"}</span> · “<mark>{c.quote}</mark>”
              </li>
            );
          })}
        </ul>
      )}

      {phase === "ask" && (
        <div key="ask" className={cx(RISE, "flex flex-col gap-3.5")}>
          <div className="flex flex-wrap gap-2">
            <label htmlFor={`answer-${question._id}`} className="sr-only">Your answer</label>
            <input id={`answer-${question._id}`} value={text} onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") answer(); }}
              placeholder={recorded ? recorded.text : "In your own words, e.g. “approved the congestion fee on WhatsApp”"}
              className="h-12 min-w-0 flex-[1_1_320px] rounded-[12px] border border-line-strong bg-sunken px-3.5 text-[14.5px] text-ink transition-colors placeholder:text-ink-4 focus:border-ink focus:bg-surface" />
            <Button onClick={answer} className="h-12" aria-disabled={!replay && !text.trim() ? true : undefined}>
              Answer<SendHorizontal aria-hidden="true" strokeWidth={2} className="size-4" />
            </Button>
          </div>
          <span className="text-[12.5px] text-ink-3">
            {replay ? "Replay: CargoOS reads the recorded answer shown in the box. " : ""}Your answer becomes evidence. CargoOS rechecks the lines; nothing is sent.
          </span>
        </div>
      )}

      {phase !== "ask" && <Bubble text={shown} />}

      {phase === "reading" && (
        <div key="reading" className="flex flex-col gap-2.5" aria-live="polite">
          <span className="inline-flex items-center gap-2.5 font-semibold"><Spinner />Reading your answer…</span>
        </div>
      )}

      {phase === "confirm" && (
        <div key="confirm" className="flex flex-col gap-3" aria-live="polite">
          {text.trim() && recorded && text.trim() !== recorded.text && (
            <span className="text-[12.5px] text-ink-3">Replay: CargoOS read the recorded answer “{recorded.text}”.</span>
          )}
          <Kicker tone="ink" className={RISE}>Is this what you meant?</Kicker>
          <ul className="flex flex-col gap-2">
            {readings.map((r, i) => <ReadingRow key={r.key} r={r} index={i + 1} answer={recorded?.text ?? ""} />)}
          </ul>
          <div className={cx(RISE, "flex flex-wrap items-center gap-2.5")} style={stagger(readings.length + 1)}>
            <Button onClick={() => bill.actions.reply(question._id, shown)}>Yes, recheck the bill</Button>
            <Button variant="secondary" onClick={() => setPhase("ask")}>No, let me rephrase</Button>
            <span className="text-[12.5px] text-ink-3">CargoOS reads your words. The rules move the money.</span>
          </div>
        </div>
      )}
    </Card>
  );
}

/** Rows arrive one after another; with reduced motion the animation is off, so they are just there. */
const stagger = (i: number) => ({ animationDelay: `${i * 140}ms`, animationFillMode: "both" as const });

export function ReadingRow({ r, answer, now, index = 0 }: { r: Reading; answer: string; now?: string; index?: number }) {
  const v = VERDICT[r.verdict];
  const h = r.quote ? highlight(answer, r.quote) : null;
  return (
    <li style={stagger(index)} className={cx(RISE, "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3.5 rounded-[14px] bg-sunken px-3.5 py-3")}>
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="font-bold">Line {r.lineNo} · {r.description} · {money(r.billedCents)}</span>
        <span className="text-[13px] text-ink-2">
          {r.quote ? <>From your words: “{h ? <>{h.before}<mark>{h.match}</mark>{h.after}</> : <mark>{r.quote}</mark>}”</> : "Your answer doesn't say. CargoOS can ask once more."}
        </span>
      </div>
      <div className="flex flex-col items-end text-right">
        <span className={`font-bold ${v.tone}`}>{v.label}{r.verdict === "agreed" && r.amountCents !== undefined ? ` ${money(r.amountCents)}` : ""}</span>
        <span className="text-[12.5px] text-ink-3">{now ?? v.then}</span>
      </div>
    </li>
  );
}

function Bubble({ text }: { text: string }) {
  return (
    <div className={cx(RISE, "flex justify-end")}>
      <span className="max-w-[85%] rounded-[16px_16px_4px_16px] bg-brand px-3.5 py-2.5 text-brand-ink">{text}</span>
    </div>
  );
}

export function Spinner() {
  return <span aria-hidden="true" className="inline-block size-4 animate-spin rounded-full border-2 border-line-strong border-t-brand motion-reduce:animate-none" />;
}
