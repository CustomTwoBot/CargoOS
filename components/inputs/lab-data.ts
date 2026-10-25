// Scenario A at revision 1, shaped for the input variations (read-only use of case/*).
import { scenarioA } from "@/components/case/fixture";
import { toRows, type Row } from "@/components/case/view-model";
import type { SourceDoc } from "@/lib/types";
import type { EditableLine } from "./line-edit";

export type LineData = { rows: Row[]; lines: EditableLine[]; quotes: Record<string, string>; invoiceTitle: string };

export function scenarioALines(): LineData {
  const x = scenarioA(1);
  const rows = toRows(x);
  const charge = (r: Row) => x.charges.find((c) => c._id === r.finding.chargeId)!;
  return {
    rows,
    lines: rows.map((r) => ({ key: r.key, lineNo: r.lineNo, description: r.description, amountCents: charge(r).amountCents })),
    quotes: Object.fromEntries(rows.map((r) => [r.key, charge(r).span.quote])),
    invoiceTitle: x.documents.find((d) => d.type === "freight_invoice")?.title ?? "Invoice",
  };
}

/** The documents a clerk sees before adding anything: quote, email, chat, invoice. */
export const scenarioADocuments = (): SourceDoc[] => scenarioA(1).documents;
