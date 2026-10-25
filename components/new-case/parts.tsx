// Pieces of the New case flow: buttons, a document row, the drop area, the recorded-case list.
import { useId, useState, type ReactNode } from "react";
import { cx } from "@/components/case/cx";
import { StatusGlyph } from "@/components/case/glyphs";
import { INPUT } from "@/components/inputs/fields";
import { Busy } from "@/components/states/shared";
import {
  AGREEMENT_TYPES, NEW_CASE_COPY, TYPE_LABEL, describeDoc, docMeta, readLabel,
  type AgreementType, type NewCaseDocType, type PendingDoc, type ReadResult, type RecordedExample,
} from "./model";

const PRIMARY = "flex-none rounded-md bg-primary px-3.5 py-1.5 text-[13px] font-semibold text-primary-ink aria-disabled:cursor-not-allowed aria-disabled:opacity-50";
const SECONDARY = "flex-none rounded-md border border-line-strong bg-surface px-3 py-1.5 text-[13px] font-semibold text-ink hover:border-ink-3";
export const TEXT_BUTTON = "text-meta font-medium text-link underline underline-offset-[3px]";

type ButtonProps = { children: string; onClick: () => void; disabled?: boolean; describedBy?: string };

/** Disabled stays focusable (aria-disabled) and points at its visible reason. */
export function Primary({ children, onClick, disabled, describedBy }: ButtonProps) {
  return (
    <button type="button" aria-disabled={disabled || undefined} aria-describedby={describedBy}
      onClick={disabled ? undefined : onClick} className={PRIMARY}>{children}</button>
  );
}

export const Secondary = ({ children, onClick }: ButtonProps) => (
  <button type="button" onClick={onClick} className={SECONDARY}>{children}</button>
);

/** Muted word to the right of a section title: "Required", "Helpful". */
export function SectionTitle({ title, tag, id }: { title: string; tag: string; id?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <h2 id={id} className="text-row font-semibold text-ink">{title}</h2>
      <span className="text-meta font-medium text-ink-3">{tag}</span>
    </div>
  );
}

