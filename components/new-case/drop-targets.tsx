// Four large drop targets, one per document type (SPEC.md §8 "Empty case"): Invoice, Quote, Email,
// Chat. Several files at once on any of them; files dropped between the targets get a type from
// their name or text. "paste text" opens one paste box under the targets for that type.
import { cx } from "@/components/case/cx";
import { INPUT } from "@/components/inputs/fields";
import { DROP_TARGETS, NEW_CASE_COPY as T, TYPE_LABEL, describeDoc, splitPastes, type NewCaseDocType, type PendingDoc } from "./model";
import { DropArea, Primary, Secondary, TEXT_BUTTON } from "./parts";

/** Text sitting in the paste box, and the type it will get. */
export type PasteDraft = { type: NewCaseDocType; text: string };

/** Turns the paste box into documents of its type. Several pastes split on a line of dashes. */
export const pastedDocs = (p: PasteDraft | undefined): PendingDoc[] =>
  p ? splitPastes(p.text).map((t) => describeDoc(t, { as: p.type })) : [];

type Props = {
  onAdd: (docs: PendingDoc[]) => void;
  /** How many documents of each type are already in; shown on the target. */
  counts?: Partial<Record<NewCaseDocType, number>>;
  paste: PasteDraft | undefined;
  onPaste: (p: PasteDraft | undefined) => void;
  /** Taller targets for the empty case, where they are the whole screen. */
  large?: boolean;
};

export function DropTargets({ onAdd, counts = {}, paste, onPaste, large }: Props) {
  const target = paste && DROP_TARGETS.find((t) => t.type === paste.type);
  const addPasted = () => {
    const docs = pastedDocs(paste);
    if (!docs.length) return;
    onAdd(docs);
    onPaste(undefined);
  };

  return (
    <DropArea label="Files" onDocs={onAdd}>
      {() => (
        <div className="grid gap-3">
          <div className="grid grid-cols-4 gap-2.5">
            {DROP_TARGETS.map((t) => {
              const n = counts[t.type] ?? 0;
              const label = TYPE_LABEL[t.type];
              return (
                <DropArea key={t.type} label={`${label} files`} as={t.type} onDocs={onAdd}
                  className={(over) => cx("flex flex-col rounded-lg border px-3.5 py-3", large ? "min-h-[200px]" : "min-h-[132px]",
                    over ? "border-ink bg-surface" : paste?.type === t.type ? "border-ink-3 bg-sunken" : "border-line-strong bg-sunken")}>
                  {(pick) => (
                    <section aria-label={label} className="flex flex-1 flex-col">
                      <div className="flex items-baseline justify-between gap-2">
                        <h3 className="text-row font-semibold text-ink">{label}</h3>
                        {t.type === "freight_invoice" && <span className="text-meta font-medium text-ink-3">{T.required}</span>}
                      </div>
                      <p className="text-meta text-ink-3">{t.formats}</p>
                      <div className="mt-auto pt-3">
                        {n > 0 && <p className="text-[13px] font-semibold text-ink-2">{T.added} {n}</p>}
                        <p className="text-[13px] text-ink-3">{T.drop}</p>
                        <p className="text-[13px]">
                          <button type="button" onClick={pick} aria-label={`Choose ${label.toLowerCase()} files`} className={TEXT_BUTTON}>{T.choose}</button>
                          <span className="text-ink-3"> · </span>
                          <button type="button" onClick={() => onPaste({ type: t.type, text: "" })}
                            aria-label={`Paste ${label.toLowerCase()} text`} className={TEXT_BUTTON}>{T.pasteText}</button>
                        </p>
                      </div>
                    </section>
                  )}
                </DropArea>
              );
            })}
          </div>

          {paste && target && (
            <div className="grid gap-2">
              <textarea aria-label={`${TYPE_LABEL[paste.type]} text`} value={paste.text} rows={6} autoFocus
                onChange={(e) => onPaste({ ...paste, text: e.target.value })} placeholder={target.paste}
                onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); addPasted(); } }}
                className={cx(INPUT, "resize-y py-2 leading-5")} />
              <div className="flex items-center justify-between gap-3">
                <p className="text-meta text-ink-3">{T.severalHint}</p>
                <div className="flex gap-2">
                  <Secondary onClick={() => onPaste(undefined)}>{T.cancel}</Secondary>
                  <Primary disabled={!paste.text.trim()} onClick={addPasted}>{`Add ${TYPE_LABEL[paste.type].toLowerCase()}`}</Primary>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </DropArea>
  );
}
