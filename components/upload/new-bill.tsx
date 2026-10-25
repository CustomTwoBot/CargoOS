"use client";
// /bills/new (U1): drop the bill and everything that was agreed, or send it from a phone through the QR code.
// Live, the first file makes the case and each file is read on the server (convex/uploads.ts); in a replay,
// the Scenario A example shows the reading and dropped files are listed but not read.
import { useQuery } from "convex/react";
import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useBills } from "@/components/app/bills-provider";
import { ArrowRight, CircleCheck } from "@/components/app/icons";
import { RISE } from "@/components/app/motion";
import { Card, LinkButton } from "@/components/app/ui";
import { errorText } from "@/components/case/live-store";
import { SCENARIO_A } from "@/components/case/fixture";
import { cx } from "@/components/case/cx";
import { useHasConvex } from "@/components/convex-provider";
import { keepsFile } from "@/components/new-case/model";
import { isUploaderOnly } from "@/components/shell/person";
import { DROP_COPY, DropZone } from "./drop-zone";
import {
  billReady, billTitle, iconWord, isBusy, kindLabel, pasteTitle, stateOf, typeOfFile, type UploadDocType, type UploadRow,
} from "./kinds";
import { uploadKey, useLiveUploads, useLocalUploads } from "./live-uploads";
import { PHONE_CARD_COPY, PhoneCard } from "./phone-card";
import { Rows, type ViewRow } from "./upload-rows";

export const NEW_BILL_COPY = {
  title: "Drop the bill and everything that was agreed.",
  drop: DROP_COPY.drop,
  dropBody: DROP_COPY.dropBody,
  choose: DROP_COPY.choose,
  paste: DROP_COPY.paste,
  example: DROP_COPY.example,
  phone: PHONE_CARD_COPY.title,
  phoneBody: PHONE_CARD_COPY.body,
  getLink: PHONE_CARD_COPY.getLink,
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
  const remove = (key: string) => setDropped((all) => all.filter((r) => r.key !== key));
  const rows: ViewRow[] = [...example, ...dropped.map((r) => ({ ...r, onRemove: () => remove(r.key) }))];
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
  /** A file whose upload failed before it reached the server: send it again into the same case. */
  const retry = (key: string) => {
    const item = local.items.find((i) => i.key === key);
    const file = item?.file;
    if (!item || !file) return;
    local.patch(key, { state: "uploading", error: undefined });
    void ensureCase(billTitle([{ name: file.name, docType: item.docType }])).then(
      async (id) => { try { local.patch(key, { docId: await live.uploadFile(id, file, item.docType) }); } catch (e) { fail(key, e); } },
      (e: unknown) => fail(key, e),
    );
  };
  const getLink = () => { ensureCase("New bill").catch((e: unknown) => toast(errorText(e))); };

  // This device's uploads, with the server's read status once each is a document; then anything added from a phone.
  const docs = ctx?.documents ?? [];
  const mine = new Set(local.items.map((i) => i.docId).filter(Boolean));
  const fromPhone = docs.filter((d) => !mine.has(d._id) && d.type !== "reply");
  const rows: ViewRow[] = [
    ...local.items.map((i): ViewRow => {
      const doc = i.docId ? docs.find((d) => d._id === i.docId) : undefined;
      const base = { key: i.key, name: i.name, docType: i.docType, kind: kindLabel(i.file, i.docType), icon: iconWord(i.file, i.docType) };
      if (i.state === "failed" && !i.docId) {
        return { ...base, state: "failed", error: i.error, onRetry: i.file ? () => retry(i.key) : undefined, onRemove: () => local.remove(i.key) };
      }
      if (i.state === "failed") return { ...base, state: "failed", error: i.error };
      if (!i.docId) return { ...base, state: "uploading" };
      return { ...base, state: stateOf(doc?.readStatus), error: doc?.readError };
    }),
    ...fromPhone.map((d): UploadRow => {
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
      waitingForPhone={Boolean(caseId) && fromPhone.length === 0}
    />
  );
}

// ---- the page ------------------------------------------------------------

type ViewProps = {
  rows: ViewRow[];
  onFiles: (files: File[]) => void;
  onPaste: (text: string, docType: UploadDocType) => void;
  /** Replay only: run the Scenario A example. */
  example?: () => void;
  note?: string;
  /** Where "Open the bill" goes, once every document is read and the invoice is among them. */
  ready?: string;
  phoneUrl?: string;
  onGetLink?: () => void;
  /** Live: the phone link exists and nothing has come from a phone yet. */
  waitingForPhone?: boolean;
  onStartOver?: () => void;
};

export function NewBillView({ rows, onFiles, onPaste, example, note, ready, phoneUrl, onGetLink, waitingForPhone, onStartOver }: ViewProps) {
  const { person } = useBills();
  const uploader = isUploaderOnly(person);
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
            <Card tone="brand" className={cx("flex flex-wrap items-center justify-between gap-4 rounded-[22px] px-[26px] py-6", RISE)}>
              <p className="flex items-start gap-3 text-[22px] font-bold leading-[28px]">
                <CircleCheck aria-hidden="true" strokeWidth={2.2} className="mt-[3px] size-6 flex-none text-lime" />
                {uploader ? NEW_BILL_COPY.readyUploader : NEW_BILL_COPY.ready}
              </p>
              {!uploader && (
                <LinkButton variant="lime" href={ready} className="group">
                  {NEW_BILL_COPY.open}
                  <ArrowRight aria-hidden="true" strokeWidth={2.2} className="size-4 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" />
                </LinkButton>
              )}
            </Card>
          )}
        </section>

        <aside className="flex w-full flex-[1_1_280px] flex-col gap-3.5 sm:max-w-[340px]">
          <PhoneCard url={phoneUrl} onGetLink={onGetLink} waiting={waitingForPhone} />
          <Card className="flex flex-col gap-1.5 px-5 py-[18px]">
            <h2 className="text-[15px] font-bold text-ink">{NEW_BILL_COPY.needs}</h2>
            <p className="text-[13.5px] text-ink-2">{NEW_BILL_COPY.needsBody}</p>
          </Card>
        </aside>
      </div>
    </div>
  );
}
