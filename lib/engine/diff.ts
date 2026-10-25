// diffFindings(): what changed between two findings revisions (SPEC.md §5.3, §9 W1 step 5).
// Feeds the "What changed" panel and the `recomputed` event's { changes }. Pure.
import type { Finding, FindingChange, Status } from "../types";

const snapshot = (f: Finding): { status: Status; deltaCents?: number } =>
  f.deltaCents === undefined ? { status: f.status } : { status: f.status, deltaCents: f.deltaCents };

/**
 * One change per key whose status or delta changed (or that is new), in lineNo order.
 * causedByFactIds = facts in next.factIds that were not in prev.factIds. Lines that disappeared
 * are not reported: FindingChange has no way to say "removed".
 */
export function diffFindings(prev: Finding[], next: Finding[], eventId: string): FindingChange[] {
  const before = new Map(prev.map((f) => [f.key, f]));
  return [...next].sort((a, b) => a.lineNo - b.lineNo).flatMap((n) => {
    const p = before.get(n.key);
    if (p && p.status === n.status && p.deltaCents === n.deltaCents) return [];
    const known = new Set(p?.factIds ?? []);
    const change: FindingChange = {
      key: n.key, lineNo: n.lineNo, to: snapshot(n),
      causedByEventId: eventId, causedByFactIds: n.factIds.filter((id) => !known.has(id)),
    };
    if (p) change.from = snapshot(p);
    return [change];
  });
}
