// reconcile(): facts + charges -> one findings revision (SPEC.md §5.3, §6, §9 W1 step 3).
// Pure: same input, same output; no network, no database, no clock.
import type { Case, Charge, Fact, Finding, SourceDoc } from "../types";
import { explain } from "./explain";
import { evaluateCharge, type RuleContext, type RuleResult } from "./rules";

// SPEC.md §6 "User verdicts across recomputes".
export const VERDICT_CLEARED_NOTE = "Your earlier verdict was cleared because new evidence changed this line.";

export interface ReconcileInput {
  case: Case;
  facts: Fact[];
  charges: Charge[];
  prior?: Finding[];  // the previous revision, for carrying user verdicts
  // Optional beyond SPEC §5.3: lets why-lines name the source type ("email, Sep 5"). Without it they read "(Sep 5)".
  documents?: SourceDoc[];
}

const sameIds = (a: string[], b: string[]) =>
  a.length === b.length && [...a].sort().join("\u0000") === [...b].sort().join("\u0000");

/** A verdict carries over only if status, ruleId and factIds are all unchanged. */
function unchanged(prev: Finding, next: RuleResult): boolean {
  return prev.status === next.status && prev.ruleId === next.ruleId && sameIds(prev.factIds, next.factIds);
}

export function reconcile(input: ReconcileInput): Finding[] {
  const { case: c, facts, charges, prior = [], documents } = input;
  const revision = c.revision + 1;
  // TODO(Dev): reconcile's §5.3 input has no documents, so the invoice date (valid-until fallback
  // when there is no booking date) is not available here. Raise with the team if a scenario needs it.
  const ctx: RuleContext = { baseCurrency: c.baseCurrency, facts, charges };
  const factById = new Map(facts.map((f) => [f._id, f]));
  const priorByKey = new Map(prior.map((f) => [f.key, f]));

  return [...charges].sort((a, b) => a.lineNo - b.lineNo).map((charge) => {
    const r = evaluateCharge(charge, ctx);
    const finding: Finding = {
      key: charge._id,
      caseId: c._id,
      chargeId: charge._id,
      lineNo: charge.lineNo,
      revision,
      status: r.status,
      ruleId: r.ruleId,
      billedCents: charge.amountCents,
      factIds: r.factIds,
      evidence: [
        ...r.factIds.flatMap((id) => { const span = factById.get(id)?.span; return span ? [span] : []; }),
        ...(r.evidence ?? []),
      ],
      explanation: "",
    };
    // Optional fields are left off rather than set to undefined.
    if (r.expectedCents !== undefined) finding.expectedCents = r.expectedCents;
    if (r.deltaCents !== undefined) finding.deltaCents = r.deltaCents;
    if (r.missing) finding.missing = r.missing;
    if (r.routeTo) finding.routeTo = r.routeTo;
    finding.explanation = explain(finding, facts, { documents, charge });

    const prev = priorByKey.get(charge._id);
    if (prev?.userVerdict) {
      if (unchanged(prev, r)) {
        finding.userVerdict = prev.userVerdict;
        if (prev.userVerdictBy) finding.userVerdictBy = prev.userVerdictBy;
      } else {
        finding.explanation = `${finding.explanation} ${VERDICT_CLEARED_NOTE}`;
      }
    }
    return finding;
  });
}
