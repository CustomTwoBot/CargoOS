// The Scenario B dispute draft. In live mode Claude words the email and code inserts every number
// (CLAUDE.md rule 6); in this replay the words are fixed templates and every number, quote and line
// comes from the case's current findings, so a dismissed line drops out of the email and the total.
import type { Draft, Fact, Finding } from "@/lib/types";
import { formatShortDate } from "@/lib/engine/money";
import { money } from "@/components/case/format";
import { caseTotals, DISCREPANCY } from "@/components/case/totals";
import { currentFindings, isRechecking, type CaseInput } from "@/components/case/view-model";

const WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
const count = (n: number) => WORDS[n] ?? String(n);
const squash = (s: string) => s.replace(/\s+/g, " ").trim();
const quoted = (q: string) => `"${squash(q)}"${/[.!?]$/.test(q.trim()) ? "" : "."}`;

/** Why this line is disputed, in the words of the source it rests on. */
function reasonFor(f: Finding, x: CaseInput): string {
  const facts = new Map(x.facts.map((y) => [y._id, y]));
  const cited = f.factIds.flatMap((id) => facts.get(id) ?? []);
  const find = (kind: Fact["kind"]) => cited.find((y) => y.kind === kind);
  const docType = (y: Fact) => x.documents.find((d) => d._id === y.span.docId)?.type;
  switch (f.ruleId) {
    case "R1_DUPLICATE": {
      const other = /line (\d+)/.exec(f.evidence[0]?.locator ?? "")?.[1];
      return `It repeats ${other ? `line ${other}` : "an earlier line"} for the same amount.`;
    }
    case "R2_RATE_MISMATCH": {
      const rate = find("agreed_rate"), booked = find("booking_date");
      if (!rate) return "";
      const said = `Your ${docType(rate) ?? "quote"} of ${formatShortDate(rate.effectiveAt)} says "${squash(rate.span.quote)}"`;
      return `${said}${booked ? `, and the booking was confirmed on ${formatShortDate(booked.effectiveAt)}` : ""}.`;
    }
    case "R4_PERMITTED_SURCHARGE": {
      const clause = find("permitted_surcharge");
      return clause ? `Your quote caps it: ${quoted(clause.span.quote)}` : "";
    }
    case "R8_APPROVED": case "R9_REJECTED": {
      const said = find("approval") ?? find("rejection");
      return said ? `Our ops lead confirmed: ${quoted(said.span.quote)}` : "";
    }
    default:
      return "";
  }
}

/** The dispute for the case as it stands; undefined while a question is open, a recheck is running or nothing is disputed. */
export function draftFor(x: CaseInput): Draft | undefined {
  if (isRechecking(x) || x.questions.some((q) => q.status === "open")) return undefined;
  const current = currentFindings(x);
  const disputed = current.filter((f) => DISCREPANCY.includes(f.status) && f.userVerdict !== "false_positive");
  if (disputed.length === 0) return undefined;

  const totals = caseTotals(current);
  const charge = new Map(x.charges.map((c) => [c._id, c]));
  const invoice = x.case.shipmentRef;
  const lines = disputed.map((f) => {
    const c = charge.get(f.chargeId);
    const reason = reasonFor(f, x);
    return `Line ${f.lineNo}, ${c?.description ?? "charge"}: billed ${money(f.billedCents)}.${reason ? ` ${reason}` : ""} Over by ${money(f.deltaCents ?? 0)}.`;
  });
  const open = current.filter((f) => f.status === "needs_review").map((f) => {
    const c = charge.get(f.chargeId);
    return c && c.currency !== x.case.baseCurrency
      ? `Line ${f.lineNo} (${c.description}) is billed in ${c.currency}; we will come back to it once the exchange rate is agreed.`
      : `Line ${f.lineNo} is still being checked on our side.`;
  });
  // Agreed + waived = what we accept paying for the lines that are settled (SPEC §6 totals).
  const accepted = totals.agreedCents + totals.waivedCents;

  const body = [
    "Hi Lena,",
    "",
    `Thanks for invoice ${invoice}. Before we pay, we need to raise ${count(disputed.length)} ${disputed.length === 1 ? "line" : "lines"}:`,
    "",
    lines.join("\n\n"), // a blank line between disputed lines keeps a long list readable
    "",
    `Total disputed: ${money(totals.atStakeCents)}. Could you send a corrected invoice? The lines we agree with come to ${money(accepted)}.`,
    ...open,
    "",
    "Thanks,",
    "Priya",
    "Juniper Peak Outdoor",
  ].join("\n");

  return {
    _id: "b_draft_1", caseId: x.case._id, to: "forwarder",
    subject: `Invoice ${invoice}: ${disputed.length} disputed ${disputed.length === 1 ? "line" : "lines"} (${money(totals.atStakeCents)})`,
    body, findingKeys: disputed.map((f) => f.key), totalDisputedCents: totals.atStakeCents,
    status: "draft", createdBy: "clerk",
  };
}
