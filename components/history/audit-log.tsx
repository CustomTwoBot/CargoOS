"use client";
// The case's audit log (docs/design.md §0.4 п.2: "⋯ → Audit log"): every step of the case, who did
// it and when, append-only. The thread tells the story; this is the record an accountant checks.
// An uploader's screen shows only what happened to documents.
import type { CaseInput } from "@/components/case/view-model";
import type { Person } from "@/lib/types";
import { historyEntries, uploaderEntries } from "./history";
import { HistoryView } from "./history-view";

/** Who sees findings: anyone who reviews, answers or decides; an uploader sees documents only. */
const seesFindings = (viewer: Person) => viewer.roles.some((r) => r === "clerk" || r === "ops_lead" || r === "controller");

export function AuditLog({ x, viewer }: { x: CaseInput; viewer: Person }) {
  return (
    <section aria-label="Audit log" className="flex min-h-0 flex-col gap-3">
      <div>
        <h2 className="text-panel font-[650]">Audit log</h2>
        <p className="mt-0.5 text-meta text-ink-3">Every step of this case, who did it and when. Nothing here can be changed.</p>
      </div>
      <HistoryView x={x} entries={seesFindings(viewer) ? undefined : uploaderEntries(historyEntries(x))} />
    </section>
  );
}
