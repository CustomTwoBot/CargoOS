// Message to the seller after the owner accepts a dispute (SPEC §8 owner page). The owner edits
// the words; amounts and line numbers are locked chips taken from the findings. Export PDF prints
// the message; Copy text puts it on the clipboard. CargoOS never sends it.
import { memo, useEffect, useRef, useState } from "react";
import { cx } from "@/components/case/cx";
import { lockedGroups, plainMessage, printPage, type Part } from "./message";
import { PRIMARY, SECONDARY } from "./parts";

// A locked value reads as text with a quiet tint, not a box; its punctuation stays on its line.
const TOKEN = "rounded-[3px] bg-sunken px-[2px] font-semibold [box-decoration-break:clone]";

/** Words and locked values; `editable` marks the values as not editable inside a contentEditable. */
function Parts({ text, editable }: { text: string; editable: boolean }) {
  const one = (p: Part, key: number) => p.kind === "locked"
    ? <span key={key} data-locked={editable ? "" : undefined} contentEditable={editable ? false : undefined}
        title={editable ? "Locked. This number comes from CargoOS rules." : undefined} className={TOKEN}>{p.text}</span>
    : <span key={key}>{p.text}</span>;
  return lockedGroups(text).map((g, i) => (Array.isArray(g)
    ? <span key={i} className="whitespace-nowrap">{g.map(one)}</span>
    : one(g, i)));
}

/** Print through a hidden frame, so only the message is printed. */
function printInFrame(html: string) {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;width:0;height:0;border:0";
  frame.onload = () => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    setTimeout(() => frame.remove(), 1000);
  };
  frame.srcdoc = html;
  document.body.appendChild(frame);
}

const chipsIn = (root: HTMLElement) => [...root.querySelectorAll<HTMLElement>("[data-locked]")];

/** Insert plain text at the caret, replacing the selection. */
function insertAtCaret(text: string) {
  const sel = window.getSelection();
  if (!sel?.rangeCount) return;
  const range = sel.getRangeAt(0);
  range.deleteContents();
  const node = document.createTextNode(text);
  range.insertNode(node);
  range.setStartAfter(node);
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
}

type EditorProps = { initial: string; label: string; singleLine?: boolean; onText: (text: string) => void };

/**
 * Words are editable; chips are not. The DOM is the source of truth while editing: React renders
 * the parts once and never again, and every edit that would touch a chip is cancelled.
 */
const LockedEditor = memo(function LockedEditor({ initial, label, singleLine, onText }: EditorProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [first] = useState(initial);
  const onTextRef = useRef(onText);
  useEffect(() => { onTextRef.current = onText; });

  useEffect(() => {
    const el = ref.current!;
    const touchesChip = (e: InputEvent) => {
      const ranges = e.getTargetRanges?.() ?? [];
      const sel = window.getSelection();
      const live = ranges.length ? ranges.map((r) => {
        const range = document.createRange();
        range.setStart(r.startContainer, r.startOffset);
        range.setEnd(r.endContainer, r.endOffset);
        return range;
      }) : sel?.rangeCount ? [sel.getRangeAt(0)] : [];
      return live.some((range) => chipsIn(el).some((chip) => range.intersectsNode(chip) && !range.collapsed));
    };
    const onBeforeInput = (e: InputEvent) => {
      if (touchesChip(e)) { e.preventDefault(); return; }
      if (e.inputType === "insertParagraph" || e.inputType === "insertLineBreak") {
        e.preventDefault();
        if (!singleLine) { insertAtCaret("\n"); onTextRef.current(el.textContent ?? ""); }
      } else if (e.inputType === "insertFromPaste" || e.inputType === "insertFromDrop") {
        // Paste words only, as plain text; pasted numbers stay plain words, never chips.
        e.preventDefault();
        const text = e.dataTransfer?.getData("text/plain") ?? "";
        insertAtCaret(singleLine ? text.replace(/\s*\n\s*/g, " ") : text);
        onTextRef.current(el.textContent ?? "");
      } else if (e.inputType.startsWith("format")) {
        e.preventDefault();
      }
    };
    const onInput = () => onTextRef.current(el.textContent ?? "");
    el.addEventListener("beforeinput", onBeforeInput);
    el.addEventListener("input", onInput);
    return () => { el.removeEventListener("beforeinput", onBeforeInput); el.removeEventListener("input", onInput); };
  }, [singleLine]);

  return (
    <div ref={ref} role="textbox" aria-label={label} aria-multiline={!singleLine} contentEditable suppressContentEditableWarning
      spellCheck
      className={cx("rounded-md px-2 py-1 -mx-2 text-[14px] leading-[24px] outline-none hover:bg-sunken focus:bg-sunken focus:shadow-[inset_0_0_0_1px_var(--line-strong)]",
        singleLine ? "font-semibold" : "whitespace-pre-wrap")}>
      <Parts text={first} editable />
    </div>
  );
});

type Props = {
  to: string; subject: string; message: string;
  /** Every edit, as plain text: for saving the owner's wording (editedBody). */
  onChange?: (text: { subject: string; body: string }) => void;
  /** Read-only for a screen whose person can't write to the seller. */
  readOnly?: boolean;
  /** Prints the page; a hidden frame by default. */
  print?: (html: string) => void;
};

export function SellerMessage({ to, subject, message, onChange, readOnly, print = printInFrame }: Props) {
  const text = useRef({ subject, body: message });
  const [copied, setCopied] = useState(false);
  const update = (patch: Partial<typeof text.current>) => { text.current = { ...text.current, ...patch }; setCopied(false); onChange?.(text.current); };
  const copy = async () => {
    try { await navigator.clipboard.writeText(plainMessage(text.current)); setCopied(true); } catch { setCopied(false); }
  };
  return (
    <section aria-label="Message to the seller" className="rounded-xl border border-line bg-surface px-6 py-5 shadow-card">
      <h3 className="text-panel font-[650]">Message to the seller</h3>
      {!readOnly && <p className="mt-0.5 text-xs text-ink-3">Edit the words. Numbers are locked to the findings.</p>}
      <dl className="mt-3 grid grid-cols-[64px_minmax(0,1fr)] items-baseline gap-y-1 text-[14px]">
        <dt className="text-ink-3">To</dt><dd>{to}</dd>
        <dt className="text-ink-3">Subject</dt>
        <dd>{readOnly ? <span className="font-semibold"><Parts text={subject} editable={false} /></span>
          : <LockedEditor initial={subject} label="Subject" singleLine onText={(s) => update({ subject: s })} />}</dd>
      </dl>
      <div className="mt-3 border-t border-line pt-3">
        {readOnly ? <p className="whitespace-pre-wrap text-[14px] leading-[24px]"><Parts text={message} editable={false} /></p>
          : <LockedEditor initial={message} label="Message" onText={(b) => update({ body: b })} />}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-4">
        <button type="button" className={PRIMARY} onClick={() => print(printPage({ to, ...text.current }))}>Export PDF</button>
        <button type="button" className={SECONDARY} onClick={copy}>Copy text</button>
        {copied && <span role="status" className="text-meta text-ink-2">Copied.</span>}
      </div>
      <p className="mt-2 text-xs text-ink-3">CargoOS never sends this. You send it yourself.</p>
    </section>
  );
}
