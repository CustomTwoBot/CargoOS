"use client";
// The case's History view, without a page shell: the table on this case's events, split by check,
// no rail or header.
import type { CaseInput } from "@/components/case/view-model";
import { historyEntries, roundsOf } from "./history";
import { HistoryLedger } from "./ledger";

export function HistoryView({ x }: { x: CaseInput }) {
  const entries = historyEntries(x);
  return <HistoryLedger entries={entries} rounds={roundsOf(entries, x)} />;
}
