// Words you can edit with every number kept as a locked chip (CLAUDE.md rule 6: the LLM writes the
// words, code inserts every number). Used by the letter page (L1) and the inbox's seller message.
// printInFrame prints one page through a hidden frame, so only the message is printed.
import { memo, useEffect, useRef, useState } from "react";
import { cx } from "@/components/case/cx";
import { lockedGroups, type Part } from "@/components/inboxes/message";

// A locked value reads as text with a quiet tint, not a box; its punctuation stays on its line.
export const QUIET_CHIP = "rounded-[3px] bg-sunken px-[2px] font-semibold [box-decoration-break:clone]";
const QUIET_TITLE = "Locked. This number comes from CargoOS rules.";

type ChipStyle = { chipClassName?: string; chipTitle?: string };

/** Words and locked values; `editable` marks the values as not editable inside a contentEditable. */
export function LockedParts({ text, editable, chipClassName = QUIET_CHIP, chipTitle = QUIET_TITLE }: { text: string; editable: boolean } & ChipStyle) {
  const one = (p: Part, key: number) => p.kind === "locked"
    ? <span key={key} data-chip="" data-locked={editable ? "" : undefined} contentEditable={editable ? false : undefined}
        title={editable ? chipTitle : undefined} className={chipClassName}>{p.text}</span>
    : <span key={key}>{p.text}</span>;
  return lockedGroups(text).map((g, i) => (Array.isArray(g)
    ? <span key={i} className="whitespace-nowrap">{g.map(one)}</span>
    : one(g, i)));
}

/** Print through a hidden frame, so only the message is printed. */
export function printInFrame(html: string) {
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

export type LockedEditorProps = {
  initial: string; label: string; singleLine?: boolean; onText: (text: string) => void;
  /** Replaces the editor's type and padding classes. */
  className?: string;
} & ChipStyle;

const EDITOR = "rounded-md px-2 py-1 -mx-2 text-[14px] leading-[24px] outline-none hover:bg-sunken focus:bg-sunken focus:shadow-[inset_0_0_0_1px_var(--line-strong)]";

/**
 * Words are editable; chips are not. The DOM is the source of truth while editing: React renders
 * the parts once and never again, and every edit that would touch a chip is cancelled.
 */
export const LockedEditor = memo(function LockedEditor({ initial, label, singleLine, onText, className, chipClassName, chipTitle }: LockedEditorProps) {
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
      className={cx(className ?? EDITOR, singleLine ? "font-semibold" : "whitespace-pre-wrap")}>
      <LockedParts text={first} editable chipClassName={chipClassName} chipTitle={chipTitle} />
    </div>
  );
});
