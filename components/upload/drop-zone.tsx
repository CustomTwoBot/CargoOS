"use client";
// The drop zone on /bills/new and its paste box. Dragging files over it turns the border brand and says
// "Drop to add"; enter/leave are counted so moving over the buttons inside doesn't flicker the state.
import { useId, useRef, useState, type DragEvent } from "react";
import { CirclePlay, ClipboardPaste, FileUp, Upload } from "@/components/app/icons";
import { Button, Card } from "@/components/app/ui";
import { RISE } from "@/components/app/motion";
import { cx } from "@/components/case/cx";
import { ACCEPT_FILES, PASTE_TYPES, pasteTypeOf, type UploadDocType } from "./kinds";

export const DROP_COPY = {
  drop: "Drop files here",
  dropMore: "Drop more files here",
  over: "Drop to add",
  dropBody: "The invoice, the quote, emails about the price and the WhatsApp chat. PDF, .eml, .txt or a photo. CargoOS works out which is which.",
  choose: "Choose files",
  paste: "Paste text",
  example: "Use the example (Scenario A)",
} as const;

/** True while files are dragged over the element, counting nested enter/leave pairs. */
export function useDragOver(onFiles: (files: File[]) => void) {
  const depth = useRef(0);
  const [over, setOver] = useState(false);
  const hasFiles = (e: DragEvent) => !e.dataTransfer?.types || Array.from(e.dataTransfer.types).includes("Files");
  return {
    over,
    handlers: {
      onDragEnter: (e: DragEvent) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        depth.current += 1;
        setOver(true);
      },
      onDragOver: (e: DragEvent) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
      },
      onDragLeave: () => {
        depth.current = Math.max(0, depth.current - 1);
        if (depth.current === 0) setOver(false);
      },
      onDrop: (e: DragEvent) => {
        e.preventDefault();
        depth.current = 0;
        setOver(false);
        const files = Array.from(e.dataTransfer?.files ?? []);
        if (files.length) onFiles(files);
      },
    },
  };
}

