// Add evidence: a header button opens a panel over the right column (404px, same as the
// side panel). Not modal: the list stays usable, Escape or Close puts it away.
import { useEffect, useState } from "react";
import { EVIDENCE_COPY, useEvidenceForm, type AddEvidence } from "./evidence-input";
import { EvidenceResult, EvidenceText, PrimaryButton, SecondaryButton, TypePicker } from "./fields";

export function EvidenceDrawer({ onAdd, onSeeChanges }: { onAdd: AddEvidence; onSeeChanges?: () => void }) {
  const [open, setOpen] = useState(false);
  const form = useEvidenceForm(onAdd);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <SecondaryButton onClick={() => setOpen((v) => !v)} aria-expanded={open}>Add evidence</SecondaryButton>
      {open && (
        <aside aria-label="Add evidence"
          className="fixed bottom-4 right-4 top-4 z-40 flex w-[404px] flex-col rounded-xl border border-line bg-surface shadow-[0_12px_32px_rgba(0,0,0,.14)]">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <h2 className="text-panel font-[650]">Add evidence</h2>
            <button type="button" onClick={() => setOpen(false)} className="text-meta font-medium text-ink-3 hover:text-ink">Close</button>
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto px-4 py-4">
            {form.outcome || form.reading ? (
              <>
                <EvidenceResult form={form} onSeeChanges={onSeeChanges} />
                <blockquote className="whitespace-pre-wrap rounded-lg border border-line bg-sunken px-3 py-2 text-[13px] leading-5 text-ink-2">{form.text.trim()}</blockquote>
              </>
            ) : (
              <>
                <TypePicker value={form.type} onChange={form.setType} />
                <EvidenceText form={form} rows={12} autoFocus />
                <p className="text-xs text-ink-3">{EVIDENCE_COPY.hint} Nothing is sent.</p>
              </>
            )}
          </div>
          {!form.outcome && !form.reading && (
            <div className="flex justify-end border-t border-line px-4 py-3">
              <PrimaryButton disabled={!form.canAdd} onClick={() => void form.add()}>{EVIDENCE_COPY.add}</PrimaryButton>
            </div>
          )}
        </aside>
      )}
    </>
  );
}
