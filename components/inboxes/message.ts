// The message to the seller (SPEC §8 owner page): Claude writes the words, code inserts the
// numbers. The editor keeps every amount and line number as a locked chip; these helpers split the
// text into words and locked parts, and build the page Export PDF prints.

export type Part = { kind: "text" | "locked"; text: string };

// Amounts ("$4,800", "+$300", "−$50", "$4,800.00") and line numbers ("Line 1", "line 6").
const LOCKED = /[+−-]?\$\d[\d,]*(?:\.\d{2})?|\b[Ll]ines? \d+\b/g;

export function splitLocked(text: string): Part[] {
  const parts: Part[] = [];
  let at = 0;
  for (const m of text.matchAll(LOCKED)) {
    if (m.index > at) parts.push({ kind: "text", text: text.slice(at, m.index) });
    parts.push({ kind: "locked", text: m[0] });
    at = m.index + m[0].length;
  }
  if (at < text.length) parts.push({ kind: "text", text: text.slice(at) });
  return parts;
}

/** The locked values in order; an edit must leave this list unchanged. */
export const lockedValues = (text: string) => splitLocked(text).filter((p) => p.kind === "locked").map((p) => p.text);

const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** A plain printable page: To, Subject, then the body as written. No colors: it prints in black. */
export function printPage({ to, subject, body }: { to: string; subject: string; body: string }): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escape(subject)}</title>
<style>body{font:14px/1.6 "Host Grotesk",system-ui,sans-serif;margin:48px;max-width:640px}
dl{display:grid;grid-template-columns:80px 1fr;gap:4px 0;margin:0 0 24px}dt{opacity:.6}p{white-space:pre-wrap;margin:0}</style>
</head><body><dl><dt>To</dt><dd>${escape(to)}</dd><dt>Subject</dt><dd>${escape(subject)}</dd></dl><p>${escape(body)}</p></body></html>`;
}

/** The text Copy text puts on the clipboard. */
export const plainMessage = ({ subject, body }: { subject: string; body: string }) => `Subject: ${subject}\n\n${body}`;
