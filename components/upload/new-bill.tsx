"use client";
// /bills/new (U1): drop the bill and everything that was agreed, or send it from a phone through the QR code.
// Live, the first file makes the case and each file is read on the server (convex/uploads.ts); in a replay,
// the Scenario A example shows the reading and dropped files are listed but not read.
import { useQuery } from "convex/react";
import Link from "next/link";
import { useEffect, useId, useRef, useState, useSyncExternalStore, type DragEvent, type ReactNode } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useBills } from "@/components/app/bills-provider";
import { Button, Card, LinkButton } from "@/components/app/ui";
import { errorText } from "@/components/case/live-store";
import { SCENARIO_A } from "@/components/case/fixture";
import { cx } from "@/components/case/cx";
import { useHasConvex } from "@/components/convex-provider";
import { keepsFile } from "@/components/new-case/model";
import { isUploaderOnly } from "@/components/shell/person";
import {
  ACCEPT_FILES, PASTE_TYPES, billReady, billTitle, headline, iconWord, isBusy, kindLabel, pasteTitle, pasteTypeOf,
  stateLabel, stateOf, typeOfFile, type UploadDocType, type UploadRow,
} from "./kinds";
import { uploadKey, useLiveUploads, useLocalUploads } from "./live-uploads";
import { QrCode } from "./qr-code";

export const NEW_BILL_COPY = {
  title: "Drop the bill and everything that was agreed.",
  drop: "Drop files here",
  dropBody: "The invoice, the quote, emails about the price and the WhatsApp chat. PDF, .eml, .txt or a photo. CargoOS works out which is which.",
  choose: "Choose files",
  paste: "Paste text",
  example: "Use the example (Scenario A)",
  phone: "Add from a phone",
  phoneBody: "Scan with a phone camera to send a WhatsApp export, a PDF or a photo. Leo can add files but sees no amounts.",
  getLink: "Get a phone link",
  needs: "What CargoOS needs",
  needsBody: "The invoice, plus anything where a price was agreed. Missing pieces become questions, not guesses.",
  replayNote: "In this replay, new files aren't read. Use the example to see the checks.",
  ready: "Checked. Open the bill to see what is safe to pay.",
  readyUploader: "Everything is read. Maya and Sam see the results.",
  open: "Open the bill",
  startOver: "Start over",
} as const;

/** The page's origin, read on the client only (the server renders no QR code). */
const useOrigin = () => useSyncExternalStore(() => () => {}, () => window.location.origin, () => "");

/** Reads a text file for its type; PDFs and photos are typed by name. */
async function textOf(file: File): Promise<string> {
  if (keepsFile(file) || typeof file.text !== "function") return "";
  try { return await file.text(); } catch { return ""; }
}

async function describeFiles(files: File[]) {
  return Promise.all(files.map(async (file) => {
    const docType = typeOfFile(file, await textOf(file));
    return { file, docType, name: file.name };
  }));
}

export function NewBillPage() {
  const { mode } = useBills();
  const hasConvex = useHasConvex();
  return hasConvex && mode === "live" ? <LiveNewBill /> : <ReplayNewBill />;
}

// ---- replay --------------------------------------------------------------

/** Scenario A's four documents as files, and when each finishes reading (ms after "Use the example"). */
export const EXAMPLE_FILES: { name: string; type: string; docType: UploadDocType; at: number; readAt: number }[] = [
  { name: "PCL-INV-1012.pdf", type: "application/pdf", docType: "freight_invoice", at: 0, readAt: 2200 },
  { name: "Q-PCL-0902.pdf", type: "application/pdf", docType: "quote", at: 300, readAt: 2900 },
  { name: "RE Q-PCL-0902 revised.eml", type: "message/rfc822", docType: "email", at: 600, readAt: 3500 },
  { name: "WhatsApp Chat with Derek PCL.txt", type: "text/plain", docType: "chat", at: 900, readAt: 4100 },
];
const UPLOAD_MS = 600;

