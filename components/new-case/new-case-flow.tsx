// New case, like a new chat (docs/design.md §0.4 п.6): the same two panes as a case. On the canvas a
// big drop zone for the invoice and everything that was agreed, a paste box, the phone QR and the
// recorded examples; on the CargoOS side the conversation starts: "Reading 4 documents…" with a
// tick per file, then the check. Live, reading goes through `onRead`. In replay nothing is read:
// Load example plays the reading of a recorded case's documents, then opens it.
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { DocType } from "@/lib/types";
import { cx } from "@/components/case/cx";
import { INPUT } from "@/components/inputs/fields";
import {
  NEW_CASE_COPY as T, RECORDED_EXAMPLES, describeDoc, invoiceCharges, placeDocs, readySummary, splitPastes, startBlock,
  toDraft, toReadingItem, type NewCaseDocument, type NewCaseDraft, type PendingDoc, type ReadDocument, type ReadResult,
  type ReadingItem, type RecordedExample,
} from "./model";
import { DocRow, DropArea, PhoneCard, Primary, Secondary, TEXT_BUTTON, TypeSelect } from "./parts";
import { ReadingProgress } from "./reading-progress";

export type NewCaseFlowProps = {
  /** Opens a recorded case by its DemoCase id. */
  onLoadExample: (id: string) => void;
  /** The case to create and check, after every document was read. */
  onCreate: (draft: NewCaseDraft) => void;
  /** Reads one document live. Leave it out in replay. */
  onRead?: ReadDocument;
  /** Recorded cases to offer; defaults to Scenario A and the 3-container case. */
  examples?: RecordedExample[];
  /** Each recorded case's documents, so Load example can show them being read. */
  exampleDocs?: Record<string, { title: string; type: DocType }[]>;
  /** The phone uploader for this case (`/upload/[caseId]`); shows the QR card when given. */
  uploadUrl?: string;
};

type DocSet = { invoice?: PendingDoc; agreements: PendingDoc[] };
/** A recorded case being "read" in replay: how many of its documents are done. */
type Playing = { id: string; docs: { title: string; type: DocType }[]; done: number };

/** Time per document while a recorded case plays its reading, and the pause before it opens. */
export const PLAY_STEP_MS = 450;
export const PLAY_OPEN_MS = 700;

const strip = ({ type, title, text, file }: PendingDoc): NewCaseDocument => (file ? { type, title, text, file } : { type, title, text });
const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

