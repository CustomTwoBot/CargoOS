// What the live case screen reads (SPEC W3 step 8): `api.cases.getCaseView` turned into the
// `CaseInput` every view already takes, so live and replay cases render through the same code.
// Totals come from the engine on the server; the UI only formats them.
import type { FunctionReturnType } from "convex/server";
import type { api } from "@/convex/_generated/api";
import type { CaseInput } from "@/components/case/view-model";

export type CaseView = NonNullable<FunctionReturnType<typeof api.cases.getCaseView>>;

export function toCaseInput(v: CaseView): CaseInput {
  return {
    case: v.case, documents: v.documents, facts: v.facts, charges: v.charges, findings: v.findings,
    questions: v.questions, replies: v.replies, drafts: v.draft ? [v.draft] : [], events: v.events,
    engineTotals: v.totals,
  };
}
