// "Reading documents… 2 of 4" (SPEC.md §8 "Reading documents"): each document's name, a tick as it
// finishes, what it gave. A part that couldn't be read says so in the spec's words and offers
// "Paste the text instead". Fed by the flow's own reads, or by the backend's progress on the overview.
import { useState } from "react";
import { cx } from "@/components/case/cx";
import { INPUT } from "@/components/inputs/fields";
import { NEW_CASE_COPY as T, TYPE_LABEL, progressLabel, readNote, type ReadingItem } from "./model";
import { Primary } from "./parts";

const Spinner = () => (
  <i aria-hidden="true" className="inline-block size-[11px] flex-none animate-spin rounded-full border-[1.5px] border-line-strong border-t-ink" />
);

export function ReadingProgress({ items, onPasteInstead, title, notes = true }: {
  items: ReadingItem[];
  /** Shown on a failed document: read it again from pasted text. */
  onPasteInstead?: (key: string, text: string) => void;
  /** Replaces the "Reading documents… 2 of 4" heading. */
  title?: string;
  /** What each read gave ("8 charges"); off for a replay, which reads nothing itself. */
  notes?: boolean;
}) {
  const busy = items.some((i) => i.state === "reading");
  return (
    <div>
      <h2 className="flex items-center gap-2 text-panel font-[650] text-ink">
        {busy && <Spinner />}<span role="status">{title ?? progressLabel(items)}</span>
      </h2>
      <ul aria-label="Documents" className="mt-1.5">
        {items.map((i) => (
          <li key={i.key} className="border-t border-line py-2.5 first:border-t-0">
            <div className="flex items-center gap-3">
              <span className={cx("grid w-[14px] flex-none place-items-center",
                i.state === "read" ? "text-cleared" : i.state === "failed" ? "text-waiting" : "")}>
                {i.state === "reading" ? <Spinner /> : <span aria-label={i.state === "read" ? "Read" : "Not read"} className="text-[13px] font-bold leading-none">{i.state === "read" ? "✓" : "!"}</span>}
              </span>
              <p className="min-w-0 flex-1 truncate text-body">
                <span className="font-semibold text-ink">{i.title}</span>
                {i.type && <span className="ml-2 text-meta text-ink-3">{TYPE_LABEL[i.type]}</span>}
              </p>
              <span className="flex-none text-[13px] text-ink-2">
                {i.state === "reading" ? <span className="text-ink-3">{T.readingRow}</span> : notes ? readNote(i) : null}
              </span>
            </div>
            {i.state === "failed" && <FailedNote item={i} onPasteInstead={onPasteInstead} />}
          </li>
        ))}
      </ul>
    </div>
  );
}

function FailedNote({ item, onPasteInstead }: { item: ReadingItem; onPasteInstead?: (key: string, text: string) => void }) {
  const [pasting, setPasting] = useState(false);
  const [text, setText] = useState("");
  return (
    <div role="alert" className="ml-[26px] mt-2 rounded-lg bg-waiting-tint px-3 py-2.5 text-waiting">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1 text-[13px]">
          <p className="font-semibold">{T.failed}</p>
          {item.where && <p className="mt-0.5">{item.title}, {item.where}.</p>}
        </div>
        {onPasteInstead && !pasting && (
          <button type="button" onClick={() => setPasting(true)}
            className="flex-none rounded-[7px] border border-line-strong bg-surface px-2.5 py-1 text-[13px] font-semibold text-ink hover:bg-sunken">
            {T.pasteInstead}
          </button>
        )}
      </div>
      {onPasteInstead && pasting && (
        <div className="mt-2.5 grid gap-2">
          <textarea aria-label={`Text of ${item.title}`} value={text} onChange={(e) => setText(e.target.value)} rows={5} autoFocus
            placeholder="Paste the text exactly as written." className={cx(INPUT, "resize-y py-2 leading-5")} />
          <div className="flex justify-end">
            <Primary disabled={!text.trim()} onClick={() => onPasteInstead(item.key, text)}>{T.readAgain}</Primary>
          </div>
        </div>
      )}
    </div>
  );
}
