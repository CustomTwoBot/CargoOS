// Add evidence B: the last row of the documents list. A dashed "Add evidence" row opens into
// the form in place, and what you added joins the list next to the quote, email and chat.
import { useState } from "react";
import { ChainGlyph } from "@/components/case/glyphs";
import { formatShortDate } from "@/lib/engine/money";
import type { SourceDoc } from "@/lib/types";
import { EVIDENCE_COPY, outcomeText, useEvidenceForm, type AddEvidence, type EvidenceOutcome, type EvidenceType } from "./evidence-input";
import { EvidenceText, PrimaryButton, SecondaryButton, Spinner, TypePicker } from "./fields";

const ICON: Partial<Record<SourceDoc["type"], "invoice" | "mail" | "chat" | "quote">> = {
  freight_invoice: "invoice", email: "mail", chat: "chat", quote: "quote",
};
const ADDED_TITLE: Record<EvidenceType, string> = { email: "Email you added", chat: "Chat you added", other: "Note you added" };

type Added = { id: number; type: EvidenceType; text: string; outcome?: EvidenceOutcome };

export function DocumentsWithAdd({ documents, onAdd }: { documents: SourceDoc[]; onAdd: AddEvidence }) {
  const [open, setOpen] = useState(false);
  const [added, setAdded] = useState<Added[]>([]);
  const form = useEvidenceForm(async (e) => {
    const id = Date.now();
    setAdded((a) => [...a, { id, ...e }]);
    setOpen(false);
    const outcome = await onAdd(e);
    setAdded((a) => a.map((x) => (x.id === id ? { ...x, outcome } : x)));
    return outcome;
  });

  return (
    <section aria-label="Documents" className="rounded-xl border border-line bg-surface shadow-card">
      <h2 className="border-b border-line px-4 py-2.5 text-[13px] font-semibold">Documents</h2>
      <ul>
        {documents.map((d) => (
          <li key={d._id} className="flex items-center gap-3 border-b border-line px-4 py-2.5 text-[13.5px]">
            <span className="text-ink-3"><ChainGlyph icon={ICON[d.type] ?? "quote"} /></span>
            <span className="min-w-0 flex-1 truncate font-medium">{d.title}</span>
            {d.sentAt && <span className="text-meta text-ink-3">{formatShortDate(d.sentAt)}</span>}
          </li>
        ))}
        {added.map((a) => (
          <li key={a.id} className="flex items-start gap-3 border-b border-line px-4 py-2.5 text-[13.5px]">
            <span className="pt-0.5 text-ink-3"><ChainGlyph icon={a.type === "email" ? "mail" : a.type === "chat" ? "chat" : "quote"} /></span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 font-medium">{ADDED_TITLE[a.type]}</div>
              <p className="truncate text-xs text-ink-3">“{a.text.split("\n")[0]}”</p>
              <p role="status" className="mt-1 flex items-center gap-2 text-xs text-ink-2">
                {a.outcome ? outcomeText(a.outcome) : <><Spinner />{EVIDENCE_COPY.reading}</>}
              </p>
            </div>
          </li>
        ))}
      </ul>
      {open ? (
        <form className="grid gap-2.5 px-4 py-3" onSubmit={(e) => { e.preventDefault(); if (!form.canAdd) return; void form.add(); form.reset(); }}>
          <TypePicker value={form.type} onChange={form.setType} size="sm" />
          <EvidenceText form={form} rows={5} autoFocus />
          <p className="-mt-1 text-xs text-ink-3">{EVIDENCE_COPY.hint}</p>
          <div className="flex justify-end gap-2">
            <SecondaryButton onClick={() => setOpen(false)}>Cancel</SecondaryButton>
            <PrimaryButton type="submit" disabled={!form.canAdd}>{EVIDENCE_COPY.add}</PrimaryButton>
          </div>
        </form>
      ) : (
        <div className="p-2">
          <button type="button" onClick={() => setOpen(true)}
            className="flex w-full items-center gap-3 rounded-lg border border-dashed border-line-strong px-3 py-2.5 text-left text-[13.5px] font-semibold text-ink hover:border-ink-3">
            <span aria-hidden="true" className="grid size-[15px] place-items-center text-ink-3">+</span>
            Add evidence
            <span className="font-normal text-ink-3">paste an email, chat or note</span>
          </button>
        </div>
      )}
    </section>
  );
}
