// New case: the data the flow collects, what reading returned, and the copy (SPEC.md §3, §5.4, §8;
// docs/design.md §7.12, §7.14). Pure functions only, so the flow component stays layout.
import type { DocType } from "@/lib/types";
import { EMPTY_CASE, EXTRACTION_FAILED, PASTE_INSTEAD } from "@/components/states/copy";

export type AgreementType = Extract<DocType, "quote" | "email" | "chat" | "proforma" | "other">;
export type NewCaseDocType = "freight_invoice" | AgreementType;

/** One document as the flow hands it over. A PDF arrives with `file` and empty `text`; the server reads it. */
export type NewCaseDocument = { type: NewCaseDocType; title: string; text: string; file?: File };
export type NewCaseDraft = { title: string; documents: NewCaseDocument[] };

/** A document while the operator is still collecting: what we could label from its text, for display only. */
export type PendingDoc = NewCaseDocument & { key: string; sender?: string; date?: string };

/**
 * What reading one document returned (counts come from the validated extraction, never from Claude's prose).
 * `failed` may carry what was read before the part that couldn't be; `where` names that part.
 */
export type ReadResult =
  | { kind: "read"; facts: number; charges?: number }
  | { kind: "no_amounts" }
  | { kind: "failed"; where?: string; facts?: number; charges?: number };

/** Reads one document live. Leave it out in replay: then nothing is read, and the flow says so. */
export type ReadDocument = (doc: NewCaseDocument) => Promise<ReadResult>;

/** A recorded case the flow can open instead. `label` is the whole button text. */
export type RecordedExample = { id: string; label: string; summary: string };

export const RECORDED_EXAMPLES: RecordedExample[] = [
  { id: "case_A", label: EMPTY_CASE.action, summary: "1 invoice, 8 charges, one question" },
  { id: "case_B", label: "Load the 3-container case", summary: "1 invoice, 15 charges, two questions and a follow-up" },
];

export const TYPE_LABEL: Record<NewCaseDocType, string> = {
  freight_invoice: "Invoice", quote: "Quote", email: "Email", chat: "Chat", proforma: "Proforma", other: "Note",
};
export const AGREEMENT_TYPES: AgreementType[] = ["quote", "email", "chat", "proforma", "other"];

export const NEW_CASE_COPY = {
  heading: "New case",
  sub: "Add the forwarder's invoice and what was agreed.",
  trust: "Synthetic data. Nothing is sent or paid automatically.",
  name: "Shipment",
  nameHint: "Leave empty to use the invoice number.",
  namePlaceholder: "For example, Bayline 40HC Ningbo-LB",
  invoice: "Forwarder invoice",
  invoiceDrop: "Drop the invoice PDF here, or",
  invoicePlaceholder: "Paste the invoice exactly as written.",
  agreed: "What was agreed",
  agreedBody: "Quotes, emails and chats. CargoOS checks each charge against them.",
  agreedPlaceholder: "Paste a quote, email or chat exactly as written.",
  required: "Required",
  helpful: "Helpful",
  noAgreements: "Without a quote, email or chat, every charge waits on answers.",
  needInvoice: "Add the forwarder's invoice to continue.",
  read: "Read documents",
  reading: "Reading with Claude…",
  failed: EXTRACTION_FAILED,
  pasteInstead: PASTE_INSTEAD,
  readAgain: "Read again",
  notRead: "Not read in this replay.",
  replayTitle: "This is a replay. Nothing is read, and nothing reaches Claude.",
  replayBody: "Open a recorded case to see a full check.",
  edit: "Edit documents",
  check: "Check the invoice",
  noCharges: "No charges found on the invoice. Paste its text instead.",
  examples: "Recorded cases",
  examplesBody: "Runs recorded on synthetic documents.",
  cancel: "Cancel",
} as const;

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "Read: 8 charges" for the invoice, "Read: 7 facts" for the rest. */
export function readLabel(doc: Pick<NewCaseDocument, "type">, r: ReadResult): string {
  if (r.kind === "no_amounts") return doc.type === "freight_invoice"
    ? "No charges found in this invoice."
    : "No agreed amounts found in this text. Saved to the case anyway.";
  if (r.kind === "failed") return NEW_CASE_COPY.failed;
  return doc.type === "freight_invoice" ? `Read: ${plural(r.charges ?? 0, "charge")}` : `Read: ${plural(r.facts, "fact")}`;
}

