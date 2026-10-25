// STAND-IN for Dev's `diffFindings` (SPEC §5.3, lib/engine/diff.ts), which has not landed yet.
// Used only to write the `recomputed` events of the Scenario B replay. Delete it and import the
// engine version once it exists; if the two disagree, the engine is right.
import type { Finding, FindingChange } from "@/lib/types";

const state = (f: Finding): FindingChange["to"] =>
  f.deltaCents === undefined ? { status: f.status } : { status: f.status, deltaCents: f.deltaCents };

/**
 * One change per line that is new or whose status or over-by amount moved, in line order.
 * A line with no prior finding has no `from` (the first check). Caused by the cited facts.
 */
export function diffFindings(prev: Finding[], next: Finding[], eventId: string): FindingChange[] {
  const before = new Map(prev.map((f) => [f.key, f]));
  return [...next].sort((a, b) => a.lineNo - b.lineNo).flatMap((f): FindingChange[] => {
    const p = before.get(f.key);
    if (p && p.status === f.status && p.deltaCents === f.deltaCents) return [];
    const change: FindingChange = { key: f.key, lineNo: f.lineNo, to: state(f), causedByEventId: eventId, causedByFactIds: f.factIds };
    if (p) change.from = state(p);
    return [change];
  });
}
