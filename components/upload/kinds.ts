// What a dropped file or pasted text is, for the upload rows on /bills/new and the phone page. Labels come
// from the name and, for text files, the text itself (components/new-case/model.ts detectType); the server's
// extraction decides what a document says. Pure functions only.
import type { DocType } from "@/lib/types";
import { describeDoc, detectType, keepsFile, type NewCaseDocType } from "@/components/new-case/model";

/** The document types an upload can carry (convex/schema.ts docType, without "reply"). */
export type UploadDocType = Exclude<DocType, "reply">;

/** Where one upload stands. "not_read" is a file dropped in a replay: listed, never read. */
export type UploadState = "uploading" | "reading" | "read" | "failed" | "not_read";

export type UploadRow = {
  key: string;
  name: string;
  /** "Invoice", "WhatsApp chat", "Photo"… */
  kind: string;
  /** The square icon's word: PDF, EML, TXT, IMG, WA. */
  icon: string;
  docType: UploadDocType;
  state: UploadState;
  error?: string;
  /** Who or what it came from, e.g. "from a phone". */
  from?: string;
};

export const ACCEPT_FILES = ".pdf,.eml,.txt,image/*";

const ext = (name: string) => /\.([a-z0-9]+)$/i.exec(name.trim())?.[1]?.toLowerCase() ?? "";
export const isImage = (f: { name: string; type: string }) => f.type.startsWith("image/") || /^(png|jpe?g|webp|heic|gif)$/.test(ext(f.name));
export const isPdf = (f: { name: string; type: string }) => f.type === "application/pdf" || ext(f.name) === "pdf";

/** A forwarder's file names say more than the words detectType looks for: "PCL-INV-1012.pdf", "Q-PCL-0902.pdf". */
export function typeFromName(name: string): UploadDocType {
  const base = name.replace(/\.[a-z0-9]{1,5}$/i, "");
  const byWords = detectType("", base);
  if (byWords !== "other") return byWords;
  if (/whatsapp/i.test(base)) return "chat";
  if (/(^|[^a-z])inv([^a-z]|$)/i.test(base)) return "freight_invoice";
  if (/^(re|fw|fwd)[\s:_-]/i.test(base) || /\be-?mail\b/i.test(base)) return "email";
  if (/(^|[^a-z])q(t|uo)?[-_][a-z0-9-]*\d/i.test(base)) return "quote";
  return "other";
}

/** The type of a file: the text decides for a .txt or .eml, the name for a PDF or photo. */
export function typeOfFile(file: { name: string; type: string }, text: string): UploadDocType {
  if (ext(file.name) === "eml") return "email";
  if (!keepsFile(file) && text.trim()) {
    const t = detectType(text, file.name);
    if (t !== "other") return t;
  }
  return typeFromName(file.name);
}

const TYPE_KIND: Record<UploadDocType, string> = {
  freight_invoice: "Invoice", quote: "Quote", email: "Email", chat: "Chat", proforma: "Proforma", other: "Note",
};

/** The tag on a row: "Invoice", "WhatsApp chat", "Photo", "PDF"… */
export function kindLabel(file: { name: string; type: string } | undefined, docType: UploadDocType): string {
  if (docType === "chat") return file && isImage(file) ? "WhatsApp screenshot" : "WhatsApp chat";
  if (file && isImage(file)) return docType === "other" ? "Photo" : `${TYPE_KIND[docType]} photo`;
  if (file && docType === "other") return isPdf(file) ? "PDF" : "Document";
  return TYPE_KIND[docType];
}

export function iconWord(file: { name: string; type: string } | undefined, docType: UploadDocType): string {
  if (docType === "chat" && !(file && isImage(file))) return "WA";
  if (!file) return "TXT";
  if (isImage(file)) return "IMG";
  if (isPdf(file)) return "PDF";
  return ext(file.name).toUpperCase().slice(0, 4) || "DOC";
}

/** The case title from the invoice among these files ("PCL-INV-1012"), or "New bill". */
export function billTitle(files: { name: string; docType: UploadDocType }[]): string {
  const invoice = files.find((f) => f.docType === "freight_invoice");
  if (!invoice) return "New bill";
  return describeDoc("", { as: "freight_invoice", fileName: invoice.name }).title;
}

/** Paste box choices: what the pasted text is. Invoice first: only an invoice's lines become charges to check. */
export const PASTE_TYPES: { value: UploadDocType; label: string }[] = [
  { value: "freight_invoice", label: "Invoice" },
  { value: "email", label: "Email" },
  { value: "chat", label: "Chat" },
  { value: "other", label: "Note" },
  { value: "quote", label: "Quote" },
];

/** A guess for the paste box's type from the text, when it is one of the choices. */
export function pasteTypeOf(text: string): UploadDocType | undefined {
  const t: NewCaseDocType = detectType(text.trim());
  return PASTE_TYPES.some((p) => p.value === t) ? t : undefined;
}

/** "Email: RE: Q-PCL-0902 revised", the pasted document's title. */
export const pasteTitle = (text: string, docType: UploadDocType) =>
  describeDoc(text, { as: docType === "other" ? "other" : docType }).title;

/** The row's status words. */
export function stateLabel(row: Pick<UploadRow, "state" | "error">): string {
  switch (row.state) {
    case "uploading": return "Uploading";
    case "reading": return "Reading…";
    case "read": return "Read";
    case "not_read": return "Not read";
    case "failed": return row.error ? `Couldn't read: ${row.error}` : "Couldn't read";
  }
}

export const isBusy = (s: UploadState) => s === "uploading" || s === "reading";

/** "Reading documents · 2 of 4", then "Read all 4 documents". */
export function headline(rows: UploadRow[]): string {
  const done = rows.filter((r) => !isBusy(r.state)).length;
  if (done < rows.length) return `Reading documents · ${done} of ${rows.length}`;
  if (rows.every((r) => r.state === "read")) return rows.length === 1 ? "Read 1 document" : `Read all ${rows.length} documents`;
  return `Finished ${rows.length === 1 ? "1 document" : `${rows.length} documents`}`;
}

/** Ready to open: nothing still uploading or reading, and an invoice was read. */
export const billReady = (rows: UploadRow[]) =>
  rows.length > 0 && rows.every((r) => !isBusy(r.state)) && rows.some((r) => r.docType === "freight_invoice" && r.state === "read");

/** Server read status → row state. */
export function stateOf(readStatus: "reading" | "read" | "not_read" | undefined): UploadState {
  if (readStatus === "not_read") return "failed";
  if (readStatus === "read") return "read";
  return "reading";
}
