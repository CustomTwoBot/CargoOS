// TEMPORARY: SPEC.md §6 case totals, copied here only until Dev's `caseTotals` lands in
// lib/engine (W1 step 6). Then delete this file and import the engine version; the UI must not
// own money math. Group subtotals and `waivedCents` are asked of Dev in docs/design-vs-types.md.
import type { Finding, Status } from "@/lib/types";

export const DISCREPANCY: Status[] = ["potential_discrepancy", "invoice_noncompliance"];
const dismissed = (f: Finding) => f.userVerdict === "false_positive";
const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);

export type CaseTotals = {
  billedCents: number; agreedCents: number; atStakeCents: number; waitingCents: number;
  waivedCents: number; // dismissed discrepancies: in none of the other parts of the bar
  /** Lines billed in another currency, left out of every USD sum above (SPEC §6 step 1: never converted). */
  unconverted: { currency: string; cents: number }[];
};

/** Which currency each finding's line was billed in; USD when unknown. */
export type CurrencyOf = (f: Finding) => string;

export function caseTotals(all: Finding[], currencyOf: CurrencyOf = () => "USD"): CaseTotals {
  const findings = all.filter((f) => currencyOf(f) === "USD");
  const other = new Map<string, number>();
  for (const f of all) if (currencyOf(f) !== "USD") other.set(currencyOf(f), (other.get(currencyOf(f)) ?? 0) + f.billedCents);
  const disc = findings.filter((f) => DISCREPANCY.includes(f.status));
  return {
    unconverted: [...other].map(([currency, cents]) => ({ currency, cents })),
    billedCents: sum(findings.map((f) => f.billedCents)),
    agreedCents: sum(findings.map((f) =>
      f.status === "needs_review" ? 0 : DISCREPANCY.includes(f.status) ? (f.expectedCents ?? 0) : f.billedCents)),
    atStakeCents: sum(disc.filter((f) => !dismissed(f)).map((f) => f.deltaCents ?? 0)),
    waitingCents: sum(findings.filter((f) => f.status === "needs_review").map((f) => f.billedCents)),
    waivedCents: sum(disc.filter(dismissed).map((f) => f.deltaCents ?? 0)),
  };
}

/** Subtotals for one group bar: billed and over-by of the findings shown in it. */
export function groupTotals(all: Finding[], currencyOf: CurrencyOf = () => "USD") {
  const findings = all.filter((f) => currencyOf(f) === "USD");
  return {
    billedCents: sum(findings.map((f) => f.billedCents)),
    overCents: sum(findings.filter((f) => DISCREPANCY.includes(f.status) && !dismissed(f)).map((f) => f.deltaCents ?? 0)),
  };
}
