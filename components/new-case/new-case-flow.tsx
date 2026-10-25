// New case at 1280: name the shipment, drop the documents on four typed targets (the invoice is
// required), read them ("Reading documents… 2 of 4"), then check the invoice. One card, one main
// button per step. Presentational: reading goes through `onRead`; without it (replay) nothing is
// read and the flow says so, offering the recorded cases instead.
import { useRef, useState } from "react";
import { cx } from "@/components/case/cx";
import { INPUT } from "@/components/inputs/fields";
import { DropTargets, pastedDocs, type PasteDraft } from "./drop-targets";
import {
  NEW_CASE_COPY as T, RECORDED_EXAMPLES, defaultTitle, describeDoc, invoiceCharges, placeDocs, readySummary, startBlock,
  toDraft, toReadingItem, type NewCaseDocType, type NewCaseDocument, type NewCaseDraft, type PendingDoc, type ReadDocument,
  type ReadResult, type RecordedExample,
} from "./model";
import { DocRow, ExampleButtons, ExamplesCard, PhoneCard, Primary, Secondary, TEXT_BUTTON, TypeSelect } from "./parts";
import { ReadingProgress } from "./reading-progress";

export type NewCaseFlowProps = {
  onCancel: () => void;
  /** Opens a recorded case by its DemoCase id. */
  onLoadExample: (id: string) => void;
  /** The case to create and check, after every document was read. */
  onCreate: (draft: NewCaseDraft) => void;
  /** Reads one document live. Leave it out in replay. */
  onRead?: ReadDocument;
  /** Recorded cases to offer; defaults to Scenario A and the 3-container case. */
  examples?: RecordedExample[];
  /** The phone uploader for this case (`/upload/[caseId]`); shows the QR card when given. */
  uploadUrl?: string;
};

type Stage = "start" | "reading";
type DocSet = { invoice?: PendingDoc; agreements: PendingDoc[] };

const strip = ({ type, title, text, file }: PendingDoc): NewCaseDocument => (file ? { type, title, text, file } : { type, title, text });

export function NewCaseFlow({ onCancel, onLoadExample, onCreate, onRead, examples = RECORDED_EXAMPLES, uploadUrl }: NewCaseFlowProps) {
  const replay = !onRead;
  const [stage, setStage] = useState<Stage>("start");
  const [name, setName] = useState("");
  const [docSet, setDocSet] = useState<DocSet>({ agreements: [] });
  const [paste, setPaste] = useState<PasteDraft>();
  const [results, setResults] = useState<Record<string, ReadResult>>({});
  const run = useRef(0);

  const { invoice, agreements } = docSet;
  const docs = invoice ? [invoice, ...agreements] : agreements;
  const addDocs = (added: PendingDoc[]) => setDocSet((cur) => placeDocs(cur, added));

  function read(doc: PendingDoc, id = run.current) {
    if (!onRead) return;
    setResults((r) => Object.fromEntries(Object.entries(r).filter(([k]) => k !== doc.key)));
    onRead(strip(doc))
      .catch((): ReadResult => ({ kind: "failed" }))
      .then((r) => { if (run.current === id) setResults((all) => ({ ...all, [doc.key]: r })); });
  }

  /** Text still sitting in the paste box counts: it is added before reading starts. */
  function startReading() {
    const next = placeDocs(docSet, pastedDocs(paste));
    const all = next.invoice ? [next.invoice, ...next.agreements] : next.agreements;
    if (startBlock(all)) return;
    setDocSet(next);
    setPaste(undefined);
    const id = ++run.current;
    setResults({});
    setStage("reading");
    all.forEach((d) => read(d, id));
  }

  function backToStart() { run.current++; setResults({}); setStage("start"); }

  function readAgain(key: string, text: string) {
    const doc = docs.find((d) => d.key === key);
    if (!doc) return;
    const fixed = { ...describeDoc(text, { as: doc.type }), key, title: doc.title };
    setDocSet((cur) => cur.invoice?.key === key
      ? { ...cur, invoice: fixed }
      : { ...cur, agreements: cur.agreements.map((d) => (d.key === key ? fixed : d)) });
    read(fixed);
  }

  const counts: Partial<Record<NewCaseDocType, number>> = {};
  for (const d of docs) counts[d.type] = (counts[d.type] ?? 0) + 1;
  const pastingInvoice = paste?.type === "freight_invoice" && !!paste.text.trim();
  const block = pastingInvoice ? undefined : startBlock(docs);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-start justify-between gap-6 px-4 pb-3 pt-3.5 md:px-6">
        <div>
          <h1 className="flex items-center gap-2.5 text-title font-[650] tracking-[-0.012em]">
            {T.heading}
            {replay && (
              <span title="Replay of a recorded run. Nothing here reaches the backend or Claude."
                className="rounded-full border border-line-strong px-2 text-xs font-semibold leading-5 text-ink-2">Replay</span>
            )}
          </h1>
          <p className="mt-0.5 text-[13px] text-ink-2">{T.sub} <span className="text-ink-3">{T.trust}</span></p>
        </div>
        <Secondary onClick={onCancel}>{T.cancel}</Secondary>
      </header>

      <div className="grid grid-cols-1 items-start gap-4 px-4 pb-6 md:px-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <section aria-label={T.heading} className="rounded-xl border border-line bg-surface shadow-card">
          {stage === "start" ? (
            <>
              <div className="grid gap-1 px-5 pb-4 pt-4">
                <label htmlFor="new-case-name" className="text-row font-semibold text-ink">{T.name}</label>
                <input id="new-case-name" value={name} onChange={(e) => setName(e.target.value)}
                  placeholder={invoice ? defaultTitle(invoice) : T.namePlaceholder} aria-describedby="new-case-name-hint"
                  className={cx(INPUT, "max-w-[420px]")} />
                <p id="new-case-name-hint" className="text-meta text-ink-3">{T.nameHint}</p>
              </div>

              <div className="grid gap-3 border-t border-line px-5 py-4">
                <div>
                  <h2 className="text-row font-semibold text-ink">{T.documents}</h2>
                  <p className="text-[13px] text-ink-2">{T.documentsBody}</p>
                </div>
                <DropTargets onAdd={addDocs} counts={counts} paste={paste} onPaste={setPaste} />
                {docs.length > 0 && (
                  <ul aria-label="Added documents">
                    {invoice && <DocRow doc={invoice} aside={<Remove doc={invoice} onRemove={() => setDocSet((c) => ({ ...c, invoice: undefined }))} />} />}
                    {agreements.map((d) => (
                      <DocRow key={d.key} doc={d}
                        lead={<TypeSelect doc={d} onChange={(type) => setDocSet((c) => ({ ...c, agreements: c.agreements.map((x) => (x.key === d.key ? { ...x, type } : x)) }))} />}
                        aside={<Remove doc={d} onRemove={() => setDocSet((c) => ({ ...c, agreements: c.agreements.filter((x) => x.key !== d.key) }))} />} />
                    ))}
                  </ul>
                )}
              </div>

              <footer className="flex items-center justify-between gap-4 border-t border-line px-5 py-3">
                {block
                  ? <p id="new-case-block" className="text-[13px] font-medium text-ink-2">{block}</p>
                  : <p className="text-[13px] text-ink-3">{agreements.length || (paste && !pastingInvoice) ? "" : T.noAgreements}</p>}
                <Primary disabled={!!block} describedBy={block ? "new-case-block" : undefined} onClick={startReading}>{T.read}</Primary>
              </footer>
            </>
          ) : replay ? (
            <ReplayStep docs={docs} examples={examples} onLoadExample={onLoadExample} onEdit={backToStart} />
          ) : (
            <ReadingStep docs={docs} results={results} onEdit={backToStart} onReadAgain={readAgain}
              onCheck={() => onCreate(toDraft(name, docs))} />
          )}
        </section>

        {stage === "start" && (uploadUrl || examples.length > 0) && (
          <div className="grid gap-4">
            {uploadUrl && <PhoneCard url={uploadUrl} />}
            {examples.length > 0 && <ExamplesCard examples={examples} onLoad={onLoadExample} />}
          </div>
        )}
      </div>
    </div>
  );
}

