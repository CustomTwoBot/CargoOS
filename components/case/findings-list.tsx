// The list: column header, group bars with subtotals, two-line rows and the question card
// (docs/design.md §7.5, §7.6, §9, §0). One flat <ul>: a row changing group is a reorder in one
// parent, animated with FLIP (no animation library yet; `motion` would need a new dependency).
import { useLayoutEffect, useRef, useState } from "react";
import type { Question } from "@/lib/types";
import { cx } from "./cx";
import { Hint, HINTS, RowTagChip, StatusTag } from "./bits";
import { delta, money, timeOf, whenAt } from "./format";
import { GROUP_NAME, type GroupView, type Row } from "./view-model";

const GRID = "grid grid-cols-[22px_minmax(0,1fr)_168px_90px_84px] gap-x-3";
const lines = (n: number) => `${n} ${n === 1 ? "line" : "lines"}`;

export type ListProps = {
  groups: GroupView[];
  question?: Question; replyText?: string; waitingCents: number; answeredAt?: string; now: Date;
  moveMs: number; movingKey?: string;
  selectedKey?: string; onSelect: (key: string) => void;
  canVerdict: boolean; onConfirm: (key: string) => void; onDismiss: (key: string) => void;
  canReply: boolean; replyNote?: string; onReply: (questionId: string, text: string) => void;
};

export function FindingsList(p: ListProps) {
  const [showCleared, setShowCleared] = useState(false);
  const listRef = useRef<HTMLUListElement>(null);
  useRowMoves(listRef, p.moveMs, p.movingKey);
  return (
    <div className="min-h-0 overflow-auto rounded-xl border border-line bg-surface shadow-card">
      <ul aria-label="Invoice lines" ref={listRef}>
        <li aria-hidden="true" className={cx(GRID, "px-4 pb-[7px] pt-[9px] text-[11.5px] font-medium text-ink-3")}>
          <span /><span>Line</span><span>Status and reason</span><span className="text-right">Billed</span><span className="text-right">Over by</span>
        </li>
        {p.groups.map((g) => {
          const pinned = g.group === "cleared" ? g.rows.filter((r) => r.tag) : g.rows;
          const rest = g.rows.length - pinned.length;
          const visible = g.group === "cleared" && !showCleared ? pinned : g.rows;
          return [
            <GroupBar key={`h-${g.group}`} g={g}
              toggle={g.group === "cleared" && g.rows.length > 0
                ? { label: showCleared ? "Hide" : pinned.length ? `Show ${rest} more` : `Show ${g.rows.length}`, onClick: () => setShowCleared((v) => !v) }
                : undefined} />,
            g.group === "waiting" && p.question && (
              <QuestionCard key="q" q={p.question} replyText={p.replyText} waitingCents={p.waitingCents} answeredAt={p.answeredAt} now={p.now}
                empty={g.rows.length === 0} canReply={p.canReply} replyNote={p.replyNote} onReply={p.onReply} />
            ),
            ...visible.map((r) => (
              <RowItem key={r.key} r={r} selected={p.selectedKey === r.key} moving={p.movingKey === r.key} onSelect={p.onSelect}
                canVerdict={p.canVerdict} onConfirm={p.onConfirm} onDismiss={p.onDismiss} />
            )),
          ];
        })}
      </ul>
    </div>
  );
}

/** FLIP: rows whose position changed slide from where they were (docs/design.md §9). */
function useRowMoves(ref: React.RefObject<HTMLUListElement | null>, ms: number, movingKey?: string) {
  const tops = useRef(new Map<string, number>());
  useLayoutEffect(() => {
    const ul = ref.current;
    if (!ul) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const next = new Map<string, number>();
    ul.querySelectorAll<HTMLElement>("[data-key]").forEach((li) => {
      const key = li.dataset.key!, top = li.offsetTop, was = tops.current.get(key);
      next.set(key, top);
      if (was !== undefined && was !== top && !reduce && li.animate) {
        li.animate([{ transform: `translateY(${was - top}px)` }, { transform: "none" }], { duration: ms, easing: "cubic-bezier(0.2, 0, 0, 1)" });
      }
      if (key === movingKey) li.scrollIntoView?.({ block: "nearest", behavior: reduce ? "auto" : "smooth" });
    });
    tops.current = next;
  });
}