function ReplayNewBill() {
  const [example, setExample] = useState<UploadRow[]>([]);
  const [dropped, setDropped] = useState<UploadRow[]>([]);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const origin = useOrigin();
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const set = (key: string, state: UploadRow["state"]) => setExample((all) => all.map((r) => (r.key === key ? { ...r, state } : r)));
  const runExample = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setExample([]);
    for (const f of EXAMPLE_FILES) {
      const key = `example_${f.docType}`;
      const row: UploadRow = { key, name: f.name, docType: f.docType, kind: kindLabel(f, f.docType), icon: iconWord(f, f.docType), state: "uploading" };
      timers.current.push(
        setTimeout(() => setExample((all) => [...all.filter((r) => r.key !== key), row]), f.at),
        setTimeout(() => set(key, "reading"), f.at + UPLOAD_MS),
        setTimeout(() => set(key, "read"), f.readAt),
      );
    }
  };
  const addDropped = async (files: File[]) => {
    const described = await describeFiles(files);
    setDropped((all) => [...all, ...described.map(({ file, docType }) => ({
      key: uploadKey(), name: file.name, docType, kind: kindLabel(file, docType), icon: iconWord(file, docType), state: "not_read" as const,
    }))]);
  };
  const addPaste = (text: string, docType: UploadDocType) => {
    setDropped((all) => [...all, { key: uploadKey(), name: pasteTitle(text, docType), docType, kind: kindLabel(undefined, docType), icon: iconWord(undefined, docType), state: "not_read" }]);
  };
  const rows = [...example, ...dropped];
  const exampleDone = example.length === EXAMPLE_FILES.length && billReady(example);
  return (
    <NewBillView
      rows={rows}
      onFiles={(f) => void addDropped(f)}
      onPaste={addPaste}
      example={runExample}
      note={dropped.length > 0 ? NEW_BILL_COPY.replayNote : undefined}
      ready={exampleDone && rows.every((r) => !isBusy(r.state)) ? `/bills/${SCENARIO_A.id}` : undefined}
      phoneUrl={origin ? `${origin}/upload/demo` : undefined}
      onStartOver={() => { timers.current.forEach(clearTimeout); timers.current = []; setExample([]); setDropped([]); }}
    />
  );
}

// ---- live ----------------------------------------------------------------

function LiveNewBill() {
  const { person, toast, rememberBill } = useBills();
  const live = useLiveUploads(person);
  const local = useLocalUploads();
  const [caseId, setCaseId] = useState<Id<"cases">>();
  const creating = useRef<Promise<Id<"cases">> | null>(null);
  const ctx = useQuery(api.uploads.getUploadContext, caseId ? { caseId } : "skip");
  const origin = useOrigin();

  const ensureCase = (title: string): Promise<Id<"cases">> => {
    creating.current ??= live.createCase(title).then(
      (id) => { rememberBill(id); setCaseId(id); return id; },
      (e: unknown) => { creating.current = null; throw e; },
    );
    return creating.current;
  };
  const fail = (key: string, e: unknown) => {
    const text = errorText(e);
    local.patch(key, { state: "failed", error: text });
    toast(text);
  };

  const addFiles = async (files: File[]) => {
    const described = (await describeFiles(files)).map((d) => ({ ...d, key: uploadKey() }));
    local.add(described.map(({ key, file, docType }) => ({ key, name: file.name, docType, file, state: "uploading" })));
    let id: Id<"cases">;
    try { id = await ensureCase(billTitle(described)); } catch (e) { described.forEach((d) => fail(d.key, e)); return; }
    await Promise.all(described.map(async ({ key, file, docType }) => {
      try { local.patch(key, { docId: await live.uploadFile(id, file, docType) }); } catch (e) { fail(key, e); }
    }));
  };
  const addPaste = async (text: string, docType: UploadDocType) => {
    const key = uploadKey();
    const title = pasteTitle(text, docType);
    local.add([{ key, name: title, docType, state: "uploading" }]);
    try {
      const id = await ensureCase("New bill");
      local.patch(key, { docId: await live.pasteText(id, text, docType, title) });
    } catch (e) { fail(key, e); }
  };
  const getLink = () => { ensureCase("New bill").catch((e: unknown) => toast(errorText(e))); };

  // This device's uploads, with the server's read status once each is a document; then anything added from a phone.
  const docs = ctx?.documents ?? [];
  const mine = new Set(local.items.map((i) => i.docId).filter(Boolean));
  const rows: UploadRow[] = [
    ...local.items.map((i): UploadRow => {
      const doc = i.docId ? docs.find((d) => d._id === i.docId) : undefined;
      const base = { key: i.key, name: i.name, docType: i.docType, kind: kindLabel(i.file, i.docType), icon: iconWord(i.file, i.docType) };
      if (i.state === "failed") return { ...base, state: "failed", error: i.error };
      if (!i.docId) return { ...base, state: "uploading" };
      return { ...base, state: stateOf(doc?.readStatus), error: doc?.readError };
    }),
    ...docs.filter((d) => !mine.has(d._id) && d.type !== "reply").map((d): UploadRow => {
      const asFile = { name: d.title, type: "" };
      const docType = d.type === "reply" ? "other" : d.type;
      return { key: d._id, name: d.title, docType, kind: kindLabel(asFile, docType), icon: iconWord(asFile, docType),
        state: stateOf(d.readStatus), error: d.readError, from: "from a phone" };
    }),
  ];

  return (
    <NewBillView
      rows={rows}
      onFiles={(f) => void addFiles(f)}
      onPaste={(t, d) => void addPaste(t, d)}
      ready={caseId && billReady(rows) ? `/bills/${caseId}` : undefined}
      phoneUrl={caseId && origin ? `${origin}/upload/${caseId}` : undefined}
      onGetLink={caseId ? undefined : getLink}
    />
  );
}

