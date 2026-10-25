// New case at 1280: name the shipment, add the forwarder invoice (required) and what was agreed
// (helpful), read the documents, then check the invoice. One card, one main button per step.
// Presentational: reading goes through `onRead`; without it (replay) nothing is read and the
// flow says so, offering the recorded cases instead.
import { useRef, useState } from "react";
import { cx } from "@/components/case/cx";
import { INPUT } from "@/components/inputs/fields";
import {
  NEW_CASE_COPY as T, RECORDED_EXAMPLES, defaultTitle, describeDoc, detectType, invoiceCharges, placeDocs, readySummary, splitPastes, startBlock,
  toDraft, type NewCaseDocument, type NewCaseDraft, type PendingDoc, type ReadDocument, type ReadResult, type RecordedExample,
} from "./model";
import {
  DocRow, DropArea, ExampleButtons, ExampleList, FailedNote, Primary, ReadStatus, Secondary, SectionTitle, TEXT_BUTTON,
  TypeSelect, fileToDoc,
} from "./parts";

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
};

type Stage = "start" | "reading";
type DocSet = { invoice?: PendingDoc; agreements: PendingDoc[] };

const strip = ({ type, title, text, file }: PendingDoc): NewCaseDocument => (file ? { type, title, text, file } : { type, title, text });

export function NewCaseFlow({ onCancel, onLoadExample, onCreate, onRead, examples = RECORDED_EXAMPLES }: NewCaseFlowProps) {
  const replay = !onRead;
  const [stage, setStage] = useState<Stage>("start");
  const [name, setName] = useState("");
  const [docSet, setDocSet] = useState<DocSet>({ agreements: [] });
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

  /** Text still sitting in a paste box counts: it is added before reading starts. */
  function startReading(pending: PendingDoc[]) {
    const next = placeDocs(docSet, pending);
    setDocSet(next);
    const all = next.invoice ? [next.invoice, ...next.agreements] : next.agreements;
    if (startBlock(all)) return;
    const id = ++run.current;
    setResults({});
    setStage("reading");
    all.forEach((d) => read(d, id));
  }

  function backToStart() { run.current++; setResults({}); setStage("start"); }

  function readAgain(doc: PendingDoc, text: string) {
    const fixed = { ...describeDoc(text, { as: doc.type }), key: doc.key, title: doc.title };
    setDocSet((cur) => cur.invoice?.key === doc.key
      ? { ...cur, invoice: fixed }
      : { ...cur, agreements: cur.agreements.map((d) => (d.key === doc.key ? fixed : d)) });
    read(fixed);
  }

  const settled = docs.every((d) => results[d.key]);
  const charges = invoiceCharges(invoice && results[invoice.key]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-start justify-between gap-6 px-6 pb-3 pt-3.5">
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

      <div className="grid grid-cols-[minmax(0,1fr)_300px] items-start gap-4 px-6 pb-6">
        <section aria-label={T.heading} className="rounded-xl border border-line bg-surface shadow-card">
          {stage === "start"
            ? <StartStep {...{ name, setName, docSet, setDocSet, addDocs }} onNext={startReading} />
            : (
              <ReadingStep docs={docs} results={results} replay={replay} settled={settled} charges={charges}
                examples={examples} onLoadExample={onLoadExample} onEdit={backToStart} onReadAgain={readAgain}
                onCheck={() => onCreate(toDraft(name, docs))} />
            )}
        </section>

        {stage === "start" && examples.length > 0 && (
          <aside aria-label={T.examples} className="rounded-xl border border-line bg-surface px-4 pb-1.5 pt-3.5 shadow-card">
            <h2 className="text-body font-semibold text-ink">{T.examples}</h2>
            <p className="mb-1 text-meta text-ink-3">{T.examplesBody}</p>
            <ExampleList examples={examples} onLoad={onLoadExample} />
          </aside>
        )}
      </div>
    </div>
  );
}

type StartProps = {
  name: string; setName: (s: string) => void;
  docSet: DocSet; setDocSet: (f: (cur: DocSet) => DocSet) => void;
  addDocs: (d: PendingDoc[]) => void; onNext: (pending: PendingDoc[]) => void;
};

