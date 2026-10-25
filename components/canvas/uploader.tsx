// The uploader's canvas (docs/design.md §0.3, §0.4 п.5): no money and no findings, only the case's
// documents and a big place to drop more. Text files and pasted text are added as evidence; other
// files are named but, in this replay, not read.
import { useRef, useState } from "react";
import { cx } from "@/components/case/cx";
import type { Focus } from "@/components/case/panes";
import type { CaseInput } from "@/components/case/view-model";
import { docRows } from "@/components/documents/documents";
import { meta, StatusText } from "@/components/documents/parts";
import { EVIDENCE_COPY, useEvidenceForm, type AddEvidence, type EvidenceType } from "@/components/inputs/evidence-input";
import { EvidenceResult, EvidenceText, PrimaryButton, SecondaryButton, TypePicker } from "@/components/inputs/fields";

export const DROP_LABEL = "Drop invoices, quotes, emails, chats";

/** What kind of evidence a file most likely is, from its name. */
export const typeOfFile = (name: string): EvidenceType =>
  /chat|whatsapp|wechat|messages/i.test(name) ? "chat" : /\.eml$|email|mail|re[_ -]/i.test(name) ? "email" : "other";

const isText = (f: File) => f.type.startsWith("text/") || /\.(txt|eml|csv|md)$/i.test(f.name);

export function UploaderCanvas({ x, onAdd, onFocus }: { x: CaseInput; onAdd: AddEvidence; onFocus: (f: Focus) => void }) {
  const [over, setOver] = useState(false);
  const [note, setNote] = useState<string>();
  const [pasting, setPasting] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const form = useEvidenceForm(onAdd);

  const take = async (files: FileList | null) => {
    if (!files?.length) return;
    const read: string[] = [], skipped: string[] = [];
    for (const f of Array.from(files)) {
      if (isText(f)) { await onAdd({ type: typeOfFile(f.name), text: await f.text() }); read.push(f.name); } else skipped.push(f.name);
    }
    setNote([
      read.length ? `Added ${read.join(", ")}. CargoOS reads ${read.length === 1 ? "it" : "them"} next.` : "",
      skipped.length ? `${skipped.join(", ")}: in this replay only text files are read. Paste the text instead.` : "",
    ].filter(Boolean).join(" "));
  };

  return (
    <div className="flex flex-col gap-4">
      <section aria-label="Add documents"
        onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); void take(e.dataTransfer.files); }}
        className={cx("flex min-h-[220px] flex-col items-center justify-center gap-3 rounded-[14px] border-2 border-dashed px-6 py-8 text-center",
          over ? "border-ink-3 bg-sunken" : "border-line-strong bg-surface")}>
        <p className="text-[19px] font-[650]">{DROP_LABEL}</p>
        <p className="max-w-[420px] text-why text-ink-2">PDFs, emails, screenshots of a chat. CargoOS reads them and checks the invoice again. Nothing is sent.</p>
        <div className="mt-1 flex flex-wrap justify-center gap-2">
          <PrimaryButton onClick={() => input.current?.click()}>Choose files</PrimaryButton>
          <SecondaryButton onClick={() => setPasting((v) => !v)} aria-expanded={pasting}>Paste text</SecondaryButton>
        </div>
        <input ref={input} type="file" multiple hidden aria-label="Choose files" onChange={(e) => { void take(e.target.files); e.target.value = ""; }} />
        {note && <p role="status" className="max-w-[480px] text-meta text-ink-2">{note}</p>}
      </section>

      {pasting && (
        <section aria-label="Paste text" className="flex flex-col gap-3 rounded-[14px] border border-line bg-surface p-4 shadow-card">
          {form.outcome || form.reading ? <EvidenceResult form={form} /> : (
            <>
              <TypePicker value={form.type} onChange={form.setType} />
              <EvidenceText form={form} rows={6} autoFocus />
              <div className="flex justify-end"><PrimaryButton disabled={!form.canAdd} onClick={() => void form.add()}>{EVIDENCE_COPY.add}</PrimaryButton></div>
            </>
          )}
        </section>
      )}

      <section aria-label="Documents" className="overflow-hidden rounded-[14px] border border-line bg-surface shadow-card">
        <h2 className="border-b border-line px-[18px] py-3 text-row font-[650]">Documents in this case · {x.documents.length}</h2>
        <ul>
          {docRows(x).map((r) => (
            <li key={r.doc._id} className="border-t border-line first:border-0">
              <button type="button" onClick={() => onFocus({ kind: "doc", docId: r.doc._id })}
                className="flex w-full items-baseline justify-between gap-4 px-[18px] py-3 text-left hover:bg-sunken">
                <span className="min-w-0">
                  <span className="block truncate text-[14px] font-semibold">{r.doc.title}</span>
                  <span className="block text-meta text-ink-3">{meta(r)}</span>
                </span>
                <StatusText status={r.status} className="shrink-0" />
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