// ---- the page ------------------------------------------------------------

type ViewProps = {
  rows: UploadRow[];
  onFiles: (files: File[]) => void;
  onPaste: (text: string, docType: UploadDocType) => void;
  /** Replay only: run the Scenario A example. */
  example?: () => void;
  note?: string;
  /** Where "Open the bill" goes, once every document is read and the invoice is among them. */
  ready?: string;
  phoneUrl?: string;
  onGetLink?: () => void;
  onStartOver?: () => void;
};

export function NewBillView({ rows, onFiles, onPaste, example, note, ready, phoneUrl, onGetLink, onStartOver }: ViewProps) {
  const { person } = useBills();
  return (
    <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-[18px] px-4 pb-12 pt-6 sm:px-6">
      <nav aria-label="Breadcrumb" className="flex items-center gap-3 text-[14px]">
        <Link href="/bills" className="font-semibold text-link no-underline hover:underline">← All bills</Link>
        <span aria-hidden="true" className="text-ink-4">/</span>
        <span aria-current="page" className="font-semibold text-ink">New bill</span>
      </nav>
      <h1 className="text-[30px] font-extrabold leading-[36px] tracking-[-0.035em] text-ink sm:text-hero">{NEW_BILL_COPY.title}</h1>

      <div className="flex flex-wrap items-start gap-5">
        <section aria-label="Documents" className="flex min-w-0 flex-[999_1_600px] flex-col gap-4">
          <DropZone compact={rows.length > 0} onFiles={onFiles} onPaste={onPaste} example={example} />
          {rows.length > 0 && <Rows rows={rows} note={note} onStartOver={onStartOver} />}
          {ready && (
            <Card tone="brand" className="flex flex-wrap items-center justify-between gap-4 rounded-[22px] px-[26px] py-6">
              <p className="text-[22px] font-bold leading-[28px]">{isUploaderOnly(person) ? NEW_BILL_COPY.readyUploader : NEW_BILL_COPY.ready}</p>
              {!isUploaderOnly(person) && <LinkButton variant="lime" href={ready}>{NEW_BILL_COPY.open}</LinkButton>}
            </Card>
          )}
        </section>

        <aside className="flex w-full flex-[1_1_280px] flex-col gap-3.5 sm:max-w-[340px]">
          <Card className="flex flex-col items-start gap-3 p-5">
            <h2 className="text-[15px] font-bold text-ink">{NEW_BILL_COPY.phone}</h2>
            <p className="text-[13.5px] text-ink-2">{NEW_BILL_COPY.phoneBody}</p>
            {phoneUrl ? (
              <>
                <QrCode url={phoneUrl} size={176} className="border border-line" />
                <a href={phoneUrl} target="_blank" rel="noreferrer" className="break-all text-meta text-ink-3 underline-offset-4 hover:underline">
                  {phoneUrl.replace(/^https?:\/\//, "")}
                </a>
              </>
            ) : onGetLink ? (
              <Button variant="secondary" onClick={onGetLink}>{NEW_BILL_COPY.getLink}</Button>
            ) : null}
          </Card>
          <Card className="flex flex-col gap-1.5 px-5 py-[18px]">
            <h2 className="text-[15px] font-bold text-ink">{NEW_BILL_COPY.needs}</h2>
            <p className="text-[13.5px] text-ink-2">{NEW_BILL_COPY.needsBody}</p>
          </Card>
        </aside>
      </div>
    </div>
  );
}

function DropZone({ compact, onFiles, onPaste, example }: Pick<ViewProps, "onFiles" | "onPaste" | "example"> & { compact: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [pasting, setPasting] = useState(false);
  const drag = (e: DragEvent, on: boolean) => { e.preventDefault(); setOver(on); };
  return (
    <>
      <div
        onDragOver={(e) => drag(e, true)} onDragEnter={(e) => drag(e, true)} onDragLeave={(e) => drag(e, false)}
        onDrop={(e) => { drag(e, false); const files = Array.from(e.dataTransfer?.files ?? []); if (files.length) onFiles(files); }}
        data-testid="drop-zone"
        className={cx(
          "flex flex-col items-center gap-4 rounded-[22px] border-2 border-dashed text-center transition-colors",
          over ? "border-brand bg-pay-tint" : "border-line-strong bg-surface",
          compact ? "px-6 py-7" : "px-6 py-11 sm:px-8",
        )}
      >
        {!compact && (
          <svg width="48" height="48" viewBox="0 0 48 48" aria-hidden="true">
            <rect x="10" y="6" width="24" height="32" rx="4" fill="none" strokeWidth="2.4" className="stroke-brand" />
            <path d="M16 15h12M16 21h12M16 27h7" strokeWidth="2.4" strokeLinecap="round" className="stroke-brand" />
            <circle cx="34" cy="34" r="9" className="fill-lime" />
            <path d="M34 30v8M30 34h8" strokeWidth="2.4" strokeLinecap="round" className="stroke-[var(--lime-ink)]" />
          </svg>
        )}
        <span className="text-title font-bold text-ink">{compact ? "Drop more files here" : NEW_BILL_COPY.drop}</span>
        {!compact && <span className="max-w-[520px] text-ink-2">{NEW_BILL_COPY.dropBody}</span>}
        <div className="flex flex-wrap justify-center gap-2">
          <Button onClick={() => input.current?.click()}>{NEW_BILL_COPY.choose}</Button>
          <Button variant="secondary" aria-expanded={pasting} onClick={() => setPasting((p) => !p)}>{NEW_BILL_COPY.paste}</Button>
          {example && (
            <Button variant="secondary" onClick={example} className="border-dashed bg-sunken text-ink-2">{NEW_BILL_COPY.example}</Button>
          )}
        </div>
        <input ref={input} type="file" multiple accept={ACCEPT_FILES} aria-label="Files to add" className="hidden"
          onChange={(e) => { const files = Array.from(e.target.files ?? []); e.target.value = ""; if (files.length) onFiles(files); }} />
      </div>
      {pasting && <PastePanel onAdd={(t, d) => { onPaste(t, d); setPasting(false); }} onCancel={() => setPasting(false)} />}
    </>
  );
}

function PastePanel({ onAdd, onCancel }: { onAdd: (text: string, docType: UploadDocType) => void; onCancel: () => void }) {
  const id = useId();
  const [text, setText] = useState("");
  const [docType, setDocType] = useState<UploadDocType>("email");
  const [chosen, setChosen] = useState(false);
  return (
    <Card className="flex flex-col gap-3 p-4 sm:p-5">
      <label htmlFor={`${id}-text`} className="font-semibold text-ink">Pasted text</label>
      <textarea id={`${id}-text`} rows={7} value={text} autoFocus
        placeholder="Paste an email, a chat or a quote exactly as written."
        onChange={(e) => {
          setText(e.target.value);
          const guess = chosen ? undefined : pasteTypeOf(e.target.value);
          if (guess) setDocType(guess);
        }}
        className="w-full resize-y rounded-[12px] border border-line-strong bg-surface p-3 font-mono text-[13px] leading-[19px] text-ink placeholder:text-ink-4" />
      <div className="flex flex-wrap items-end gap-2">
        <label htmlFor={`${id}-type`} className="flex flex-col gap-1 text-meta font-semibold text-ink-2">
          What it is
          <select id={`${id}-type`} value={docType} onChange={(e) => { setDocType(e.target.value as UploadDocType); setChosen(true); }}
            className="h-[46px] rounded-[12px] border border-line-strong bg-surface px-3 text-[14px] font-semibold text-ink">
            {PASTE_TYPES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </label>
        <Button disabled={!text.trim()} onClick={() => onAdd(text, docType)}>Add text</Button>
        <Button variant="ghost" className="h-[46px]" onClick={onCancel}>Cancel</Button>
      </div>
    </Card>
  );
}

function Rows({ rows, note, onStartOver }: { rows: UploadRow[]; note?: string; onStartOver?: () => void }) {
  return (
    <Card className="flex flex-col px-4 py-[18px] sm:px-[22px]">
      <h2 aria-live="polite" className="pb-2.5 text-panel font-bold text-ink">{headline(rows)}</h2>
      <ul aria-label="Added documents">
        {rows.map((r) => <Row key={r.key} row={r} />)}
      </ul>
      {note && <p className="border-t border-line pt-3 text-why text-ink-3">{note}</p>}
      {onStartOver && (
        <button type="button" onClick={onStartOver} className="mt-2.5 self-start text-ink-3 underline underline-offset-4 hover:text-ink">
          {NEW_BILL_COPY.startOver}
        </button>
      )}
    </Card>
  );
}

const PCT: Record<UploadRow["state"], string> = { uploading: "20%", reading: "62%", read: "100%", failed: "100%", not_read: "0%" };

function Row({ row }: { row: UploadRow }) {
  const busy = isBusy(row.state);
  const known = row.state !== "uploading";
  return (
    <li className="grid grid-cols-[40px_minmax(0,1fr)] items-center gap-x-3.5 gap-y-1 border-t border-line px-1 py-3 sm:grid-cols-[40px_minmax(0,1fr)_auto]">
      <span aria-hidden="true" className={cx("inline-flex size-10 items-center justify-center rounded-[11px] text-[11px] font-extrabold",
        row.state === "read" ? "bg-[var(--lime-ink)] text-lime" : "bg-raised text-ink-2")}>
        {row.icon}
      </span>
      <span className="flex min-w-0 flex-col gap-[5px]">
        <span className="flex flex-wrap items-center gap-2">
          <b className="min-w-0 break-words font-semibold text-ink">{row.name}</b>
          {known && <span className="rounded-[6px] bg-sunken px-2 py-px text-[12px] font-bold text-ink-2">{row.kind}</span>}
          {row.from && <span className="text-meta text-ink-3">{row.from}</span>}
        </span>
        <span className="block h-1.5 overflow-hidden rounded-full bg-raised">
          <span className={cx("block h-1.5 rounded-full transition-[width] duration-[600ms] ease-move motion-reduce:transition-none",
            row.state === "read" ? "bg-pay-fill" : row.state === "failed" ? "bg-hold-fill" : "bg-brand")}
            style={{ width: PCT[row.state] }} />
        </span>
      </span>
      <Status row={row} busy={busy} />
    </li>
  );
}

function Status({ row, busy }: { row: UploadRow; busy: boolean }): ReactNode {
  return (
    <span className={cx("col-start-2 inline-flex items-center gap-2 font-semibold sm:col-start-auto sm:max-w-[280px] sm:justify-end sm:text-right",
      row.state === "read" ? "text-pay" : row.state === "failed" ? "text-hold" : "text-ink-3")}>
      {busy && <i aria-hidden="true" className="inline-block size-3.5 flex-none animate-spin rounded-full border-2 border-line-strong border-t-brand motion-reduce:animate-none" />}
      <span className="min-w-0 break-words">{stateLabel(row)}</span>
    </span>
  );
}
