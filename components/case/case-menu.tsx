// The case header's "⋯" menu (docs/design.md §0.4 п.2): Add evidence (for whoever adds evidence),
// Audit log (every event of the case, in a sheet) and Reset demo. The theme lives in Settings.
import { Menu } from "@base-ui/react/menu";
import { useState } from "react";
import type { Person } from "@/lib/types";
import { AuditLog } from "@/components/history/audit-log";
import { EVIDENCE_COPY, useEvidenceForm, type AddEvidence } from "@/components/inputs/evidence-input";
import { EvidenceResult, EvidenceText, PrimaryButton, TypePicker } from "@/components/inputs/fields";
import { MoreIcon } from "@/components/shell/icons";
import { Sheet } from "@/components/shell/sheet";
import type { CaseInput } from "./view-model";

const ITEM = "flex cursor-default items-center gap-2 rounded-[6px] px-2.5 py-1.5 text-[13.5px] outline-none data-[highlighted]:bg-sunken";

type Props = {
  x: CaseInput;
  /** Whose words the audit log uses ("you" vs "Sam"). */
  viewer: Person;
  /** Left out when this person doesn't add evidence. */
  onAddEvidence?: AddEvidence;
  onReset: () => void;
};

export function CaseMenu({ x, viewer, onAddEvidence, onReset }: Props) {
  const [sheet, setSheet] = useState<"evidence" | "audit">();
  const close = () => setSheet(undefined);
  return (
    <>
      <Menu.Root>
        <Menu.Trigger aria-label="More actions"
          className="grid size-[33px] place-items-center rounded-md text-ink-2 hover:bg-sunken hover:text-ink data-[popup-open]:bg-sunken">
          <MoreIcon />
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Positioner side="bottom" align="end" sideOffset={6} className="z-50">
            <Menu.Popup className="w-[180px] rounded-[10px] border border-line bg-surface p-1 text-ink shadow-[0_8px_24px_rgba(0,0,0,.25)] outline-none">
              {onAddEvidence && <Menu.Item className={ITEM} onClick={() => setSheet("evidence")}>Add evidence</Menu.Item>}
              <Menu.Item className={ITEM} onClick={() => setSheet("audit")}>Audit log</Menu.Item>
              <Menu.Separator className="my-1 h-px bg-line" />
              <Menu.Item className={ITEM} onClick={onReset}>Reset demo</Menu.Item>
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
      {sheet === "evidence" && onAddEvidence && <EvidenceSheet onClose={close} onAdd={onAddEvidence} />}
      {sheet === "audit" && <Sheet title="Audit log" onClose={close} wide><AuditLog x={x} viewer={viewer} /></Sheet>}
    </>
  );
}

/** Add evidence in a sheet: type, text, Add; then what CargoOS made of it. */
function EvidenceSheet({ onClose, onAdd }: { onClose: () => void; onAdd: AddEvidence }) {
  const form = useEvidenceForm(onAdd);
  const done = form.outcome || form.reading;
  return (
    <Sheet title="Add evidence" onClose={onClose}
      footer={!done && <PrimaryButton disabled={!form.canAdd} onClick={() => void form.add()}>{EVIDENCE_COPY.add}</PrimaryButton>}>
      {done ? (
        <>
          <EvidenceResult form={form} />
          <blockquote className="whitespace-pre-wrap rounded-lg border border-line bg-sunken px-3 py-2 text-[13px] leading-5 text-ink-2">{form.text.trim()}</blockquote>
        </>
      ) : (
        <>
          <TypePicker value={form.type} onChange={form.setType} />
          <EvidenceText form={form} rows={12} autoFocus />
          <p className="text-xs text-ink-3">{EVIDENCE_COPY.hint} Nothing is sent.</p>
        </>
      )}
    </Sheet>
  );
}
