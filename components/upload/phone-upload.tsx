"use client";
// /upload/[caseId] (U3): the phone page the QR code on /bills/new opens. Three big buttons (WhatsApp chat,
// PDF, photo of a paper) and the list of what this phone added. No amounts, findings or disputes, ever.
// Live, files go to the case through convex/uploads.ts as the device's person; in a replay, or for
// /upload/demo, adds are simulated and nothing is uploaded.
import { useQuery } from "convex/react";
import { Component, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button, Kicker } from "@/components/app/ui";
import { errorText } from "@/components/case/live-store";
import { SCENARIO_A } from "@/components/case/fixture";
import { cx } from "@/components/case/cx";
import { useHasConvex } from "@/components/convex-provider";
import { WORKSPACE, useDevicePerson } from "@/components/shell/person";
import { isBusy, stateOf, type UploadDocType, type UploadState } from "./kinds";
import { uploadKey, useLiveUploads, useLocalUploads } from "./live-uploads";

export const PHONE_COPY = {
  brand: `CargoOS · ${WORKSPACE.name}`,
  title: (bill: string) => `Add documents to ${bill}`,
  chat: "WhatsApp chat",
  chatHint: "Chat → ⋯ → Export chat → Without media",
  pdf: "PDF",
  photo: "Photo of a paper",
  whatPdf: "What is this PDF?",
  added: "You added",
  none: "Nothing yet.",
  footer: "CargoOS is reading what you add. Maya and Sam see the results.",
  demo: "Demo: files aren't uploaded in this replay",
  missing: "This link doesn't match a bill. Ask for a new QR code.",
  loading: "Opening the bill…",
} as const;

const PDF_KINDS: { docType: UploadDocType; label: string }[] = [
  { docType: "quote", label: "Quote" },
  { docType: "freight_invoice", label: "Invoice" },
  { docType: "email", label: "Email" },
  { docType: "other", label: "Other" },
];

/** What a phone row is called: the button it came from, or the PDF's kind. */
type Source = "chat" | "pdf" | "photo";
const rowKind = (source: Source, docType: UploadDocType) =>
  source === "chat" ? PHONE_COPY.chat : source === "photo" ? PHONE_COPY.photo : `${PDF_KINDS.find((k) => k.docType === docType)?.label ?? "Other"} PDF`;

export type PhoneRow = { key: string; kind: string; name: string; state: UploadState; error?: string };

const PHONE_STATE: Record<UploadState, string> = {
  uploading: "Uploading", reading: "Reading…", read: "Added ✓", failed: "Couldn't read", not_read: "Couldn't read",
};

/** ?replay=1 keeps the page a replay even with a backend. Read on the client only. */
const useReplayParam = () => useSyncExternalStore(() => () => {},
  () => new URLSearchParams(window.location.search).get("replay") === "1", () => false);

export function PhoneUploadPage({ caseId }: { caseId: string }) {
  const hasConvex = useHasConvex();
  const replay = useReplayParam();
  if (!hasConvex || replay || caseId === "demo") return <ReplayPhone />;
  return (
    <LiveBoundary fallback={<PhoneShell><Missing /></PhoneShell>}>
      <LivePhone caseId={caseId as Id<"cases">} />
    </LiveBoundary>
  );
}

// ---- replay --------------------------------------------------------------

const READ_MS = 1500;

function ReplayPhone() {
  const [rows, setRows] = useState<PhoneRow[]>([]);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const add = (file: File, docType: UploadDocType, source: Source) => {
    const key = uploadKey();
    setRows((all) => [...all, { key, kind: rowKind(source, docType), name: file.name, state: "reading" }]);
    timers.current.push(setTimeout(() => setRows((all) => all.map((r) => (r.key === key ? { ...r, state: "read" } : r))), READ_MS));
  };
  return <PhoneView title={SCENARIO_A.title} rows={rows} onAdd={add} demo />;
}