function GroupBar({ g, toggle }: { g: GroupView; toggle?: { label: string; onClick: () => void } }) {
  const n = g.rows.length;
  const over = g.group === "dispute" && n ? <span className="text-dispute">{delta(g.overCents)}</span>
    : g.group === "waiting" && n ? <span className="text-meta font-medium text-waiting">unconfirmed</span>
    : <span className="text-ink-3">—</span>;
  return (
    <li data-testid={`group-${g.group}`} data-key={`h-${g.group}`} className="flex min-h-10 items-center gap-2.5 border-t border-line bg-sunken px-4 py-1.5">
      <StatusTag group={g.group} label={GROUP_NAME[g.group]} />
      <Hint label={GROUP_NAME[g.group]} text={HINTS[g.group]} />
      <span className="text-meta font-medium text-ink-3">{lines(n)}</span>
      {toggle && (
        <button type="button" onClick={toggle.onClick} aria-expanded={toggle.label === "Hide"}
          className="text-meta font-medium text-link underline underline-offset-[3px]">{toggle.label}</button>
      )}
      <span className="ml-auto flex gap-3.5 text-[13.5px] font-semibold">
        <span>{n ? money(g.billedCents) : "—"}</span>
        <span className="min-w-[76px] text-right">{over}</span>
      </span>
    </li>
  );
}

type RowProps = {
  r: Row; selected: boolean; moving: boolean; onSelect: (key: string) => void;
  canVerdict: boolean; onConfirm: (key: string) => void; onDismiss: (key: string) => void;
};

function RowItem({ r, selected, moving, onSelect, canVerdict, onConfirm, onDismiss }: RowProps) {
  const showButtons = canVerdict && r.group !== "cleared";
  const canAgree = r.group === "dispute" && r.finding.userVerdict !== "confirmed";
  return (
    <li data-testid={`row-${r.lineNo}`} data-key={r.key} tabIndex={0} aria-current={selected || undefined}
      onClick={() => onSelect(r.key)} onKeyDown={(e) => { if (e.key === "Enter") onSelect(r.key); }}
      className={cx(GRID, "relative cursor-pointer items-start border-t border-line bg-surface px-4 py-2.5",
        selected && "bg-sunken after:absolute after:inset-y-0 after:left-0 after:w-0.5 after:bg-primary",
        moving && "z-[3] shadow-[inset_0_0_0_2px_var(--ink)]")}>
      <span className="pt-0.5 text-right text-xs text-ink-3">{r.lineNo}</span>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2 text-row font-semibold">
          {r.description}{r.tag && <RowTagChip>{r.tag}</RowTagChip>}
        </div>
        <p className="mt-0.5 text-why text-ink-2">{r.why}</p>
        {showButtons && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {canAgree && (
              <RowButton title="Agree with this finding. The line stays in the dispute draft." hint="keep in dispute"
                onClick={() => onConfirm(r.key)}>Agree</RowButton>
            )}
            <RowButton title="Moves the line to Cleared. Saved to case history." hint="accept charge"
              onClick={() => onDismiss(r.key)}>Not an issue</RowButton>
          </div>
        )}
      </div>
      <div>
        <StatusTag group={r.group} />
        <div className="mt-[5px] text-xs leading-[17px] text-ink-2">
          {r.reason.plain}<span className="ml-1 text-ink-3">{r.reason.code}</span>
        </div>
      </div>
      <span className="text-right text-body font-semibold leading-[21px]">{money(r.billedCents)}</span>
      <span className="text-right text-[13px] leading-[21px]">
        {r.group === "dispute" ? <span className="font-semibold text-dispute">{delta(r.deltaCents)}</span>
          : r.group === "waiting" ? <span className="text-meta font-medium text-waiting">unconfirmed</span>
          : <span className="text-ink-3">—</span>}
      </span>
    </li>
  );
}

