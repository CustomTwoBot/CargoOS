// Line editor B: the billed amount is the control. Clicking it opens a small popover with the
// two fields; the row itself never changes shape.
import { Popover } from "@base-ui/react/popover";
import { useRef } from "react";
import { money } from "@/components/case/format";
import type { Row } from "@/components/case/view-model";
import { LINE_COPY, useLineEditor, useLines, type EditableLine, type LineChange } from "./line-edit";
import { LineFields, SaveCancel, SavedNote } from "./fields";
import { LineRow, LinesCard } from "./line-rows";

type Props = { rows: Row[]; lines: EditableLine[]; onSave?: (key: string, change: LineChange) => void };

export function PopoverLineEditor({ rows, lines: initial, onSave }: Props) {
  const { lines, edited, save } = useLines(initial, onSave);
  return (
    <LinesCard>
      {rows.map((r) => (
        <PopoverRow key={r.key} r={r} line={lines.find((l) => l.key === r.key)!} edited={edited.has(r.key)} onSave={save} />
      ))}
    </LinesCard>
  );
}

type RowProps = { r: Row; line: EditableLine; edited: boolean; onSave: (key: string, c: LineChange) => void };

function PopoverRow({ r, line, edited, onSave }: RowProps) {
  const ed = useLineEditor(line, onSave);
  const amountRef = useRef<HTMLInputElement>(null);
  return (
    <LineRow r={r} line={line} edited={edited}
      below={ed.saved && <SavedNote saved={ed.saved} className="mt-1.5" />}
      billed={
        <Popover.Root open={ed.open} onOpenChange={(open) => (open ? ed.start() : ed.cancel())}>
          <Popover.Trigger aria-label={`${LINE_COPY.edit} line ${r.lineNo}, ${money(line.amountCents)}`}
            className="group -mr-1.5 inline-flex items-center gap-1 rounded-[7px] px-1.5 decoration-line-strong decoration-dashed underline-offset-4 hover:bg-sunken hover:underline data-[popup-open]:bg-sunken">
            <PencilIcon />{money(line.amountCents)}
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Positioner side="bottom" align="end" sideOffset={6} className="z-50">
              <Popover.Popup initialFocus={amountRef} className="w-[340px] rounded-lg border border-line bg-surface p-3.5 text-left shadow-[0_12px_32px_rgba(0,0,0,.16)] outline-none">
                <Popover.Title className="mb-2.5 text-[13px] font-semibold text-ink">Line {r.lineNo}</Popover.Title>
                <LineFields ed={ed} autoFocus={false} amountRef={amountRef} />
                <div className="mt-3 flex justify-end"><SaveCancel ed={ed} /></div>
              </Popover.Popup>
            </Popover.Positioner>
          </Popover.Portal>
        </Popover.Root>
      } />
  );
}

const PencilIcon = () => (
  <svg viewBox="0 0 20 20" width={13} height={13} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"
    strokeLinejoin="round" aria-hidden="true" className="block flex-none text-ink-3 opacity-0 group-hover:opacity-100 group-data-[popup-open]:opacity-100">
    <path d="M13.5 3.5l3 3L7 16H4v-3z" />
  </svg>
);
