"use client";
// The case's History view, without a page shell: the table on this case's events, no rail or header.
import type { CaseInput } from "@/components/case/view-model";
import { historyEntries } from "./history";
import { HistoryLedger } from "./ledger";

export function HistoryView({ x }: { x: CaseInput }) {
  return <HistoryLedger entries={historyEntries(x)} />;
}