function StartStep({ name, setName, docSet: { invoice, agreements }, setDocSet, addDocs, onNext }: StartProps) {
  const setInvoice = (d?: PendingDoc) => setDocSet((cur) => ({ ...cur, invoice: d }));
  const setAgreements = (f: (a: PendingDoc[]) => PendingDoc[]) => setDocSet((cur) => ({ ...cur, agreements: f(cur.agreements) }));
  const [pastingInvoice, setPastingInvoice] = useState(false);
  const [invoiceText, setInvoiceText] = useState("");
  const [pasted, setPasted] = useState("");
  const invoiceWaiting = !!invoiceText.trim() || splitPastes(pasted).some((t) => detectType(t) === "freight_invoice");
  const block = invoice || invoiceWaiting ? undefined : T.needInvoice;
  const files = async (list: File[], as?: "freight_invoice") => addDocs(await Promise.all(list.map((f) => fileToDoc(f, as))));

  function addInvoiceText() {
    if (!invoiceText.trim()) return;
    setInvoice(describeDoc(invoiceText, { as: "freight_invoice" }));
    setInvoiceText(""); setPastingInvoice(false);
  }

  function next() {
    const pending = [
      ...(invoiceText.trim() ? [describeDoc(invoiceText, { as: "freight_invoice" })] : []),
      ...splitPastes(pasted).map((t) => describeDoc(t)),
    ];
    setInvoiceText(""); setPastingInvoice(false); setPasted("");
    onNext(pending);
  }

  function addPasted() {
    const parts = splitPastes(pasted);
    if (!parts.length) return;
    addDocs(parts.map((t) => describeDoc(t)));
    setPasted("");
  }

  return (
    <>
      <div className="grid gap-1 px-5 pb-4 pt-4">
        <label htmlFor="new-case-name" className="text-row font-semibold text-ink">{T.name}</label>
        <input id="new-case-name" value={name} onChange={(e) => setName(e.target.value)}
          placeholder={invoice ? defaultTitle(invoice) : T.namePlaceholder} aria-describedby="new-case-name-hint"
          className={cx(INPUT, "max-w-[420px]")} />
        <p id="new-case-name-hint" className="text-meta text-ink-3">{T.nameHint}</p>
      </div>

      <div className="grid gap-2 border-t border-line px-5 py-4">
        <SectionTitle title={T.invoice} tag={T.required} id="new-case-invoice" />
        {invoice ? (
          <ul aria-labelledby="new-case-invoice">
            <DocRow doc={invoice} aside={<button type="button" onClick={() => setInvoice(undefined)} aria-label={`Remove ${invoice.title}`} className={TEXT_BUTTON}>Remove</button>} />
          </ul>
        ) : pastingInvoice ? (
          <div className="grid gap-2">
            <textarea aria-label="Invoice text" value={invoiceText} onChange={(e) => setInvoiceText(e.target.value)} rows={7} autoFocus
              placeholder={T.invoicePlaceholder} className={cx(INPUT, "resize-y py-2 leading-5")} />
            <div className="flex justify-end gap-2">
              <Secondary onClick={() => { setPastingInvoice(false); setInvoiceText(""); }}>Back</Secondary>
              <Primary disabled={!invoiceText.trim()} onClick={addInvoiceText}>Add invoice</Primary>
            </div>
          </div>
        ) : (
          <DropArea label="Invoice file" onFiles={(f) => void files(f.slice(0, 1), "freight_invoice")}>
            {(pick, over) => (
              <div className={cx("flex items-center gap-1.5 rounded-lg border bg-sunken px-4 py-5 text-[13px] text-ink-2",
                over ? "border-ink" : "border-line-strong")}>
                {T.invoiceDrop}
                <button type="button" onClick={pick} className={TEXT_BUTTON}>choose a file</button>
                <span className="text-ink-3">·</span>
                <button type="button" onClick={() => setPastingInvoice(true)} className={TEXT_BUTTON}>paste its text</button>
              </div>
            )}
          </DropArea>
        )}
      </div>

      <DropArea label="Agreement files" multiple onFiles={(f) => void files(f)}>
        {(pick, over) => (
          <div className={cx("grid gap-2 border-t px-5 py-4", over ? "border-ink bg-sunken" : "border-line")}>
            <SectionTitle title={T.agreed} tag={T.helpful} id="new-case-agreed" />
            <p className="-mt-1 text-[13px] text-ink-2">{T.agreedBody}</p>
            {agreements.length > 0 && (
              <ul aria-labelledby="new-case-agreed">
                {agreements.map((d) => (
                  <DocRow key={d.key} doc={d}
                    lead={<TypeSelect doc={d} onChange={(type) => setAgreements((a) => a.map((x) => (x.key === d.key ? { ...x, type } : x)))} />}
                    aside={<button type="button" onClick={() => setAgreements((a) => a.filter((x) => x.key !== d.key))}
                      aria-label={`Remove ${d.title}`} className={TEXT_BUTTON}>Remove</button>} />
                ))}
              </ul>
            )}
            <textarea aria-label="Agreement text" value={pasted} onChange={(e) => setPasted(e.target.value)} rows={4}
              placeholder={T.agreedPlaceholder} className={cx(INPUT, "resize-y py-2 leading-5")}
              onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); addPasted(); } }} />
            <div className="flex items-center justify-between gap-3">
              <p className="text-meta text-ink-3">
                Several at once: separate them with a line of three dashes, or{" "}
                <button type="button" onClick={pick} className={TEXT_BUTTON}>choose files</button>.
              </p>
              <Secondary onClick={addPasted}>Add</Secondary>
            </div>
          </div>
        )}
      </DropArea>

      <footer className="flex items-center justify-between gap-4 border-t border-line px-5 py-3">
        {block
          ? <p id="new-case-block" className="text-[13px] font-medium text-ink-2">{block}</p>
          : <p className="text-[13px] text-ink-3">{agreements.length || pasted.trim() ? "" : T.noAgreements}</p>}
        <Primary disabled={!!block} describedBy={block ? "new-case-block" : undefined} onClick={next}>{T.read}</Primary>
      </footer>
    </>
  );
}