const Remove = ({ doc, onRemove }: { doc: PendingDoc; onRemove: () => void }) => (
  <button type="button" onClick={onRemove} aria-label={`Remove ${doc.title}`} className={TEXT_BUTTON}>Remove</button>
);

function ReplayStep({ docs, examples, onLoadExample, onEdit }: {
  docs: PendingDoc[]; examples: RecordedExample[]; onLoadExample: (id: string) => void; onEdit: () => void;
}) {
  return (
    <>
      <div className="px-5 pb-1 pt-4">
        <h2 className="text-panel font-[650] text-ink">{docs.length} {docs.length === 1 ? "document" : "documents"} added</h2>
        <ul aria-label="Documents" className="mt-1.5">
          {docs.map((d) => <DocRow key={d.key} doc={d} aside={<span className="flex-none text-[13px] text-ink-3">{T.notRead}</span>} />)}
        </ul>
      </div>
      <div className="mx-5 mb-5 mt-2 rounded-lg bg-sunken px-4 py-3.5">
        <p className="text-body font-semibold text-ink">{T.replayTitle}</p>
        <p className="mb-3 mt-0.5 text-[13px] text-ink-2">{T.replayBody}</p>
        <div className="flex items-center justify-between gap-3">
          <ExampleButtons examples={examples} onLoad={onLoadExample} />
          <button type="button" onClick={onEdit} className={TEXT_BUTTON}>{T.edit}</button>
        </div>
      </div>
    </>
  );
}

function ReadingStep({ docs, results, onEdit, onReadAgain, onCheck }: {
  docs: PendingDoc[]; results: Record<string, ReadResult>; onEdit: () => void;
  onReadAgain: (key: string, text: string) => void; onCheck: () => void;
}) {
  const items = docs.map((d) => toReadingItem(d, results[d.key]));
  const settled = items.every((i) => i.state !== "reading");
  const block = !settled ? "Waiting for every document to be read." : invoiceCharges(items) === 0 ? T.noCharges : undefined;
  return (
    <>
      <div className="px-5 pb-1 pt-4">
        <ReadingProgress items={items} onPasteInstead={onReadAgain} />
      </div>
      <footer className="mt-2 flex items-center justify-between gap-4 border-t border-line px-5 py-3">
        {block
          ? <p id="new-case-check-block" className="text-[13px] font-medium text-ink-2">{block}</p>
          : <p className="text-body font-semibold text-ink">{readySummary(items)}</p>}
        <div className="flex flex-none gap-2">
          <Secondary onClick={onEdit}>{T.edit}</Secondary>
          <Primary disabled={!!block} describedBy={block ? "new-case-check-block" : undefined} onClick={onCheck}>{T.check}</Primary>
        </div>
      </footer>
    </>
  );
}