// ---- live ----------------------------------------------------------------

function LivePhone({ caseId }: { caseId: Id<"cases"> }) {
  const person = useDevicePerson();
  const ctx = useQuery(api.uploads.getUploadContext, { caseId });
  const live = useLiveUploads(person);
  const local = useLocalUploads();
  const [kinds, setKinds] = useState<Record<string, string>>({});

  if (ctx === undefined) return <PhoneShell><p className="px-1 text-ink-3">{PHONE_COPY.loading}</p></PhoneShell>;
  if (ctx === null) return <PhoneShell><Missing /></PhoneShell>;

  const add = async (file: File, docType: UploadDocType, source: Source) => {
    const key = uploadKey();
    setKinds((k) => ({ ...k, [key]: rowKind(source, docType) }));
    local.add([{ key, name: file.name, docType, file, state: "uploading" }]);
    try { local.patch(key, { docId: await live.uploadFile(caseId, file, docType) }); } catch (e) {
      local.patch(key, { state: "failed", error: errorText(e) });
    }
  };
  const rows: PhoneRow[] = local.items.map((i) => {
    const doc = i.docId ? ctx.documents.find((d) => d._id === i.docId) : undefined;
    const base = { key: i.key, kind: kinds[i.key] ?? "Document", name: i.name };
    if (i.state === "failed") return { ...base, state: "failed", error: i.error };
    if (!i.docId) return { ...base, state: "uploading" };
    return { ...base, state: stateOf(doc?.readStatus), error: doc?.readError };
  });
  return <PhoneView title={ctx.title} rows={rows} onAdd={(f, d, s) => void add(f, d, s)} />;
}

/** A link with a malformed case id makes the query throw: show the same "doesn't match" page. */
class LiveBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

// ---- the page ------------------------------------------------------------

function PhoneShell({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-bg">
      <div className="mx-auto flex min-h-screen w-full max-w-[480px] flex-col">
        <header className="flex flex-col gap-1 bg-[var(--lime-ink)] px-5 pb-4 pt-[26px] text-white dark:bg-raised">
          <span className="text-[13px] text-brand-soft dark:text-ink-2">{PHONE_COPY.brand}</span>
          {title && <h1 className="text-[22px] font-extrabold leading-[28px]">{PHONE_COPY.title(title)}</h1>}
        </header>
        <main className="flex flex-1 flex-col gap-2.5 p-4">{children}</main>
      </div>
    </div>
  );
}

function Missing() {
  return <p role="alert" className="rounded-[18px] border border-line bg-surface p-4 text-[15px] font-semibold text-ink">{PHONE_COPY.missing}</p>;
}

const BIG = "flex min-h-[76px] w-full items-center gap-3.5 rounded-[18px] border border-line bg-surface px-[18px] py-3 text-left text-[17px] font-bold text-ink shadow-card hover:bg-sunken";
const ICON = "inline-flex size-11 flex-none items-center justify-center rounded-[13px] text-[12px] font-extrabold";