export function NewCaseFlow({ onLoadExample, onCreate, onRead, examples = RECORDED_EXAMPLES, exampleDocs = {}, uploadUrl }: NewCaseFlowProps) {
  const replay = !onRead;
  const [docSet, setDocSet] = useState<DocSet>({ agreements: [] });
  const [paste, setPaste] = useState<string>();
  const [reading, setReading] = useState(false);
  const [results, setResults] = useState<Record<string, ReadResult>>({});
  const [playing, setPlaying] = useState<Playing>();
  const run = useRef(0);

  const { invoice, agreements } = docSet;
  const docs = invoice ? [invoice, ...agreements] : agreements;
  const addDocs = (added: PendingDoc[]) => setDocSet((cur) => placeDocs(cur, added));
  const pasted = () => (paste ? splitPastes(paste).map((t) => describeDoc(t)) : []);

  // A recorded case reads its documents one by one, then opens.
  useEffect(() => {
    if (!playing) return;
    const t = playing.done < playing.docs.length
      ? setTimeout(() => setPlaying((p) => p && { ...p, done: p.done + 1 }), PLAY_STEP_MS)
      : setTimeout(() => onLoadExample(playing.id), PLAY_OPEN_MS);
    return () => clearTimeout(t);
  }, [playing, onLoadExample]);

  function play(id: string) {
    const recorded = exampleDocs[id];
    if (!recorded?.length) { onLoadExample(id); return; }
    run.current++;
    setReading(false);
    setPlaying({ id, docs: recorded, done: 0 });
  }

  function read(doc: PendingDoc, id = run.current) {
    if (!onRead) return;
    setResults((r) => Object.fromEntries(Object.entries(r).filter(([k]) => k !== doc.key)));
    onRead(strip(doc))
      .catch((): ReadResult => ({ kind: "failed" }))
      .then((r) => { if (run.current === id) setResults((all) => ({ ...all, [doc.key]: r })); });
  }

  /** Text still in the paste box counts: it is added before reading starts. */
  function startReading() {
    const next = placeDocs(docSet, pasted());
    const all = next.invoice ? [next.invoice, ...next.agreements] : next.agreements;
    if (startBlock(all)) return;
    setDocSet(next);
    setPaste(undefined);
    const id = ++run.current;
    setResults({});
    setReading(true);
    all.forEach((d) => read(d, id));
  }

  function backToStart() { run.current++; setResults({}); setReading(false); }

  function readAgain(key: string, text: string) {
    const doc = docs.find((d) => d.key === key);
    if (!doc) return;
    const fixed = { ...describeDoc(text, { as: doc.type }), key, title: doc.title };
    setDocSet((cur) => cur.invoice?.key === key
      ? { ...cur, invoice: fixed }
      : { ...cur, agreements: cur.agreements.map((d) => (d.key === key ? fixed : d)) });
    read(fixed);
  }

  const block = paste?.trim() ? startBlock([...docs, ...pasted()]) : startBlock(docs);
  const busy = reading || !!playing;

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-surface">
      <header className="flex h-[60px] flex-none items-center justify-between gap-4 border-b border-line px-4 md:px-6">
        <div className="min-w-0">
          <h1 className="truncate text-[17px] font-[650] tracking-[-0.01em]">{T.heading}</h1>
          <p className="truncate text-meta text-ink-3">{T.sub} {T.trust}</p>
        </div>
        {replay && (
          <span title="Replay of a recorded run. Nothing here reaches the backend or Claude."
            className="flex-none rounded-full border border-line-strong px-2.5 py-0.5 text-xs font-semibold text-ink-2">Replay</span>
        )}
      </header>

      <div className="flex min-h-0 flex-1 max-lg:flex-col max-lg:overflow-y-auto">
        <section aria-label="Documents" className="min-w-0 flex-1 bg-bg px-4 pb-10 pt-6 max-lg:flex-none md:px-7 lg:overflow-y-auto">
          <div className="mx-auto grid max-w-[760px] gap-4">
            {playing ? (
              <Card>
                <h2 className="text-row font-semibold text-ink">{plural(playing.docs.length, "document")}</h2>
                <ul aria-label="Added documents" className="mt-1.5">
                  {playing.docs.map((d) => <li key={d.title} className="border-t border-line py-2 text-body text-ink first:border-t-0">{d.title}</li>)}
                </ul>
              </Card>
            ) : (
              <>
                <DropArea label="Files" onDocs={addDocs}
                  className={(over) => cx("rounded-[14px] border-2 border-dashed px-6 py-10 text-center",
                    over ? "border-ink bg-surface" : "border-line-strong bg-surface")}>
                  {(pick) => (
                    <div className="mx-auto max-w-[460px]">
                      <h2 className="text-[19px] font-[650] leading-[26px] tracking-[-0.01em] text-ink">{T.dropTitle}</h2>
                      <p className="mt-1.5 text-[13.5px] text-ink-2">{T.dropBody}</p>
                      <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
                        <Secondary onClick={pick}>{T.chooseFiles}</Secondary>
                        <button type="button" onClick={() => setPaste((p) => p ?? "")} className={TEXT_BUTTON}>{T.pasteBox}</button>
                      </div>
                    </div>
                  )}
                </DropArea>

                {paste !== undefined && (
                  <Card>
                    <textarea aria-label="Pasted text" value={paste} rows={6} autoFocus onChange={(e) => setPaste(e.target.value)}
                      placeholder={T.pastePlaceholder} className={cx(INPUT, "w-full resize-y py-2 leading-5")} />
                    <div className="mt-2 flex items-center justify-between gap-3">
                      <p className="text-meta text-ink-3">{T.severalHint}</p>
                      <div className="flex gap-2">
                        <Secondary onClick={() => setPaste(undefined)}>{T.cancel}</Secondary>
                        <Primary disabled={!paste.trim()} onClick={() => { addDocs(pasted()); setPaste(undefined); }}>{T.addPasted}</Primary>
                      </div>
                    </div>
                  </Card>
                )}

                {docs.length > 0 && (
                  <Card>
                    <h2 className="text-row font-semibold text-ink">{plural(docs.length, "document")}</h2>
                    <ul aria-label="Added documents" className="mt-1">
                      {docs.map((d) => (
                        <DocRow key={d.key} doc={d}
                          lead={d !== invoice ? <TypeSelect doc={d} onChange={(type) => setDocSet((c) => ({ ...c, agreements: c.agreements.map((x) => (x.key === d.key ? { ...x, type } : x)) }))} /> : undefined}
                          aside={!reading && (
                            <button type="button" onClick={() => setDocSet((c) => (d === c.invoice ? { ...c, invoice: undefined } : { ...c, agreements: c.agreements.filter((x) => x.key !== d.key) }))}
                              aria-label={`Remove ${d.title}`} className={TEXT_BUTTON}>Remove</button>
                          )} />
                      ))}
                    </ul>
                  </Card>
                )}

                <div className={cx("grid gap-4", uploadUrl && "md:grid-cols-2")}>
                  {uploadUrl && <PhoneCard url={uploadUrl} />}
                  {examples.length > 0 && (
                    <section aria-label={T.examples} className="rounded-xl border border-line bg-surface px-4 py-3.5 shadow-card">
                      <h2 className="text-body font-semibold text-ink">{T.examples}</h2>
                      <p className="text-meta text-ink-3">{T.examplesBody}</p>
                      <ul className="mt-1.5">
                        {examples.map((ex) => (
                          <li key={ex.id} className="flex items-center justify-between gap-3 border-t border-line py-2.5 first:border-t-0">
                            <span className="min-w-0">
                              <span className="block text-body font-semibold text-ink">{ex.label.replace(/^Load (the )?/, "").replace(/^./, (c) => c.toUpperCase())}</span>
                              <span className="block text-meta text-ink-3">{ex.summary}</span>
                            </span>
                            <Secondary onClick={() => play(ex.id)}>Load example</Secondary>
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}
                </div>
              </>
            )}
          </div>
        </section>

        <aside aria-label="CargoOS" className="flex min-h-0 w-[420px] flex-none flex-col border-l border-line bg-surface max-xl:w-[360px] max-lg:w-full max-lg:border-l-0 max-lg:border-t">
          <div className="border-b border-line px-[18px] pb-3 pt-3.5">
            <p className="text-[14.5px] font-[650]">CargoOS</p>
            <p className="text-meta text-ink-3">Checks every line. Asks when it can’t tell. Never pays or sends.</p>
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto px-[18px] py-4 text-body">
            <p className="leading-[21px] text-ink">{T.intro}</p>
            {playing ? (
              <ReadingProgress notes={false} title={playing.done < playing.docs.length ? `Reading ${plural(playing.docs.length, "document")}…` : `Read ${plural(playing.docs.length, "document")}. Opening the case…`}
                items={playing.docs.map((d, i): ReadingItem => ({ key: d.title, title: d.title, state: i < playing.done ? "read" : "reading" }))} />
            ) : reading && replay ? (
              <ReplayNote count={docs.length} onEdit={backToStart} />
            ) : reading ? (
              <LiveReading docs={docs} results={results} onEdit={backToStart} onReadAgain={readAgain} onCheck={() => onCreate(toDraft("", docs))} />
            ) : null}
          </div>
          {!busy && (
            <div className="flex flex-none items-center justify-between gap-3 border-t border-line px-[18px] py-3">
              {block
                ? <p id="new-case-block" className="text-[13px] text-ink-2">{block}</p>
                : <p className="text-[13px] text-ink-3">{agreements.length ? "" : T.noAgreements}</p>}
              <Primary disabled={!!block} describedBy={block ? "new-case-block" : undefined} onClick={startReading}>{T.read}</Primary>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

const Card = ({ children }: { children: ReactNode }) => (
  <section className="rounded-xl border border-line bg-surface px-4 py-3.5 shadow-card">{children}</section>
);

function ReplayNote({ count, onEdit }: { count: number; onEdit: () => void }) {
  return (
    <div className="rounded-xl border border-line bg-sunken px-3.5 py-3">
      <p className="font-semibold text-ink">{T.replayTitle}</p>
      <p className="mt-0.5 text-[13px] text-ink-2">{plural(count, "document")} added, not read. Load an example on the left to watch a full check.</p>
      <button type="button" onClick={onEdit} className={cx(TEXT_BUTTON, "mt-2")}>{T.edit}</button>
    </div>
  );
}

function LiveReading({ docs, results, onEdit, onReadAgain, onCheck }: {
  docs: PendingDoc[]; results: Record<string, ReadResult>; onEdit: () => void;
  onReadAgain: (key: string, text: string) => void; onCheck: () => void;
}) {
  const items = docs.map((d) => toReadingItem(d, results[d.key]));
  const settled = items.every((i) => i.state !== "reading");
  const block = !settled ? "Waiting for every document to be read." : invoiceCharges(items) === 0 ? T.noCharges : undefined;
  return (
    <div>
      <ReadingProgress items={items} onPasteInstead={onReadAgain} />
      <div className="mt-3 grid gap-2">
        {block
          ? <p id="new-case-check-block" className="text-[13px] text-ink-2">{block}</p>
          : <p className="font-semibold text-ink">{readySummary(items)}</p>}
        <div className="flex gap-2">
          <Primary disabled={!!block} describedBy={block ? "new-case-check-block" : undefined} onClick={onCheck}>{T.check}</Primary>
          <Secondary onClick={onEdit}>{T.edit}</Secondary>
        </div>
      </div>
    </div>
  );
}