/** Charges the invoice gave, if any were read (a partial read still counts). */
export function invoiceCharges(r: ReadResult | undefined): number {
  return r && r.kind !== "no_amounts" ? r.charges ?? 0 : 0;
}

/** "8 charges found on the invoice, 3 documents with agreements." */
export function readySummary(docs: PendingDoc[], results: Record<string, ReadResult>): string {
  const invoice = docs.find((d) => d.type === "freight_invoice");
  const charges = invoiceCharges(invoice && results[invoice.key]);
  const agreements = docs.filter((d) => {
    const r = results[d.key];
    return d.type !== "freight_invoice" && r && r.kind !== "no_amounts" && (r.facts ?? 0) > 0;
  }).length;
  const found = `${plural(charges, "charge")} found on the invoice`;
  return agreements ? `${found}, ${plural(agreements, "document")} with agreements.` : `${found}, no agreements found yet.`;
}

/** Why the operator can't go on from the first step, or undefined when they can. */
export const startBlock = (docs: PendingDoc[]) =>
  docs.some((d) => d.type === "freight_invoice") ? undefined : NEW_CASE_COPY.needInvoice;

/** The draft for onCreate: the typed name, or the invoice's title when left empty. */
export function toDraft(name: string, docs: PendingDoc[]): NewCaseDraft {
  const invoice = docs.find((d) => d.type === "freight_invoice");
  const invoiceFirst = invoice ? [invoice, ...docs.filter((d) => d !== invoice)] : docs;
  return {
    title: name.trim() || defaultTitle(invoice),
    documents: invoiceFirst.map(({ type, title, text, file }) => (file ? { type, title, text, file } : { type, title, text })),
  };
}

/** New documents land where they belong: an invoice fills the invoice slot if it is empty; a second one is a note. */
export function placeDocs(cur: { invoice?: PendingDoc; agreements: PendingDoc[] }, added: PendingDoc[]): { invoice?: PendingDoc; agreements: PendingDoc[] } {
  let invoice = cur.invoice;
  const agreements = [...cur.agreements];
  for (const d of added) {
    if (d.type === "freight_invoice" && !invoice) invoice = d;
    else agreements.push(d.type === "freight_invoice" ? { ...d, type: "other" } : d);
  }
  return { invoice, agreements };
}

export const defaultTitle = (invoice: PendingDoc | undefined) => invoice?.title ?? "New case";

/** Several pastes in one go, separated by a line of three or more dashes. */
export const splitPastes = (text: string) =>
  text.split(/^[ \t]*-{3,}[ \t]*$/m).map((t) => t.trim()).filter(Boolean);

// ---- Labels from the text itself, for display only. Extraction on the server decides what a document says.

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const CHAT_LINE = /^\[?(\d{1,2})\/(\d{1,2})\/(\d{2,4}),?\s+\d{1,2}:\d{2}(?::\d{2})?\s*(?:[AP]M)?\]?\s*-?\s*([^:\n]{1,40}):/gim;
// A reference number has a digit in it: "Q-PCL-0902", never "valid".
const REF = "\\s*(?:no\\.?|#|:)?\\s*((?=[A-Z0-9-]*\\d)[A-Z0-9][A-Z0-9-]{3,})";

const titleCase = (s: string) => (s === s.toUpperCase() ? s.toLowerCase().replace(/\b\p{L}/gu, (c) => c.toUpperCase()) : s);
const firstLine = (text: string) => text.split("\n").find((l) => l.trim())?.trim() ?? "";
const short = (s: string, n = 48) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
const stripExt = (name: string) => name.replace(/\.[a-z0-9]{1,5}$/i, "");

export function detectType(text: string, fileName?: string): NewCaseDocType {
  const head = `${fileName ?? ""}\n${text.split("\n").slice(0, 3).join("\n")}`;
  if (new RegExp(CHAT_LINE.source, "im").test(text)) return "chat";
  if (/^(subject|from):/im.test(text)) return "email";
  if (/pro\s?-?forma/i.test(head)) return "proforma";
  if (/\binvoice\b/i.test(head)) return "freight_invoice";
  if (/\bquot(e|ation)\b/i.test(head)) return "quote";
  return "other";
}

