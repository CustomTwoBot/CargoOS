// The CargoOS thread (docs/design.md §0.4 п.4, docs/mockups/d.html, d2.html): what CargoOS did and
// asked, people's answers and decisions, in time order, and at the bottom this person's next step.
// It reads like a chat but isn't one: the box at the bottom only opens when CargoOS waits on this
// person. "Line N" and quotes ask the canvas to show that line or document.
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { cx } from "@/components/case/cx";
import type { Focus, ThreadProps } from "@/components/case/panes";
import { TONE_TEXT } from "@/components/case/words";
import { dockOf, threadOf, type Dock, type Para, type ThreadItem } from "./thread";

const PRIMARY = "rounded-md bg-primary px-3.5 py-[7px] text-[13.5px] font-semibold text-primary-ink aria-disabled:cursor-not-allowed aria-disabled:opacity-50";
const SECONDARY = "rounded-md border border-line-strong bg-surface px-3.5 py-[7px] text-[13.5px] font-semibold text-ink hover:bg-sunken";
const WHO = "mb-[3px] text-xs font-semibold text-ink-3";

// Layout effects only run in the browser; on the server this is a plain effect that never fires.
const useBrowserLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export function CaseThread({ demo, x, local, actions, viewer, now, forwarder, onFocus }: ThreadProps) {
  // The question this screen just answered, until the answer and its recheck come back (live case).
  const [sent, setSent] = useState<string>();
  const items = threadOf(x, viewer, now, forwarder);
  const dock = dockOf(demo, x, local, viewer, forwarder, sent);
  const reply = (questionId: string, text: string) => { setSent(questionId); actions.reply(questionId, text); };
  const list = useRef<HTMLOListElement>(null);
  const last = items.at(-1)?.id;
  // Whether the list was scrolled to its end: then it stays there when the list gets shorter.
  const pinned = useRef(true);

  // Keep the newest item in view, as a chat does.
  useBrowserLayoutEffect(() => {
    const el = list.current;
    if (el) { el.scrollTop = el.scrollHeight; pinned.current = true; }
  }, [last, items.length, dock.kind]);

  // The list also gets shorter without a new item: a smaller window, or a taller dock (the reject
  // reason, a wrapped line). If it was at its end, keep it there; if the person scrolled up, leave it.
  useEffect(() => {
    const el = list.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => { if (pinned.current) el.scrollTop = el.scrollHeight; });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const onScroll = () => {
    const el = list.current;
    if (el) pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
  };

  return (
    // Fills the workspace's thread column (420px from 1280, 360px from 1024, the whole pane below); the
    // workspace owns the widths, the thread draws its left edge only beside the invoice.
    <aside aria-label="CargoOS" className="flex min-h-0 w-full min-w-0 flex-1 flex-col bg-surface lg:border-l lg:border-line">
      <header className="flex-none border-b border-line px-[18px] pb-3 pt-3.5">
        <p className="flex items-center gap-2 text-[14.5px] font-[650]">
          <span aria-hidden="true" className="size-[18px] rounded-[5px] bg-ink" />CargoOS
        </p>
        <p className="mt-0.5 text-balance text-meta text-ink-3">Checks every line. Asks when it can’t tell. Never pays or sends.</p>
      </header>
      <ol ref={list} aria-label="What CargoOS did" aria-live="polite" onScroll={onScroll}
        className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-auto px-[18px] py-4">
        {items.map((it) => <Item key={it.id} it={it} onFocus={onFocus} />)}
      </ol>
      <DockView key={dockKey(dock)} dock={dock} actions={actions} onReply={reply} onFocus={onFocus} />
    </aside>
  );
}

/** A new step resets the dock's own state (typed answer, reject reason). */
const dockKey = (d: Dock) => `${d.kind}:${"questionId" in d ? d.questionId : "draftId" in d ? d.draftId : ""}`;

type OnFocus = (f: Focus) => void;

/** A sentence: words, "Line N" links, coloured result words, cited quotes. */
function Sentence({ para, onFocus }: { para: Para; onFocus: OnFocus }) {
  return para.map((s, i) => {
    if (s.t === "line") {
      return <button key={i} type="button" onClick={() => onFocus({ kind: "line", key: s.key })}
        className="font-medium text-link underline decoration-dotted underline-offset-[3px] hover:decoration-solid">{s.text}</button>;
    }
    if (s.t === "word") return <b key={i} className={cx("font-semibold", TONE_TEXT[s.tone])}>{s.text}</b>;
    if (s.t === "quote") {
      return <button key={i} type="button" onClick={() => onFocus({ kind: "doc", docId: s.docId, quote: s.text })}
        className="text-left"><mark>{s.text}</mark></button>;
    }
    return <span key={i}>{s.text}</span>;
  });
}

function Item({ it, onFocus }: { it: ThreadItem; onFocus: OnFocus }) {
  switch (it.kind) {
    case "system":
      return <li className="self-center text-center text-xs text-ink-3">{it.text}</li>;
    case "agent":
      return (
        <li className="text-[14px] leading-[21px]">
          <p className={WHO}>CargoOS</p>
          {it.paras.map((p, i) => <p key={i} className={cx(i > 0 && "mt-1.5")}><Sentence para={p} onFocus={onFocus} /></p>)}
        </li>
      );
    case "question":
      return (
        <li aria-label={it.title}
          className={cx("rounded-xl border px-3.5 py-3 text-[14px] leading-[21px]", it.open ? "border-waiting-line bg-waiting-tint" : "border-line")}>
          <p className={cx(WHO, it.open && "text-waiting")}>{it.title}</p>
          {it.earlier && (
            <p className="mb-1.5 truncate text-[13px] text-ink-2" title={it.earlier.text}>{it.earlier.whose} earlier answer: “{it.earlier.text}”</p>
          )}
          <p className={cx(!it.open && "text-ink-2")}>{it.text}</p>
          {/* The source above its quote: a quote is a link to the document, and a link can't wrap after "Sep 28:". */}
          {it.cites.map((c) => (
            <figure key={`${c.docId}:${c.quote}`} className="mt-2 text-[13px] leading-5 text-ink-2">
              <figcaption className="text-xs text-ink-3">{c.source}</figcaption>
              <button type="button" className="text-left" onClick={() => onFocus({ kind: "doc", docId: c.docId, quote: c.quote })}>
                <mark>{c.quote}</mark>
              </button>
            </figure>
          ))}
          {it.foot && <p className="mt-2 text-meta font-semibold text-waiting">{it.foot}</p>}
        </li>
      );
    case "reply":
      return (
        <li className="max-w-[85%] self-end rounded-[14px] bg-sunken px-[13px] py-[9px] text-[14px] leading-[21px]">
          {it.text}
          <p className="mt-[3px] text-right text-[11.5px] text-ink-3">{it.who}</p>
        </li>
      );
    case "decision":
      // Said like the other system lines, with the person's name in weight; a reason on its own line.
      return (
        <li className="self-center text-center text-[13px] leading-5 text-ink-2">
          <p><b className="font-semibold text-ink">{it.who}</b>{it.text}</p>
          {it.reason && <p className="mt-0.5">“{it.reason}”</p>}
        </li>
      );
  }
}

type DockProps = { dock: Dock; actions: ThreadProps["actions"]; onReply: (questionId: string, text: string) => void; onFocus: OnFocus };

/** This person's next step: the answer box, an action card, or one quiet line. */
function DockView({ dock, actions, onReply, onFocus }: DockProps) {
  if (dock.kind === "none") return null;
  return (
    <div className="flex-none border-t border-line px-3.5 pb-3.5 pt-3">
      {dock.kind === "answer" ? <Composer questionId={dock.questionId} label={dock.label} onReply={onReply} />
        : dock.kind === "request" ? (
          <Card title="Next step" text={dock.text}>
            <button type="button" className={PRIMARY} onClick={() => actions.draftDispute()}>{dock.button}</button>
            <button type="button" className={SECONDARY} onClick={() => onFocus({ kind: "invoice" })}>Review lines</button>
          </Card>
        ) : dock.kind === "decide" ? <Decide dock={dock} actions={actions} />
        : dock.kind === "message" ? (
          <Card title="Next step" text={dock.text}>
            <button type="button" className={PRIMARY} onClick={() => onFocus({ kind: "message", draftId: dock.draftId })}>Open the message</button>
          </Card>
        ) : (
          <p role="status" className={cx("rounded-[14px] bg-sunken px-3 py-2.5 text-[13.5px]", dock.kind === "blocked" ? "font-semibold text-waiting" : "text-ink-2")}>
            {dock.text}
          </p>
        )}
    </div>
  );
}

function Card({ title, text, children }: { title: string; text: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="rounded-xl border border-line px-3.5 py-3 text-[14px] leading-[21px]">
      <p className={WHO}>{title}</p>
      <p>{text}</p>
      <div className="mt-2.5 flex flex-wrap gap-2">{children}</div>
    </section>
  );
}

type ComposerProps = { questionId: string; label?: string; onReply: (questionId: string, text: string) => void };

/** The answer box: only open when CargoOS waits on this person. Enter sends; Shift+Enter starts a new line. */
function Composer({ questionId, label, onReply }: ComposerProps) {
  const [text, setText] = useState("");
  const empty = !text.trim();
  const send = () => { if (!empty) { onReply(questionId, text.trim()); setText(""); } };
  return (
    <form onSubmit={(e) => { e.preventDefault(); send(); }}>
      {label && <p className="mb-1.5 px-1 text-xs font-semibold text-ink-3">{label}</p>}
      <div className="flex items-end gap-2.5 rounded-[14px] border border-line-strong bg-surface px-3 py-2.5 shadow-card focus-within:border-ink-3">
        <textarea aria-label="Your answer" value={text} rows={2} onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder="Answer CargoOS… e.g. “approved on WhatsApp”"
          className="min-h-10 flex-1 resize-none bg-transparent text-[14px] leading-5 text-ink outline-none placeholder:text-ink-3" />
        <button type="submit" aria-label="Send answer" aria-disabled={empty || undefined}
          className="grid size-8 flex-none place-items-center rounded-full bg-primary text-[15px] font-semibold text-primary-ink aria-disabled:opacity-40">↑</button>
      </div>
      <p className="mt-1.5 text-center text-[11.5px] text-ink-3">Your answer becomes evidence. Nothing is sent.</p>
    </form>
  );
}

/** Accept, or Reject with a required reason. Inline, no modal. */
function Decide({ dock, actions }: { dock: Extract<Dock, { kind: "decide" }>; actions: ThreadProps["actions"] }) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const empty = !reason.trim();
  if (!rejecting) {
    return (
      <Card title="Approve this dispute?" text={dock.text}>
        <button type="button" className={PRIMARY} onClick={() => actions.accept(dock.draftId)}>Accept</button>
        <button type="button" className={SECONDARY} onClick={() => setRejecting(true)}>Reject</button>
      </Card>
    );
  }
  return (
    <form aria-label="Reject the dispute" onSubmit={(e) => { e.preventDefault(); if (!empty) actions.reject(dock.draftId, reason.trim()); }}>
      <label htmlFor="thread-reject" className="mb-1.5 block px-1 text-meta font-semibold">Why are you rejecting it?</label>
      <textarea id="thread-reject" aria-required="true" value={reason} rows={3} autoFocus onChange={(e) => setReason(e.target.value)}
        placeholder="For example “they really did expedite it, let's pay it this time”."
        className="w-full resize-none rounded-[14px] border border-line-strong bg-surface px-3 py-2.5 text-[14px] text-ink placeholder:text-ink-3" />
      <p className="mt-1 px-1 text-xs text-ink-3">{empty ? "A reason is required. " : ""}Nothing goes to the seller.</p>
      <div className="mt-2 flex gap-2">
        <button type="submit" aria-disabled={empty || undefined} className={PRIMARY}>Reject</button>
        <button type="button" className={SECONDARY} onClick={() => { setRejecting(false); setReason(""); }}>Cancel</button>
      </div>
    </form>
  );
}