export function TypeSelect({ doc, onChange }: { doc: PendingDoc; onChange: (t: AgreementType) => void }) {
  return (
    <select aria-label={`Type of ${doc.title}`} value={doc.type} onChange={(e) => onChange(e.target.value as AgreementType)}
      className="w-[96px] flex-none rounded-[7px] border border-line-strong bg-surface px-1.5 py-1 text-[13px] font-semibold text-ink">
      {AGREEMENT_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
    </select>
  );
}

/** One document: type, title, then sender and date when the text gave them. `aside` sits on the right. */
export function DocRow({ doc, lead, aside, children }: {
  doc: PendingDoc; lead?: ReactNode; aside?: ReactNode; children?: ReactNode;
}) {
  const meta = docMeta(doc);
  return (
    <li className="border-t border-line py-2.5 first:border-t-0">
      <div className="flex items-center gap-3">
        {lead ?? <span className="w-[96px] flex-none text-[13px] font-semibold text-ink-2">{TYPE_LABEL[doc.type]}</span>}
        <div className="min-w-0 flex-1">
          <p className="truncate text-body font-semibold text-ink">{doc.title}</p>
          {meta && <p className="truncate text-meta text-ink-3">{meta}</p>}
        </div>
        {aside}
      </div>
      {children}
    </li>
  );
}

/** What reading this document returned, or that it wasn't read (replay). */
export function ReadStatus({ doc, result, replay }: { doc: PendingDoc; result?: ReadResult; replay: boolean }) {
  if (replay) return <span className="flex-none text-[13px] text-ink-3">{NEW_CASE_COPY.notRead}</span>;
  if (!result) return <Busy label={NEW_CASE_COPY.reading} className="flex-none text-[13px] text-ink-2" />;
  if (result.kind === "failed") return null;
  return <span role="status" className="max-w-[300px] flex-none text-right text-[13px] text-ink-2">{readLabel(doc, result)}</span>;
}

/** The extraction-failed sentence under its document, with the way out: paste the text and read again. */
export function FailedNote({ doc, where, onReadAgain }: { doc: PendingDoc; where?: string; onReadAgain: (text: string) => void }) {
  const [pasting, setPasting] = useState(false);
  const [text, setText] = useState("");
  return (
    <div role="alert" className="ml-[108px] mt-2 rounded-lg bg-waiting-tint px-3 py-2.5 text-waiting">
      <div className="flex items-start gap-2.5">
        <span className="mt-[3px]"><StatusGlyph group="waiting" /></span>
        <div className="min-w-0 flex-1 text-[13px]">
          <p className="font-semibold">{NEW_CASE_COPY.failed}</p>
          {where && <p className="mt-0.5">{doc.title}, {where}.</p>}
        </div>
        {!pasting && (
          <button type="button" onClick={() => setPasting(true)}
            className="flex-none rounded-[7px] border border-line-strong bg-surface px-2.5 py-1 text-[13px] font-semibold text-ink hover:bg-sunken">
            {NEW_CASE_COPY.pasteInstead}
          </button>
        )}
      </div>
      {pasting && (
        <div className="mt-2.5 grid gap-2">
          <textarea aria-label={`Text of ${doc.title}`} value={text} onChange={(e) => setText(e.target.value)} rows={5} autoFocus
            placeholder="Paste the text exactly as written." className={cx(INPUT, "resize-y py-2 leading-5")} />
          <div className="flex justify-end">
            <Primary disabled={!text.trim()} onClick={() => onReadAgain(text)}>{NEW_CASE_COPY.readAgain}</Primary>
          </div>
        </div>
      )}
    </div>
  );
}

const isPdf = (f: File) => f.type === "application/pdf" || /\.pdf$/i.test(f.name);

/** A PDF is kept as a file (the server reads it); a text file is read here so its labels show at once. */
export async function fileToDoc(file: File, as?: NewCaseDocType): Promise<PendingDoc> {
  if (isPdf(file)) return describeDoc("", { as, fileName: file.name, file });
  return describeDoc(await file.text(), { as, fileName: file.name });
}

/** Wraps a section so files can be dropped on it; `pick` opens the file chooser. */
export function DropArea({ label, multiple, onFiles, children }: {
  label: string; multiple?: boolean; onFiles: (files: File[]) => void;
  children: (pick: () => void, over: boolean) => ReactNode;
}) {
  const id = useId();
  const pick = () => document.getElementById(id)?.click();
  const [over, setOver] = useState(false);
  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); if (e.dataTransfer.files.length) onFiles([...e.dataTransfer.files]); }}>
      <input id={id} type="file" aria-label={label} multiple={multiple} hidden
        accept=".pdf,.txt,.eml,.md,application/pdf,text/plain,message/rfc822"
        onChange={(e) => { if (e.target.files?.length) onFiles([...e.target.files]); e.target.value = ""; }} />
      {children(pick, over)}
    </div>
  );
}

/** Recorded cases to open instead: the first is the main button. */
export function ExampleButtons({ examples, onLoad }: { examples: RecordedExample[]; onLoad: (id: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {examples.map((ex, i) => i === 0
        ? <Primary key={ex.id} onClick={() => onLoad(ex.id)}>{ex.label}</Primary>
        : <Secondary key={ex.id} onClick={() => onLoad(ex.id)}>{ex.label}</Secondary>)}
    </div>
  );
}

/** One row per recorded case: the button text and what is in it. */
export function ExampleList({ examples, onLoad }: { examples: RecordedExample[]; onLoad: (id: string) => void }) {
  return (
    <ul>
      {examples.map((ex) => (
        <li key={ex.id} className="border-t border-line first:border-t-0">
          <button type="button" onClick={() => onLoad(ex.id)} className="group block w-full py-2.5 text-left">
            <span className="block text-body font-semibold text-ink group-hover:underline group-hover:underline-offset-[3px]">{ex.label}</span>
            <span className="block text-meta text-ink-3">{ex.summary}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
