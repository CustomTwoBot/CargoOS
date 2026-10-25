// The one chip a row carries on the Overview (docs/design.md §0.2): the numbers behind the status,
// or what kind of problem it is. Pure; amounts are the engine's, only formatted here.
import { inCurrency } from "./format";
import type { Row } from "./view-model";

export function chipOf(r: Row): string {
  const f = r.finding;
  if (f.ruleId === "R1_DUPLICATE") return "Billed twice";
  if (f.ruleId === "R7_CONFLICT") return "Sources disagree";
  if (f.ruleId === "R3_MATH_CURRENCY") return "No agreed rate";
  if (r.group === "dispute") {
    if (!f.expectedCents) return "No agreement";
    const label = f.ruleId === "R8_APPROVED" ? "Approved" : f.ruleId === "R4_PERMITTED_SURCHARGE" ? "Cap" : "Agreed";
    return `${label} ${inCurrency(f.expectedCents, r.currency)} → Billed ${inCurrency(r.billedCents, r.currency)}`;
  }
  if (r.group === "waiting") return "No agreement";
  return r.reason.plain;
}
