"use client";
// The case's History view, without a page shell: the table on this case's events, split by check,
// no rail or header.
import type { CaseInput } from "@/components/case/view-model";
import { historyEntries, roundsOf, type Entry } from "./history";
import { HistoryLedger } from "./ledger";

/**
 * `entries` narrows what shows (an uploader's screen, which also has no check dividers: it never sees
 * the checks); every step of the case when left out.
 */
export function HistoryView({ x, entries }: { x: CaseInput; entries?: Entry[] }) {
  const shown = entries ?? historyEntries(x);
  return <HistoryLedger entries={shown} rounds={entries ? undefined : roundsOf(shown, x)} />;
}
