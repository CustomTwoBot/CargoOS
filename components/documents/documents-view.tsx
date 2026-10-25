"use client";
// The case's Documents view, without a page shell: the case app puts it in its main column
// (a flex column) under its own header. Replay or live, it only needs the case.
import type { CaseInput } from "@/components/case/view-model";
import { docRows } from "./documents";
import { ListView } from "./list-view";

/**
 * Every document, oldest first, with the first one open. `facts={false}` leaves out what CargoOS read
 * from each (amounts and the lines they were used for), for a screen that sees no findings (§0.3).
 */
export function DocumentsView({ x, facts = true }: { x: CaseInput; facts?: boolean }) {
  return <ListView x={x} rows={docRows(x)} facts={facts} />;
}
