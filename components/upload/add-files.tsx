"use client";
// Add files to a bill that already exists, from this computer (the Documents tab). Anyone holding
// "uploader" can: Leo, Maya and Sam. Live, each file goes up like on /bills/new and the server reads it
// and rechecks the bill; the row follows the document's read status from the bill itself. In a replay,
// text files (.txt chats, .eml emails) are added as evidence and rechecked; PDFs and photos are listed
// but not read, because nothing reads files in a replay.
import { useRef } from "react";
import type { Id } from "@/convex/_generated/dataModel";
import { FileUp, Upload } from "@/components/app/icons";
import { Button, Card } from "@/components/app/ui";
import { useBills, type Bill } from "@/components/app/bills-provider";
import { errorText } from "@/components/case/live-store";
import { cx } from "@/components/case/cx";
import { useDragOver } from "./drop-zone";
import { ACCEPT_FILES, iconWord, kindLabel, stateOf, type UploadDocType } from "./kinds";
import { uploadKey, useLiveUploads, useLocalUploads } from "./live-uploads";
import { describeFiles, textOf } from "./new-bill";
import { Rows, type ViewRow } from "./upload-rows";

export const ADD_FILES_COPY = {
  title: "Add files from this computer",
  body: "Quotes, invoices, emails (.eml), WhatsApp exports (.txt) or photos. CargoOS reads each one and rechecks the bill.",
  choose: "Choose files",
  over: "Drop to add to this bill",
  replayNote: "In this replay, PDFs and photos are listed but not read. Text files are added and rechecked.",
} as const;

export function AddFiles({ bill }: { bill: Bill }) {
  return bill.live ? <LiveAddFiles bill={bill} /> : <ReplayAddFiles bill={bill} />;
}

/** The card: a drop target with a Choose files button, and the rows of what this screen added. */
function Frame({ onFiles, rows, note }: { onFiles: (files: File[]) => void; rows: ViewRow[]; note?: string }) {
  const input = useRef<HTMLInputElement>(null);
  const { over, handlers } = useDragOver(onFiles);
  return (
    <div className="flex flex-col gap-3">
      <Card {...handlers} data-over={over || undefined} aria-label={ADD_FILES_COPY.title}
        className={cx("flex flex-col gap-3 border-2 border-dashed p-4 transition-colors duration-200",
          over ? "border-brand bg-pay-tint" : "border-line-strong")}>
        <div className="flex items-start gap-3">
          <span aria-hidden="true" className={cx("inline-flex size-9 flex-none items-center justify-center rounded-[11px] bg-sunken text-ink-2 transition-transform duration-200 motion-reduce:transition-none", over && "-translate-y-0.5 text-brand")}>
            <FileUp strokeWidth={1.8} className="size-[18px]" />
          </span>
          <div className="flex min-w-0 flex-col gap-0.5">
            <h3 className="font-bold">{over ? ADD_FILES_COPY.over : ADD_FILES_COPY.title}</h3>
            <p className="text-meta text-ink-3">{ADD_FILES_COPY.body}</p>
          </div>
        </div>
        <input ref={input} type="file" multiple accept={ACCEPT_FILES} className="sr-only" tabIndex={-1} aria-label="Files to add to this bill"
          onChange={(e) => { const f = Array.from(e.target.files ?? []); if (f.length) onFiles(f); e.target.value = ""; }} />
        <Button variant="secondary" icon={Upload} onClick={() => input.current?.click()} className="w-full">{ADD_FILES_COPY.choose}</Button>
      </Card>
      {rows.length > 0 && <Rows rows={rows} note={note} />}
    </div>
  );
}

function LiveAddFiles({ bill }: { bill: Bill }) {
  const { person, toast } = useBills();
  const live = useLiveUploads(person);
  const local = useLocalUploads();
  const caseId = bill.x.case._id as Id<"cases">;

  const send = async (key: string, file: File, docType: UploadDocType) => {
    local.patch(key, { state: "uploading", error: undefined });
    try { local.patch(key, { docId: await live.uploadFile(caseId, file, docType) }); }
    catch (e) { local.patch(key, { state: "failed", error: errorText(e) }); toast(errorText(e)); }
  };
  const onFiles = async (files: File[]) => {
    const described = (await describeFiles(files)).map((d) => ({ ...d, key: uploadKey() }));
    local.add(described.map(({ key, file, docType }) => ({ key, name: file.name, docType, file, state: "uploading" })));
    await Promise.all(described.map(({ key, file, docType }) => send(key, file, docType)));
  };

  const rows: ViewRow[] = local.items.map((i) => {
    const doc = i.docId ? bill.x.documents.find((d) => d._id === i.docId) : undefined;
    const base = { key: i.key, name: i.name, docType: i.docType, kind: kindLabel(i.file, i.docType), icon: iconWord(i.file, i.docType) };
    if (i.state === "failed" && !i.docId) {
      return { ...base, state: "failed", error: i.error, onRetry: i.file ? () => void send(i.key, i.file!, i.docType) : undefined, onRemove: () => local.remove(i.key) };
    }
    if (!i.docId) return { ...base, state: i.state };
    return { ...base, state: stateOf(doc?.readStatus), error: doc?.readError };
  });
  return <Frame onFiles={(f) => void onFiles(f)} rows={rows} />;
}

/** Replay: chats and emails become evidence on the recorded bill; other files are listed, not read. */
function ReplayAddFiles({ bill }: { bill: Bill }) {
  const local = useLocalUploads();
  const onFiles = async (files: File[]) => {
    const described = await describeFiles(files);
    for (const { file, docType } of described) {
      const key = uploadKey();
      const text = await textOf(file);
      const kind = docType === "chat" ? "chat" : docType === "email" ? "email" : "other";
      if (text.trim()) bill.actions.addEvidence({ type: kind, text });
      local.add([{ key, name: file.name, docType, file, state: text.trim() ? "uploading" : "failed", docId: text.trim() ? ("replay" as Id<"documents">) : undefined }]);
    }
  };
  const rows: ViewRow[] = local.items.map((i) => ({
    key: i.key, name: i.name, docType: i.docType, kind: kindLabel(i.file, i.docType), icon: iconWord(i.file, i.docType),
    state: i.docId ? "read" : "not_read", onRemove: i.docId ? undefined : () => local.remove(i.key),
  }));
  return <Frame onFiles={(f) => void onFiles(f)} rows={rows} note={rows.some((r) => r.state === "not_read") ? ADD_FILES_COPY.replayNote : undefined} />;
}
