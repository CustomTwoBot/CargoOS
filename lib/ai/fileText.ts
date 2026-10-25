// Text from uploaded files, read server-side before extraction (SPEC.md 4, pipeline step 2), so every quote
// can be checked against SourceDoc.text. Images go through transcribe.ts instead.
import { extractText, getDocumentProxy } from "unpdf";

export type FileKind = "pdf" | "eml" | "txt" | "image" | "unsupported";

const IMAGE_TYPES: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp" };

export function fileKind(fileName: string, mimeType = ""): { kind: FileKind; mediaType?: string; reason?: string } {
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  if (ext === "pdf" || mimeType === "application/pdf") return { kind: "pdf" };
  if (ext === "eml" || mimeType === "message/rfc822") return { kind: "eml" };
  if (ext === "txt" || mimeType === "text/plain") return { kind: "txt" };
  if (IMAGE_TYPES[ext]) return { kind: "image", mediaType: IMAGE_TYPES[ext] };
  if (ext === "heic" || ext === "heif" || mimeType === "image/heic") {
    return { kind: "unsupported", reason: "HEIC photos can't be read yet. On iPhone, share the photo as JPEG or take a screenshot instead." };
  }
  return { kind: "unsupported", reason: `CargoOS can't read .${ext || "?"} files. Use a PDF, .eml, .txt (WhatsApp \"Export chat → Without media\"), or a PNG/JPEG/WebP screenshot.` };
}

export async function pdfToText(bytes: Uint8Array): Promise<string> {
  const pdf = await getDocumentProxy(bytes);
  const { text } = await extractText(pdf, { mergePages: true });
  return text.trim();
}

// .txt (e.g. a WhatsApp export): as-is, minus a byte-order mark and Windows line endings.
export const plainText = (raw: string) => raw.replace(/^﻿/, "").replace(/\r\n?/g, "\n").trim();

// ---- .eml ----

export interface EmailText {
  text: string; // "Subject: ...\n<body>", the shape of SPEC.md 7.1 doc_email
  subject?: string;
  from?: string;
  sentAt?: string; // ISO with offset, from the Date header
}

function splitHeaders(raw: string): { headers: Map<string, string>; body: string } {
  const normalized = raw.replace(/\r\n?/g, "\n");
  const end = normalized.indexOf("\n\n");
  const head = end === -1 ? normalized : normalized.slice(0, end);
  const body = end === -1 ? "" : normalized.slice(end + 2);
  const headers = new Map<string, string>();
  let last = "";
  for (const line of head.split("\n")) {
    if (/^[ \t]/.test(line) && last) headers.set(last, `${headers.get(last)} ${line.trim()}`);
    else {
      const i = line.indexOf(":");
      if (i > 0) { last = line.slice(0, i).trim().toLowerCase(); headers.set(last, line.slice(i + 1).trim()); }
    }
  }
  return { headers, body };
}

function decodeBody(body: string, encoding = ""): string {
  const enc = encoding.toLowerCase();
  if (enc === "base64") return new TextDecoder().decode(Uint8Array.from(atob(body.replace(/\s+/g, "")), (ch) => ch.charCodeAt(0)));
  if (enc === "quoted-printable") {
    const bytes = body.replace(/=\n/g, "").replace(/=([0-9A-F]{2})/gi, (_m, hex: string) => String.fromCharCode(parseInt(hex, 16)));
    return new TextDecoder().decode(Uint8Array.from(bytes, (ch) => ch.charCodeAt(0)));
  }
  return body;
}

// The first text/plain part (or the whole body for a single-part message).
function plainBody(headers: Map<string, string>, body: string): string {
  const type = headers.get("content-type") ?? "text/plain";
  const boundary = /boundary="?([^";]+)"?/i.exec(type)?.[1];
  if (/^multipart\//i.test(type) && boundary) {
    for (const part of body.split(`--${boundary}`)) {
      const { headers: h, body: b } = splitHeaders(part.replace(/^\n/, ""));
      if (h.size === 0) continue; // preamble / epilogue around the parts
      const t = h.get("content-type") ?? "text/plain";
      if (/^multipart\//i.test(t)) { const inner = plainBody(h, b); if (inner) return inner; }
      if (/^text\/plain/i.test(t)) return decodeBody(b, h.get("content-transfer-encoding"));
    }
    return "";
  }
  return /^text\/plain/i.test(type) ? decodeBody(body, headers.get("content-transfer-encoding")) : "";
}

// "Sat, 05 Sep 2026 14:21:00 -0700" -> "2026-09-05T14:21:00-07:00", keeping the sender's offset.
export function emailDateToIso(date: string): string | undefined {
  const m = /(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?\s*([+-]\d{4})/.exec(date);
  if (!m) return undefined;
  const month = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(m[2].toLowerCase()) + 1;
  if (month === 0) return undefined;
  const pad = (n: string | number) => String(n).padStart(2, "0");
  return `${m[3]}-${pad(month)}-${pad(m[1])}T${m[4]}:${m[5]}:${m[6] ?? "00"}${m[7].slice(0, 3)}:${m[7].slice(3)}`;
}

export function emlToText(raw: string): EmailText {
  const { headers, body } = splitHeaders(plainText(raw));
  const subject = headers.get("subject");
  const text = plainText(plainBody(headers, body));
  return {
    text: subject ? `Subject: ${subject}\n${text}` : text,
    subject,
    from: headers.get("from"),
    sentAt: emailDateToIso(headers.get("date") ?? ""),
  };
}
