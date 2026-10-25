// "Why" line for a finding, from code templates only (SPEC.md §6, §9 W1 step 4; CLAUDE.md rule 5).
// Pure. Never throws: a missing cited fact falls back to the billed amount.
import type { Charge, DocType, Fact, Finding, SourceDoc } from "../types";
import { formatShortDate, formatUSD } from "./money";

/**
 * Optional extras beyond the SPEC §5.3 `(f, facts)` signature. With documents, sources read
 * "(email, Sep 5)"; without them, "(Sep 5)". The charge gives R3 its currency.
 */
export interface ExplainContext {
  documents?: SourceDoc[];
  charge?: Charge;
}

// {docTitle} in the §6 templates renders as the document type (see fixtures/scenarioA.ui.json).
const DOC_LABEL: Record<DocType, string> = {
  quote: "quote", email: "email", chat: "chat", proforma: "proforma",
  freight_invoice: "invoice", reply: "reply", other: "document",
};

const ROLE_LABEL: Record<string, string> = { ops_lead: "ops lead", clerk: "clerk", controller: "controller", buyer: "buyer" };

/** "quote" -> "\"quote\"." but no second full stop when the quote already ends a sentence. */
const quoted = (q: string) => `"${q}"${/[.!?]$/.test(q) ? "" : "."}`;

export function explain(f: Finding, facts: Fact[], context: ExplainContext = {}): string {
  const byId = new Map(facts.map((x) => [x._id, x]));
  const cited = f.factIds.flatMap((id) => { const x = byId.get(id); return x ? [x] : []; });
  const find = (kind: Fact["kind"]) => cited.find((x) => x.kind === kind);
  const labels = new Map((context.documents ?? []).map((d) => [d._id, DOC_LABEL[d.type]]));

  const date = (iso: string) => formatShortDate(iso);
  const source = (x: Fact) => { const l = labels.get(x.span.docId); return l ? `${l}, ${date(x.effectiveAt)}` : date(x.effectiveAt); };
  const billed = `Billed ${formatUSD(f.billedCents)}.`;
  const over = f.deltaCents !== undefined ? ` Over by ${formatUSD(f.deltaCents)}.` : "";
  const role = (x: Fact) => ROLE_LABEL[x.statedBy] ?? x.statedBy;

  switch (f.ruleId) {
    case "R0_MATCH": {
      const rate = find("agreed_rate");
      if (rate?.amountCents === undefined) return billed;
      const how = f.billedCents < rate.amountCents ? "Under" : "Matches";
      return `${billed} ${how} the agreed rate of ${formatUSD(rate.amountCents)} (${source(rate)}).`;
    }
    case "R1_DUPLICATE": {
      const other = /line (\d+)/.exec(f.evidence[0]?.locator ?? "")?.[1];
      return `${billed} Same charge already billed on ${other ? `line ${other}` : "an earlier line"}.`;
    }
    case "R2_RATE_MISMATCH": {
      const rate = find("agreed_rate");
      if (rate?.amountCents === undefined) return `${billed}${over}`;
      const booking = find("booking_date");
      const bookedBy = rate.condition?.bookedBy;
      const condition = bookedBy && booking ? `, if booked by ${date(bookedBy)}; booked ${date(booking.effectiveAt)}` : "";
      return `${billed} Agreed ${formatUSD(rate.amountCents)} (${source(rate)}${condition}).${over}`;
    }
    case "R3_MATH_CURRENCY": {
      const currency = context.charge?.currency ?? "another currency";
      // rules.ts cites fx_rate facts only when one exists but its format is not defined yet.
      return cited.length > 0
        ? `Billed in ${currency}. An exchange rate was mentioned, but converting it is not supported yet, so it cannot be checked yet.`
        : `Billed in ${currency}. No exchange rate was agreed, so it cannot be checked yet.`;
    }
    case "R4_PERMITTED_SURCHARGE": {
      const clause = find("permitted_surcharge");
      return clause ? `${billed} Allowed by the quote: ${quoted(clause.span.quote)}${over}` : `${billed}${over}`;
    }
    case "R5_EXCLUDED_SCOPE": {
      const excl = find("exclusion");
      return excl ? `${billed} The quote excludes this charge but says it is billable: ${quoted(excl.span.quote)}` : billed;
    }
    case "R6_NO_EVIDENCE":
      return `${billed} Nothing in the quote, emails or chats agrees to this charge.`;
    case "R7_CONFLICT": {
      const describe = (x: Fact) =>
        `${x.amountCents !== undefined ? formatUSD(x.amountCents) : x.kind === "rejection" ? "not agreed" : "approved"} (${source(x)})`;
      const [a, b] = cited.filter((x) => x.kind !== "booking_date");
      return a && b ? `${billed} Sources disagree: ${describe(a)} vs ${describe(b)}.` : `${billed} Sources disagree.`;
    }
    case "R8_APPROVED": {
      const ok = find("approval");
      return ok ? `${billed} Approved by the ${role(ok)} on ${date(ok.effectiveAt)}: ${quoted(ok.span.quote)}${over}` : `${billed}${over}`;
    }
    case "R9_REJECTED": {
      const no = find("rejection");
      return no
        ? `${billed} The ${role(no)} said this was not agreed on ${date(no.effectiveAt)}: ${quoted(no.span.quote)}${over}`
        : `${billed}${over}`;
    }
    case "R10_LEARNED": // TODO(Dev): R10 template from SPEC.md 6; placeholder added with the 5.5 types so typecheck passes
      return billed;
  }
}