export function DropZone({ compact, onFiles, onPaste, example }: {
  compact: boolean;
  onFiles: (files: File[]) => void;
  onPaste: (text: string, docType: UploadDocType) => void;
  example?: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [pasting, setPasting] = useState(false);
  const { over, handlers } = useDragOver(onFiles);
  const lift = cx("transition-transform duration-300 ease-move motion-reduce:transition-none", over && "-translate-y-1.5 scale-105");
  return (
    <>
      <div {...handlers} data-testid="drop-zone" data-over={over || undefined}
        className={cx(
          "flex flex-col items-center gap-4 rounded-[22px] border-2 border-dashed text-center transition-colors duration-200",
          over ? "border-brand bg-pay-tint" : "border-line-strong bg-surface",
          compact ? "px-6 py-6" : "px-6 py-11 sm:px-8",
        )}>
        {compact ? (
          <span className="inline-flex items-center gap-2.5 text-title font-bold text-ink">
            <FileUp aria-hidden="true" strokeWidth={1.8} className={cx("size-5 text-brand", lift)} />
            <span aria-live="polite">{over ? DROP_COPY.over : DROP_COPY.dropMore}</span>
          </span>
        ) : (
          <>
            <svg width="48" height="48" viewBox="0 0 48 48" aria-hidden="true" className={lift}>
              <rect x="10" y="6" width="24" height="32" rx="4" fill="none" strokeWidth="2.4" className="stroke-brand" />
              <path d="M16 15h12M16 21h12M16 27h7" strokeWidth="2.4" strokeLinecap="round" className="stroke-brand" />
              <circle cx="34" cy="34" r="9" className="fill-lime" />
              <path d="M34 30v8M30 34h8" strokeWidth="2.4" strokeLinecap="round" className="stroke-[var(--lime-ink)]" />
            </svg>
            <span aria-live="polite" className="text-title font-bold text-ink">{over ? DROP_COPY.over : DROP_COPY.drop}</span>
            <span className="max-w-[520px] text-ink-2">{DROP_COPY.dropBody}</span>
          </>
        )}
        <div className={cx("flex flex-wrap justify-center gap-2 transition-opacity duration-200", over && "opacity-50")}>
          <Button onClick={() => input.current?.click()}>
            <Upload aria-hidden="true" strokeWidth={2} className="size-4" />{DROP_COPY.choose}
          </Button>
          <Button variant="secondary" aria-expanded={pasting} onClick={() => setPasting((p) => !p)}>
            <ClipboardPaste aria-hidden="true" strokeWidth={1.8} className="size-4 text-ink-2" />{DROP_COPY.paste}
          </Button>
          {example && (
            <Button variant="secondary" onClick={example} className="border-dashed bg-sunken text-ink-2">
              <CirclePlay aria-hidden="true" strokeWidth={1.8} className="size-4" />{DROP_COPY.example}
            </Button>
          )}
        </div>
        <input ref={input} type="file" multiple accept={ACCEPT_FILES} aria-label="Files to add" className="hidden"
          onChange={(e) => { const files = Array.from(e.target.files ?? []); e.target.value = ""; if (files.length) onFiles(files); }} />
      </div>
      {pasting && <PastePanel onAdd={(t, d) => { onPaste(t, d); setPasting(false); }} onCancel={() => setPasting(false)} />}
    </>
  );
}

function PastePanel({ onAdd, onCancel }: { onAdd: (text: string, docType: UploadDocType) => void; onCancel: () => void }) {
  const id = useId();
  const [text, setText] = useState("");
  const [docType, setDocType] = useState<UploadDocType>("email");
  const [chosen, setChosen] = useState(false);
  const chars = text.trim().length;
  return (
    <Card className={cx("flex flex-col gap-3 p-4 sm:p-5", RISE)}>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={`${id}-text`} className="font-semibold text-ink">Pasted text</label>
        <span className="text-meta tabular-nums text-ink-3">{chars ? `${chars.toLocaleString("en-US")} ${chars === 1 ? "character" : "characters"}` : "Kept word for word"}</span>
      </div>
      <textarea id={`${id}-text`} rows={7} value={text} autoFocus
        placeholder="Paste an invoice, an email, a chat or a quote exactly as written."
        onChange={(e) => {
          setText(e.target.value);
          const guess = chosen ? undefined : pasteTypeOf(e.target.value);
          if (guess) setDocType(guess);
        }}
        className="w-full resize-y rounded-[12px] border border-line-strong bg-surface p-3 font-mono text-[13px] leading-[19px] text-ink placeholder:text-ink-4" />
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span id={`${id}-type`} className="text-meta font-semibold text-ink-2">What it is</span>
        <div role="radiogroup" aria-labelledby={`${id}-type`} className="inline-flex flex-wrap gap-[3px] rounded-[12px] bg-raised p-[3px]">
          {PASTE_TYPES.map((p) => {
            const on = docType === p.value;
            return (
              <label key={p.value} className={cx(
                "inline-flex h-9 cursor-pointer items-center rounded-[10px] px-3.5 text-[13.5px] font-semibold transition-colors",
                "has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-1 has-[input:focus-visible]:outline-brand",
                on ? "bg-surface text-ink shadow-card" : "text-ink-2 hover:text-ink")}>
                <input type="radio" name={`${id}-type`} value={p.value} checked={on} className="sr-only"
                  onChange={() => { setDocType(p.value); setChosen(true); }} />
                {p.label}
              </label>
            );
          })}
        </div>
        <span className="flex-1" />
        <Button variant="ghost" className="h-[46px]" onClick={onCancel}>Cancel</Button>
        <Button disabled={!text.trim()} onClick={() => onAdd(text, docType)}>Add text</Button>
      </div>
    </Card>
  );
}
