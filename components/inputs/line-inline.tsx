// Line editor: inline in the row (docs/design.md §7.5). "Edit" on the selected row turns the
// row into a description field and an amount field, with Save / Cancel under them.
import { useState } from "react";
import type { Row } from "@/components/case/view-model";
import { useLineEditor, useLines, type EditableLine, type LineChange } from "./line-edit";
import { LineFields, SaveCancel, SavedNote } from "./fields";
import { EditLink, LineRow, LinesCard } from "./line-rows";

type Props = { rows: Row[]; lines: EditableLine[]; onSave?: (key: string, change: LineChange) => void; initialSelected?: string };

export function InlineLineEditor({ rows, lines: initial, onSave, initialSelected }: Props) {
  const { lines, edited, save } = useLines(initial, onSave);
  const [selected, setSelected] = useState(initialSelected);
  return (
    <LinesCard>
      {rows.map((r) => (
        <InlineRow key={r.key} r={r} line={lines.find((l) => l.key === r.key)!} edited={edited.has(r.key)}
          selected={selected === r.key} onSelect={() => setSelected(r.key)} onSave={save} />
      ))}
    </LinesCard>
  );
}

type RowProps = { r: Row; line: EditableLine; edited: boolean; selected: boolean; onSelect: () => void; onSave: (key: string, c: LineChange) => void };

function InlineRow({ r, line, edited, selected, onSelect, onSave }: RowProps) {
  const ed = useLineEditor(line, onSave);
  if (ed.open) return (
    <LineRow r={r} line={line} selected replace={
      <div className="grid gap-2.5" onClick={(e) => e.stopPropagation()}>
        <LineFields ed={ed} layout="row" />
        <SaveCancel ed={ed} />
      </div>
    } />
  );
  return (
    <LineRow r={r} line={line} edited={edited} selected={selected} onSelect={onSelect}
      below={<>
        {ed.saved && <SavedNote saved={ed.saved} className="mt-1.5" />}
        {selected && <EditLink onClick={ed.start} />}
      </>} />
  );
}
