// Quote validator (SPEC.md 9, W2 step 2; CLAUDE.md rule 4): a span.quote must be an exact substring of its
// document's text, comparing with whitespace normalized only. Anything else is dropped and reported.
import type { SourceDoc, SourceSpan } from "../types";

export const normalizeWhitespace = (s: string) => s.replace(/\s+/g, " ").trim();

export function quoteIsInText(quote: string, text: string): boolean {
  const q = normalizeWhitespace(quote);
  return q.length > 0 && normalizeWhitespace(text).includes(q);
}

export interface DroppedSpan<T> {
  kind: "fact" | "charge";
  item: T;
  reason: string;
}

function spanProblem(span: SourceSpan, doc: Pick<SourceDoc, "_id" | "text">): string | null {
  if (span.docId !== doc._id) return `span points at ${span.docId}, not ${doc._id}`;
  if (!quoteIsInText(span.quote, doc.text)) return `quote is not in ${doc._id}: "${span.quote}"`;
  return null;
}

export function validateSpans<F extends { span: SourceSpan }, C extends { span: SourceSpan }>(
  output: { facts: F[]; charges?: C[] },
  doc: Pick<SourceDoc, "_id" | "text">,
): { facts: F[]; charges: C[]; dropped: DroppedSpan<F | C>[] } {
  const dropped: DroppedSpan<F | C>[] = [];
  const keep = <T extends F | C>(kind: "fact" | "charge", items: T[]) => items.filter((item) => {
    const reason = spanProblem(item.span, doc);
    if (reason) dropped.push({ kind, item, reason });
    return reason === null;
  });
  return { facts: keep("fact", output.facts), charges: keep("charge", output.charges ?? []), dropped };
}

// For citations that may point at any document in the case.
export function validCitations(spans: SourceSpan[], docs: Pick<SourceDoc, "_id" | "text">[]): SourceSpan[] {
  const byId = new Map(docs.map((d) => [d._id, d.text]));
  return spans.filter((s) => {
    const text = byId.get(s.docId);
    return text !== undefined && quoteIsInText(s.quote, text);
  });
}