function RowButton({ children, hint, title, onClick }: { children: string; hint: string; title: string; onClick: () => void }) {
  return (
    <button type="button" title={title} onClick={(e) => { e.stopPropagation(); onClick(); }}
      className="rounded-[7px] border border-line-strong bg-surface px-[9px] py-0.5 text-xs font-semibold text-ink hover:border-ink-3">
      {children}<small className="ml-[5px] text-[11.5px] font-normal text-ink-3">{hint}</small>
    </button>
  );
}

type QuestionProps = {
  q: Question; replyText?: string; waitingCents: number; answeredAt?: string; now: Date; empty: boolean;
  canReply: boolean; replyNote?: string; onReply: (questionId: string, text: string) => void;
};

function QuestionCard({ q, replyText, waitingCents, answeredAt, now, empty, canReply, replyNote, onReply }: QuestionProps) {
  const [text, setText] = useState("");
  if (q.status !== "open") {
    if (empty) return (
      <li data-key="q-done" className="border-t border-line py-2.5 pl-[50px] pr-4 text-[13px] text-ink-2">
        Nothing waiting on answers.{answeredAt && ` You answered at ${timeOf(answeredAt)}.`}
      </li>
    );
    return (
      <li data-key="q" className="mb-2.5 ml-[50px] mr-4 mt-2 rounded-lg border border-dashed border-waiting-line bg-waiting-row px-3 py-2.5 text-[13.5px] leading-5">
        <div className="mb-[3px] flex justify-between text-meta font-semibold text-waiting">
          <span>CargoOS asked you</span><span>{q.status === "answered" ? "Answered" : "Closed"}</span>
        </div>
        <p>{q.text}</p>
        {replyText && <p className="mt-1.5">You: <mark>“{replyText}”</mark></p>}
      </li>
    );
  }
  const id = `answer-${q._id}`;
  return (
    <li data-key="q" className="mb-2.5 ml-[50px] mr-4 mt-2 rounded-lg border border-dashed border-waiting-line bg-waiting-row px-3 py-2.5 text-[13.5px] leading-5">
      <div className="mb-[3px] flex justify-between text-meta font-semibold text-waiting">
        <span>CargoOS asked you</span><span>Waiting for your answer</span>
      </div>
      <p>{q.text}</p>
      {canReply && (
        <form className="mt-2.5" onSubmit={(e) => { e.preventDefault(); if (text.trim()) onReply(q._id, text.trim()); }}>
          <label htmlFor={id} className="mb-1 block text-meta font-semibold text-ink">Your answer</label>
          <textarea id={id} value={text} onChange={(e) => setText(e.target.value)} rows={2}
            placeholder="Answer in your own words, for example “approved on WhatsApp” or “nobody agreed to this”."
            className="w-full resize-y rounded-md border border-line-strong bg-surface px-2.5 py-2 text-body text-ink placeholder:text-ink-3" />
          <div className="mt-1.5 flex items-center justify-between gap-3">
            <span className="text-xs text-ink-3">Your answer is added to the case as evidence, and these lines are rechecked. Nothing is paid or sent.</span>
            <button type="submit" aria-disabled={!text.trim() || undefined}
              className="flex-none rounded-md bg-primary px-3.5 py-1.5 text-[13px] font-semibold text-primary-ink aria-disabled:opacity-50">Reply</button>
          </div>
          {replyNote && <p className="mt-1 text-xs text-ink-3">{replyNote}</p>}
        </form>
      )}
      <p className="mt-1.5 text-xs text-ink-3">Asked {whenAt(q.createdAt, now)}. {money(waitingCents)} is waiting on this answer.</p>
    </li>
  );
}
