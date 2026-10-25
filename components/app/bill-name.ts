// Who a bill is from, for bills made on /bills/new: the case is created before any document is read, so it
// has no forwarder and is titled "New bill". The invoice's first line names the company ("Harborline Freight —
// Invoice HLF-2207"), so the name is read from there. Display only; the server's extraction decides what the
// invoice says. Pure.
import type { CaseInput } from "@/components/case/view-model";

const MAX = 60;

/** "HARBORLINE FREIGHT" → "Harborline Freight"; mixed case is left as written. */
const titleCase = (s: string) => (s === s.toUpperCase() ? s.toLowerCase().replace(/\b\p{L}/gu, (c) => c.toUpperCase()) : s);

/** The company on the invoice's first line, before "— Invoice", "- Invoice", "Invoice" or "Tax invoice". */
export function forwarderFromInvoice(x: CaseInput): string | undefined {
  const invoice = x.documents.find((d) => d.type === "freight_invoice");
  const line = invoice?.text.split("\n").map((l) => l.trim()).find(Boolean);
  if (!line) return undefined;
  const name = line
    .replace(/\s*(?:[—–-]\s*)?(?:tax\s+)?invoice\b.*$/i, "")
    .replace(/^[\s\p{P}]+|[\s\p{P}]+$/gu, "");
  return name && name.length <= MAX ? titleCase(name) : undefined;
}

/** The bill's forwarder: from the invoice, else the case's forwarder, else its title. */
export const billForwarder = (x: CaseInput): string => forwarderFromInvoice(x) || x.case.forwarder || x.case.title;
