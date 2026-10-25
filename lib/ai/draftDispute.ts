// draftDispute (SPEC.md 9, W2 step 6; CLAUDE.md rule 6). Claude writes the words with no digits at all;
// code assembles the body and inserts every number and source quote from the findings.
import { z } from "zod";
import type { Finding } from "../types";
import { callClaude, type ClaudeSender } from "./client";
import { formatUSD } from "./money";
import { DRAFT_DISPUTE_SYSTEM } from "./prompts/draftDispute";
import type { CaseState } from "./types";

const DISPUTED = new Set<Finding["status"]>(["potential_discrepancy", "invoice_noncompliance"]);
const PLACEHOLDERS = ["{invoiceRef}", "{total}"];

const WordingSchema = z.object({
  subject: z.string(),
  intro: z.string(),
  lines: z.array(z.object({ key: z.string(), reason: z.string() })),
  closing: z.string(),
});
type Wording = z.infer<typeof WordingSchema>;

export interface DisputeDraft {
  subject: string;
  body: string;
  findingKeys: string[];
  totalDisputedCents: number;
}

// Lines that go into a dispute: in To dispute and not dismissed by the clerk.
export const disputedFindings = (findings: Finding[]) =>
  findings.filter((f) => DISPUTED.has(f.status) && f.userVerdict !== "false_positive").sort((a, b) => a.lineNo - b.lineNo);

function wordingProblems(w: Wording, keys: string[]): string[] {
  const problems: string[] = [];
  const texts = { subject: w.subject, intro: w.intro, closing: w.closing, ...Object.fromEntries(w.lines.map((l) => [`reason ${l.key}`, l.reason])) };
  for (const [field, text] of Object.entries(texts)) {
    const stripped = PLACEHOLDERS.reduce((t, p) => t.split(p).join(""), text);
    if (/\d/.test(stripped)) problems.push(`${field} contains a digit; numbers are inserted by code`);
    for (const m of stripped.match(/\{[^}]*\}/g) ?? []) problems.push(`${field} uses unknown placeholder ${m}`);
  }
  const got = w.lines.map((l) => l.key).sort();
  if (JSON.stringify(got) !== JSON.stringify([...keys].sort())) problems.push(`lines must be exactly ${keys.join(", ")}`);
  return problems;
}

function describe(state: CaseState, disputed: Finding[]): string {
  const docTitle = (docId: string) => state.documents.find((d) => d._id === docId)?.title ?? docId;
  const lines = disputed.map((f) => ({
    key: f.key,
    description: state.charges.find((c) => c._id === f.chargeId)?.description ?? "",
    rule: f.ruleId,
    why: f.explanation,
    sources: f.evidence.map((s) => ({ document: docTitle(s.docId), quote: s.quote })),
  }));
  return JSON.stringify({ to: "forwarder", invoiceRef: state.case.shipmentRef, disputedLines: lines }, null, 2);
}

export async function draftDispute(findings: Finding[], state: CaseState, deps: { send?: ClaudeSender } = {}): Promise<DisputeDraft> {
  const disputed = disputedFindings(findings);
  if (disputed.length === 0) throw new Error("draftDispute: no disputed lines to draft");
  const keys = disputed.map((f) => f.key);

  const w = await callClaude({
    system: DRAFT_DISPUTE_SYSTEM,
    user: describe(state, disputed),
    schema: WordingSchema,
    check: (value) => wordingProblems(value, keys),
    send: deps.send,
  });

  // Every number below comes from findings and charges, never from Claude.
  const total = disputed.reduce((sum, f) => sum + (f.deltaCents ?? 0), 0);
  const billedTotal = state.charges.reduce((sum, c) => sum + c.amountCents, 0);
  const fill = (text: string) => text.split("{invoiceRef}").join(state.case.shipmentRef).split("{total}").join(formatUSD(total));
  const docTitle = (docId: string) => state.documents.find((d) => d._id === docId)?.title ?? docId;
  const reason = (key: string) => w.lines.find((l) => l.key === key)?.reason.trim() ?? "";

  const lineText = disputed.map((f) => {
    const description = state.charges.find((c) => c._id === f.chargeId)?.description ?? `line ${f.lineNo}`;
    const amounts = `billed ${formatUSD(f.billedCents)}, agreed ${formatUSD(f.expectedCents ?? 0)}, over by ${formatUSD(f.deltaCents ?? 0)}.`;
    const sources = f.evidence.map((s) => `"${s.quote}" (${docTitle(s.docId)})`).join("; ");
    return [`Line ${f.lineNo}, ${description}: ${amounts}`, reason(f.key), sources && `Source: ${sources}.`].filter(Boolean).join(" ");
  });

  const body = [
    fill(w.intro.trim()),
    lineText.join("\n"),
    `Total disputed: ${formatUSD(total)}. Corrected invoice total: ${formatUSD(billedTotal - total)}.`,
    fill(w.closing.trim()),
  ].join("\n\n");

  return { subject: fill(w.subject.trim()), body, findingKeys: keys, totalDisputedCents: total };
}
