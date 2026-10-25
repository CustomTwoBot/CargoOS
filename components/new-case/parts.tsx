// Pieces of the New case flow: buttons, a document row, drop handling, the phone card, recorded cases.
import { useId, useState, type ReactNode } from "react";
import {
  AGREEMENT_TYPES, NEW_CASE_COPY, TYPE_LABEL, describeDoc, docMeta, keepsFile,
  type AgreementType, type NewCaseDocType, type PendingDoc, type RecordedExample,
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

export function TypeSelect({ doc, onChange }: { doc: PendingDoc; onChange: (t: AgreementType) => void }) {
  return (
    <select aria-label={`Type of ${doc.title}`} value={doc.type} onChange={(e) => onChange(e.target.value as AgreementType)}
      className="w-[96px] flex-none rounded-[7px] border border-line-strong bg-surface px-1.5 py-1 text-[13px] font-semibold text-ink">
      {AGREEMENT_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
    </select>
  );
}

/** One document: type, title, then sender and date when the text gave them. `aside` sits on the right. */
export function DocRow({ doc, lead, aside }: { doc: PendingDoc; lead?: ReactNode; aside?: ReactNode }) {
  const meta = docMeta(doc);
  return (
    <li className="flex items-center gap-3 border-t border-line py-2.5 first:border-t-0">
      {lead ?? <span className="w-[96px] flex-none text-[13px] font-semibold text-ink-2">{TYPE_LABEL[doc.type]}</span>}
      <div className="min-w-0 flex-1">
        <p className="truncate text-body font-semibold text-ink">{doc.title}</p>
        {meta && <p className="truncate text-meta text-ink-3">{meta}</p>}
      </div>
      {aside}
    </li>
  );
}

/** A PDF or photo is kept as a file (the server reads it); a text file (.eml, a WhatsApp .txt) is read here. */
export async function fileToDoc(file: File, as?: NewCaseDocType): Promise<PendingDoc> {
  if (keepsFile(file)) return describeDoc("", { as, fileName: file.name, file });
  return describeDoc(await file.text(), { as, fileName: file.name });
}

const ACCEPT = ".pdf,.txt,.eml,.md,.jpg,.jpeg,.png,.heic,.webp,application/pdf,text/plain,message/rfc822,image/*";

/** Files dropped or chosen here become documents; `as` gives them a type, otherwise it is guessed per file. */
export function DropArea({ label, as, onDocs, className, children }: {
  label: string; as?: NewCaseDocType; onDocs: (docs: PendingDoc[]) => void; className?: (over: boolean) => string;
  children: (pick: () => void, over: boolean) => ReactNode;
}) {
  const id = useId();
  const [over, setOver] = useState(false);
  const pick = () => document.getElementById(id)?.click();
  const take = async (files: File[]) => onDocs(await Promise.all(files.map((f) => fileToDoc(f, as))));
  return (
    <div className={className?.(over)}
      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault(); e.stopPropagation(); setOver(false);
        if (e.dataTransfer.files.length) void take([...e.dataTransfer.files]);
      }}>
      <input id={id} type="file" aria-label={label} multiple hidden accept={ACCEPT}
        onChange={(e) => { if (e.target.files?.length) void take([...e.target.files]); e.target.value = ""; }} />
      {children(pick, over)}
    </div>
  );
}

/**
 * The phone uploader's address. A real QR code needs a library (Pranav's OK), so for now a plain box
 * stands where it will go, with the address under it.
 */
export function PhoneCard({ url }: { url: string }) {
  return (
    <section aria-label={NEW_CASE_COPY.phone} className="rounded-xl border border-line bg-surface px-4 py-3.5 shadow-card">
      <h2 className="text-body font-semibold text-ink">{NEW_CASE_COPY.phone}</h2>
      <p className="mt-0.5 text-meta text-ink-3">{NEW_CASE_COPY.phoneBody}</p>
      <div className="mt-3 flex items-center gap-3">
        <div role="img" aria-label={`${NEW_CASE_COPY.qr} for ${url}`}
          className="grid size-[104px] flex-none place-items-center rounded-lg border border-line-strong bg-sunken text-meta text-ink-3">
          {NEW_CASE_COPY.qr}
        </div>
        <p className="min-w-0 break-all text-meta font-medium text-ink-2">{url}</p>
      </div>
    </section>
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

/** The recorded-case card for a right column. */
export function ExamplesCard({ examples, onLoad }: { examples: RecordedExample[]; onLoad: (id: string) => void }) {
  return (
    <aside aria-label={NEW_CASE_COPY.examples} className="rounded-xl border border-line bg-surface px-4 pb-1.5 pt-3.5 shadow-card">
      <h2 className="text-body font-semibold text-ink">{NEW_CASE_COPY.examples}</h2>
      <p className="mb-1 text-meta text-ink-3">{NEW_CASE_COPY.examplesBody}</p>
      <ExampleList examples={examples} onLoad={onLoad} />
    </aside>
  );
}
