// Add evidence C: one field under the header. Paste, and CargoOS guesses the type from the text
// (email headers, chat timestamps); one click changes it. ⌘/Ctrl+Enter adds.
import { useState } from "react";
import { EVIDENCE_COPY, guessType, useEvidenceForm, type AddEvidence, type EvidenceType } from "./evidence-input";
import { cx } from "@/components/case/cx";
import { EvidenceResult, PrimaryButton, TypePicker } from "./fields";

export function EvidenceBar({ onAdd, onSeeChanges }: { onAdd: AddEvidence; onSeeChanges?: () => void }) {
  const [picked, setPicked] = useState<EvidenceType>();
  const [changing, setChanging] = useState(false);
  const form = useEvidenceForm(onAdd);
  const type = picked ?? guessType(form.text);
  const noun = type === "email" ? "an email" : type === "chat" ? "a chat" : "a note";
  const empty = !form.text.trim();
  const add = () => void form.add(type);
  const again = { ...form, reset: () => { form.reset(); setPicked(undefined); setChanging(false); } };

  if (form.outcome || form.reading) return (
    <div className="rounded-xl border border-line bg-surface px-4 py-3 shadow-card"><EvidenceResult form={again} onSeeChanges={onSeeChanges} /></div>
  );

  return (
    <form className="rounded-xl border border-line bg-surface p-2 shadow-card" onSubmit={(e) => { e.preventDefault(); add(); }}>
      <textarea aria-label="Evidence text" value={form.text} onChange={(e) => form.setText(e.target.value)} rows={empty ? 1 : 6}
        placeholder="Paste an email, chat or note to add it to the case"
        onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); add(); } }}
        className={cx("block w-full resize-none rounded-md bg-transparent px-2.5 py-2 text-body leading-5 text-ink placeholder:text-ink-3",
          !empty && "bg-sunken")} />
      {!empty && (
        <div className="mt-2 flex items-center justify-between gap-3 px-1">
          <div className="flex items-center gap-2 text-xs text-ink-2">
            {changing ? (
              <TypePicker value={type} onChange={(t) => { setPicked(t); setChanging(false); }} size="sm" />
            ) : (
              <>
                <span>{picked ? "Adding as" : "Looks like"} {noun}</span>
                <button type="button" onClick={() => setChanging(true)} className="font-medium text-link underline underline-offset-[3px]">Change</button>
              </>
            )}
            <span className="text-ink-3">· {EVIDENCE_COPY.hint}</span>
          </div>
          <PrimaryButton type="submit">{EVIDENCE_COPY.add}</PrimaryButton>
        </div>
      )}
    </form>
  );
}
