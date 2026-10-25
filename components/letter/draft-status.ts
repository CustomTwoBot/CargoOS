// Whether CargoOS gave up writing an accepted dispute's message. Accepting schedules draftDispute
// (convex/drafts.ts); when Claude fails it writes extraction_failed with stage "draftDispute" and the
// draft keeps an empty body, so without this the letter page would say "writing" forever.
import { instant, type CaseInput } from "@/components/case/view-model";

export function draftWriteFailed(x: CaseInput, draftId: string): boolean {
  const approved = x.events
    .filter((e) => e.type === "approved" && e.payload.draftId === draftId)
    .map((e) => instant(e.at))
    .sort((a, b) => a - b)
    .at(-1);
  if (approved === undefined) return false;
  return x.events.some((e) => e.type === "extraction_failed" && e.payload.stage === "draftDispute" && instant(e.at) >= approved);
}