export function PhoneView({ title, rows, onAdd, demo }: {
  title: string; rows: PhoneRow[]; onAdd: (file: File, docType: UploadDocType, source: Source) => void; demo?: boolean;
}) {
  const chat = useRef<HTMLInputElement>(null);
  const pdf = useRef<HTMLInputElement>(null);
  const photo = useRef<HTMLInputElement>(null);
  const [pendingPdf, setPendingPdf] = useState<File>();
  const picked = (e: React.ChangeEvent<HTMLInputElement>) => { const f = e.target.files?.[0]; e.target.value = ""; return f; };

  return (
    <PhoneShell title={title}>
      {pendingPdf ? (
        <div role="group" aria-labelledby="what-pdf" className="flex flex-col gap-2.5 rounded-[18px] border-2 border-ink bg-surface p-3.5">
          <span id="what-pdf" className="font-bold text-ink">{PHONE_COPY.whatPdf}</span>
          <span className="break-all text-meta text-ink-3">{pendingPdf.name}</span>
          <div className="grid grid-cols-2 gap-1.5 min-[400px]:grid-cols-4">
            {PDF_KINDS.map((k) => (
              <button key={k.docType} type="button"
                onClick={() => { onAdd(pendingPdf, k.docType, "pdf"); setPendingPdf(undefined); }}
                className="h-11 rounded-[12px] border border-line-strong bg-surface px-3 text-[14px] font-bold text-ink hover:bg-sunken">
                {k.label}
              </button>
            ))}
          </div>
          <Button variant="ghost" className="h-9 self-start" onClick={() => setPendingPdf(undefined)}>Cancel</Button>
        </div>
      ) : (
        <>
          <button type="button" className={BIG} aria-label={PHONE_COPY.chat} aria-describedby="chat-hint" onClick={() => chat.current?.click()}>
            <span aria-hidden="true" className={cx(ICON, "bg-pay-tint text-pay")}>WA</span>
            <span className="flex flex-col">
              <span>{PHONE_COPY.chat}</span>
              <span id="chat-hint" className="text-meta font-medium text-ink-3">{PHONE_COPY.chatHint}</span>
            </span>
          </button>
          <button type="button" className={BIG} onClick={() => pdf.current?.click()}>
            <span aria-hidden="true" className={cx(ICON, "bg-raised text-ink-2")}>PDF</span>
            <span>{PHONE_COPY.pdf}</span>
          </button>
          <button type="button" className={BIG} onClick={() => photo.current?.click()}>
            <span aria-hidden="true" className={cx(ICON, "bg-ask-tint text-ask")}>IMG</span>
            <span>{PHONE_COPY.photo}</span>
          </button>
        </>
      )}
      <input ref={chat} type="file" accept=".txt,text/plain" aria-label="WhatsApp chat export" className="hidden"
        onChange={(e) => { const f = picked(e); if (f) onAdd(f, "chat", "chat"); }} />
      <input ref={pdf} type="file" accept=".pdf,application/pdf" aria-label="PDF file" className="hidden"
        onChange={(e) => { const f = picked(e); if (f) setPendingPdf(f); }} />
      <input ref={photo} type="file" accept="image/*" capture="environment" aria-label="Photo of a paper" className="hidden"
        onChange={(e) => { const f = picked(e); if (f) onAdd(f, "other", "photo"); }} />

      <Kicker className="pt-1.5">{PHONE_COPY.added}</Kicker>
      {rows.length === 0 ? (
        <p className="text-[13px] text-ink-4">{PHONE_COPY.none}</p>
      ) : (
        <ul aria-label={PHONE_COPY.added} className="flex flex-col gap-2">
          {rows.map((r) => (
            <li key={r.key} className="flex flex-col gap-0.5 rounded-[14px] bg-surface px-3 py-2.5 text-[13.5px]">
              <span className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate font-semibold text-ink">{r.kind}</span>
                <span className={cx("inline-flex flex-none items-center gap-1.5 font-bold",
                  r.state === "read" ? "text-pay" : r.state === "failed" ? "text-hold" : "text-ink-3")}>
                  {isBusy(r.state) && <i aria-hidden="true" className="inline-block size-3 animate-spin rounded-full border-2 border-line-strong border-t-brand motion-reduce:animate-none" />}
                  {PHONE_STATE[r.state]}
                </span>
              </span>
              <span className="truncate text-meta text-ink-3">{r.name}</span>
              {r.state === "failed" && r.error && <span className="text-meta text-hold">{r.error}</span>}
            </li>
          ))}
        </ul>
      )}
      <p className="pt-1 text-center text-[12px] text-ink-3">{PHONE_COPY.footer}</p>
      {demo && <p className="text-center text-[12px] font-semibold text-ink-3">{PHONE_COPY.demo}</p>}
    </PhoneShell>
  );
}