function detectDate(text: string, type: NewCaseDocType): string | undefined {
  const header = text.match(/^\s*(?:date|sent)\s*:\s*(.+)$/im)?.[1] ?? text.match(/\bdate:\s*(\S+(?:\s+\d{1,2},?)?)/i)?.[1];
  const iso = header?.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${MONTHS[Number(iso[2]) - 1]} ${Number(iso[3])}`;
  // "Sep 5, 2026" or "Mon, 5 Sep 2026"
  const written = header?.match(/\b(\d{1,2})?\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*(\d{1,2}(?!\d))?/i);
  const day = written?.[3] ?? written?.[1];
  if (written && day) return `${MONTHS.find((m) => m.toLowerCase() === written[2].toLowerCase())} ${Number(day)}`;
  if (type === "chat") {
    const m = new RegExp(CHAT_LINE.source, "im").exec(text);
    if (m && Number(m[1]) <= 12) return `${MONTHS[Number(m[1]) - 1]} ${Number(m[2])}`;
  }
  return undefined;
}

function detectSender(text: string, type: NewCaseDocType): string | undefined {
  if (type === "chat") {
    const names = [...new Set([...text.matchAll(CHAT_LINE)].map((m) => m[4].trim()))];
    return names.length ? names.slice(0, 3).join(", ") : undefined;
  }
  if (type === "email") {
    const from = text.match(/^from:\s*(.+)$/im)?.[1]?.replace(/<[^>]*>/, "").replace(/"/g, "").trim();
    if (from) return from;
    return text.trim().match(/[-–—]\s*([A-Z][\p{L}'-]+(?:\s[A-Z][\p{L}'-]+)?)\s*$/u)?.[1];
  }
  if (type === "other") return undefined;
  const company = firstLine(text).match(/^([A-Za-z&.,' ]{3,60}?)\s+[-–—|]\s+/)?.[1];
  return company ? titleCase(company.trim()) : undefined;
}

function detectTitle(text: string, type: NewCaseDocType, fileName?: string): string {
  const ref = (word: string) => text.match(new RegExp(`${word}${REF}`, "i"))?.[1];
  if (type === "freight_invoice") { const r = ref("invoice"); if (r) return `Invoice ${r}`; }
  if (type === "quote") { const r = ref("quot(?:e|ation)"); if (r) return `Quote ${r}`; }
  if (type === "proforma") { const r = ref("pro\\s?-?forma"); if (r) return `Proforma ${r}`; }
  if (type === "email") { const s = text.match(/^subject:\s*(.+)$/im)?.[1]?.trim(); if (s) return `Email: ${short(s)}`; }
  if (type === "chat" && !fileName) return /^\d/.test(text.trim()) ? "WhatsApp chat" : "Chat";
  if (fileName) return stripExt(fileName);
  return short(firstLine(text)) || TYPE_LABEL[type];
}

let seq = 0;
/** Labels a pasted or dropped document. `as` forces the type (the invoice slot). */
export function describeDoc(text: string, opts: { as?: NewCaseDocType; fileName?: string; file?: File } = {}): PendingDoc {
  const clean = text.replace(/\r\n?/g, "\n").trim();
  const type = opts.as ?? detectType(clean, opts.fileName);
  const doc: PendingDoc = {
    key: `doc_${++seq}`, type, text: clean,
    title: clean ? detectTitle(clean, type, opts.fileName) : opts.fileName ? stripExt(opts.fileName) : TYPE_LABEL[type],
    sender: clean ? detectSender(clean, type) : undefined,
    date: clean ? detectDate(clean, type) : undefined,
  };
  if (opts.file) doc.file = opts.file;
  return doc;
}

/** "Pacific Crest Logistics · Oct 12", or "PDF · 84 KB" for a file nobody has read yet. */
export function docMeta(d: PendingDoc): string {
  const parts = [d.sender, d.date].filter(Boolean) as string[];
  if (!d.text && d.file) parts.push(`PDF · ${Math.max(1, Math.round(d.file.size / 1024))} KB`);
  return parts.join(" · ");
}
