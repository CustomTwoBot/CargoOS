// planQuestion (SPEC.md 9, W2 step 4). Code decides which lines may be asked about and groups them;
// Claude decides whether a question can help and writes it, citing the documents.
import { z } from "zod";
import type { Finding, Role } from "../types";
import { callClaude, type ClaudeSender } from "./client";
import { formatUSD, moneyInText } from "./money";
import { PLAN_QUESTION_SYSTEM } from "./prompts/planQuestion";
import type { CaseState, NewQuestion } from "./types";
import { validCitations } from "./validateSpans";

// Only these needs_review rules can be resolved by a person; R1 and R2 are decided by code.
const ASKABLE_RULES = new Set<Finding["ruleId"]>(["R3_MATH_CURRENCY", "R6_NO_EVIDENCE", "R7_CONFLICT"]);
// People model (SPEC.md 5.5): only the owner (Sam, ops_lead) answers questions. The clerk is the one
// asking, the controller only approves, and the uploader sees no amounts, so every question goes to ops_lead.
const ASKED: Role = "ops_lead";

const PlanSchema = z.object({
  ask: z.boolean(),
  text: z.string(),
  citations: z.array(z.object({ docId: z.string(), locator: z.string(), quote: z.string() })),
  reason: z.string(),
});

// The group one question should cover: askable waiting lines no question already covers. They all go to
// the same person, so they are always grouped into one question. Open and closed_unresolved questions both
// cover their lines (SPEC.md 6 "Engine decisions", same rule as convex/pipeline.ts): once the owner's one
// follow-up ends unresolved, those lines are never asked about again. Only answered questions stop covering.
export function questionCandidates(state: CaseState, open: Finding[]): { to: Role; findings: Finding[] } | null {
  const covered = new Set(state.questions.filter((q) => q.status !== "answered").flatMap((q) => q.findingKeys));
  const askable = open
    .filter((f) => f.status === "needs_review" && ASKABLE_RULES.has(f.ruleId) && !covered.has(f.key))
    .sort((a, b) => a.lineNo - b.lineNo);
  return askable.length === 0 ? null : { to: ASKED, findings: askable };
}

function describe(state: CaseState, to: Role, findings: Finding[]): string {
  const charge = (f: Finding) => state.charges.find((c) => c._id === f.chargeId);
  const lines = findings.map((f) => ({
    key: f.key,
    line: f.lineNo,
    description: charge(f)?.description ?? "",
    billed: formatUSD(f.billedCents),
    rule: f.ruleId,
    missing: f.missing ?? [],
  }));
  const documents = state.documents.map((d) => ({ docId: d._id, type: d.type, title: d.title, sentAt: d.sentAt, text: d.text }));
  return JSON.stringify({ askWho: to, invoiceRef: state.case.shipmentRef, linesWaiting: lines, documents }, null, 2);
}

export async function planQuestion(state: CaseState, open: Finding[], deps: { send?: ClaudeSender } = {}): Promise<NewQuestion | null> {
  const group = questionCandidates(state, open);
  if (!group) return null; // nothing a person can answer; no Claude call

  // Dollar figures in the question must be ones code already knows: billed amounts or amounts in the cited text.
  const known = new Set(group.findings.map((f) => f.billedCents));
  const plan = await callClaude({
    system: PLAN_QUESTION_SYSTEM,
    user: describe(state, group.to, group.findings),
    schema: PlanSchema,
    check: (p) => {
      if (!p.ask) return [];
      const problems: string[] = [];
      if (p.text.trim() === "") problems.push("ask is true but text is empty");
      const quoted = new Set(p.citations.flatMap((c) => moneyInText(c.quote)));
      for (const cents of moneyInText(p.text)) {
        if (!known.has(cents) && !quoted.has(cents)) problems.push(`question mentions ${formatUSD(cents)}, which is not a billed amount`);
      }
      return problems;
    },
    send: deps.send,
  });
  if (!plan.ask) return null;

  return {
    to: group.to,
    findingKeys: group.findings.map((f) => f.key),
    text: plan.text.trim(),
    citations: validCitations(plan.citations, state.documents),
  };
}