type ReadingProps = {
  docs: PendingDoc[]; results: Record<string, ReadResult>; replay: boolean; settled: boolean; charges: number;
  examples: RecordedExample[]; onLoadExample: (id: string) => void; onEdit: () => void;
  onReadAgain: (doc: PendingDoc, text: string) => void; onCheck: () => void;
};

function ReadingStep({ docs, results, replay, settled, charges, examples, onLoadExample, onEdit, onReadAgain, onCheck }: ReadingProps) {
  const heading = replay ? `${docs.length} ${docs.length === 1 ? "document" : "documents"} added`
    : settled ? "Ready to check" : `Reading ${docs.length} ${docs.length === 1 ? "document" : "documents"}`;
  const block = replay ? undefined : !settled ? "Waiting for every document to be read." : charges === 0 ? T.noCharges : undefined;

  return (
    <>
      <div className="px-5 pb-1 pt-4">
        <h2 className="text-panel font-[650] text-ink">{heading}</h2>
        <ul aria-label="Documents" className="mt-1.5">
          {docs.map((d) => {
            const r = results[d.key];
            return (
              <DocRow key={d.key} doc={d} aside={<ReadStatus doc={d} result={r} replay={replay} />}>
                {!replay && r?.kind === "failed" && <FailedNote doc={d} where={r.where} onReadAgain={(t) => onReadAgain(d, t)} />}
              </DocRow>
            );
          })}
        </ul>
      </div>

      {replay ? (
        <div className="mx-5 mb-5 mt-2 rounded-lg bg-sunken px-4 py-3.5">
          <p className="text-body font-semibold text-ink">{T.replayTitle}</p>
          <p className="mb-3 mt-0.5 text-[13px] text-ink-2">{T.replayBody}</p>
          <div className="flex items-center justify-between gap-3">
            <ExampleButtons examples={examples} onLoad={onLoadExample} />
            <button type="button" onClick={onEdit} className={TEXT_BUTTON}>{T.edit}</button>
          </div>
        </div>
      ) : (
        <footer className="mt-2 flex items-center justify-between gap-4 border-t border-line px-5 py-3">
          {block
            ? <p id="new-case-check-block" className="text-[13px] font-medium text-ink-2">{block}</p>
            : <p className="text-body font-semibold text-ink">{readySummary(docs, results)}</p>}
          <div className="flex flex-none gap-2">
            <Secondary onClick={onEdit}>{T.edit}</Secondary>
            <Primary disabled={!!block} describedBy={block ? "new-case-check-block" : undefined} onClick={onCheck}>{T.check}</Primary>
          </div>
        </footer>
      )}
    </>
  );
}
