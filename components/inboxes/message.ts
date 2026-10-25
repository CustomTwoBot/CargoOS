// The message to the seller (SPEC §8 owner page): Claude writes the words, code inserts the
// numbers. The editor keeps every amount and line number as a locked chip; these helpers split the
// text into words and locked parts, and build the page Save PDF prints.

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

// What may follow a locked value without a space ("$400." "$700)") or come right before it ("($700", "“$5,550").
const AFTER = /^[.,;:!?)\]"”’]+/;
const BEFORE = /[(\["“‘]+$/;

/**
 * The parts grouped so punctuation stays on the line of the value it touches: each group is the
 * opening punctuation before a value, the value, and the punctuation after it. Text between stays loose.
 */
export function lockedGroups(text: string): (Part | Part[])[] {
  const parts = splitLocked(text);
  const out: (Part | Part[])[] = [];
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (p.kind !== "locked") { out.push(p); continue; }
    const group: Part[] = [];
    const prev = out.at(-1);
    const open = prev && !Array.isArray(prev) ? prev.text.match(BEFORE)?.[0] : undefined;
    if (open && prev && !Array.isArray(prev)) {
      const rest = prev.text.slice(0, -open.length);
      if (rest) out[out.length - 1] = { kind: "text", text: rest }; else out.pop();
      group.push({ kind: "text", text: open });
    }
    group.push(p);
    const next = parts[i + 1];
    const close = next?.kind === "text" ? next.text.match(AFTER)?.[0] : undefined;
    if (close && next) {
      group.push({ kind: "text", text: close });
      parts[i + 1] = { kind: "text", text: next.text.slice(close.length) };
    }
    out.push(group);
  }
  return out.filter((p) => Array.isArray(p) || p.text);
}

const SIGN_OFF = /^(thanks|thank you|best|regards|kind regards|best regards|cheers)[,.!]?$/i;

/** The draft signed by `name`: the line after the sign-off ("Thanks,") becomes the name. Unchanged without a sign-off. */
export function signedBy(body: string, name: string): string {
  const lines = body.split("\n");
  const at = lines.findLastIndex((l) => SIGN_OFF.test(l.trim()));
  if (at < 0 || at + 1 >= lines.length || !lines[at + 1].trim()) return body;
  lines[at + 1] = name;
  return lines.join("\n");
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
