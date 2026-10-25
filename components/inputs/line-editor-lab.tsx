"use client";
// /lab/line-editor: three ways to fix an invoice line's description or amount, on Scenario A.
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import type { LineChange } from "./line-edit";
import { InlineLineEditor } from "./line-inline";
import { PopoverLineEditor } from "./line-popover";
import { SheetLineEditor } from "./line-sheet";
import { scenarioALines } from "./lab-data";
import { LabShell, pickVariation, type Variation } from "./lab-shell";

export const LINE_VARIATIONS: Variation[] = [
  { id: "a", name: "Inline in the row", idea: "Select a line, Edit, and the row becomes two fields with Save / Cancel. Closest to the spec and stays in place; the row grows while editing." },
  { id: "b", name: "Popover from the amount", idea: "Click any billed amount to edit that line in a small popover. No row change and no selecting first; the amount being a button is less obvious." },
  { id: "c", name: "Side sheet with the invoice line", idea: "Edit opens the right panel with the line as printed on the invoice above the fields. Best for checking against the source; one more step away from the row." },
];

export function LineEditorLab() {
  const v = useSearchParams().get("v") ?? undefined;
  const current = pickVariation(LINE_VARIATIONS, v);
  const data = useMemo(() => scenarioALines(), []);
  const [last, setLast] = useState<{ lineNo: number; change: LineChange }>();
  const onSave = (key: string, change: LineChange) => setLast({ lineNo: data.lines.find((l) => l.key === key)!.lineNo, change });
  const first = data.rows[0].key;
  return (
    <LabShell title="Line editor" variations={LINE_VARIATIONS} current={current}>
      <div key={current.id}>
        {current.id === "a" && <InlineLineEditor rows={data.rows} lines={data.lines} onSave={onSave} initialSelected={first} />}
        {current.id === "b" && <PopoverLineEditor rows={data.rows} lines={data.lines} onSave={onSave} />}
        {current.id === "c" && (
          <SheetLineEditor rows={data.rows} lines={data.lines} quotes={data.quotes} invoiceTitle={data.invoiceTitle} onSave={onSave} initialSelected={first} />
        )}
      </div>
      <p className="mt-3 text-xs text-ink-3">
        {last
          ? `Live, this writes charge_edited for line ${last.lineNo}: “${last.change.description}”, ${last.change.amountCents} cents, as clerk.`
          : "Live, Save writes charge_edited (as clerk) and rechecks the case."}
      </p>
    </LabShell>
  );
}
