// caseTotals(): the overview bar numbers (SPEC.md §6 "Case totals", §9 W1 step 6). Pure.
// The UI never computes money (docs/design.md), so the engine also returns `waived`.
import type { Finding, Status } from "../types";

export interface CaseTotals {
  billed: number;    // sum of billedCents
  agreed: number;    // cleared lines at billed, disputed lines at expected; waiting lines left out
  atStake: number;   // deltaCents of disputed lines the clerk has not dismissed
  waiting: number;   // billedCents of needs_review lines
  waived: number;    // deltaCents of disputed lines dismissed with "Not an issue" ("Waived by clerk", design §12)
}

const CLEARED: ReadonlySet<Status> = new Set(["supported", "outside_quote_scope"]);
const DISPUTED: ReadonlySet<Status> = new Set(["potential_discrepancy", "invoice_noncompliance"]);

/** Always holds: billed = agreed + atStake + waiting + waived. */
export function caseTotals(findings: Pick<Finding, "status" | "billedCents" | "expectedCents" | "deltaCents" | "userVerdict">[]): CaseTotals {
  const t: CaseTotals = { billed: 0, agreed: 0, atStake: 0, waiting: 0, waived: 0 };
  for (const f of findings) {
    t.billed += f.billedCents;
    if (f.status === "needs_review") t.waiting += f.billedCents;
    else if (CLEARED.has(f.status)) t.agreed += f.billedCents;
    else t.agreed += f.expectedCents ?? 0;
    if (DISPUTED.has(f.status)) {
      if (f.userVerdict === "false_positive") t.waived += f.deltaCents ?? 0;
      else t.atStake += f.deltaCents ?? 0;
    }
  }
  return t;
}
