// interpretReply (SPEC.md 9, W2 step 5). Claude reads the reply into an interpretation and approval /
// rejection facts quoted from it. Code keeps only facts about the lines asked, with real quotes,
// reads any amount from the quote itself, and handles the one follow-up allowed on an ambiguous reply.
import { z } from "zod";
import { ChargeTypeSchema, InterpretationSchema } from "../schemas";
import type { Question, SourceDoc } from "../types";
import { callClaude, type ClaudeSender } from "./client";
import { formatUSD, moneyInText } from "./money";
import { INTERPRET_REPLY_SYSTEM } from "./prompts/interpretReply";
import type { CaseState, NewFact, NewQuestion } from "./types";
import { quoteIsInText } from "./validateSpans";

const ReplySchema = z.object({
  interpretation: InterpretationSchema,
  facts: z.array(z.object({
    kind: z.enum(["approval", "rejection"]),
    chargeType: ChargeTypeSchema,
    quote: z.string(),
  })),
  followUpQuestion: z.string(),
});

export interface InterpretedReply {
  interpretation: z.infer<typeof InterpretationSchema>;
  facts: NewFact[];
  followUpQuestion: string; // Claude's wording, used only if code allows a follow-up
  dropped: string[];
}

function describe(q: Question, replyDoc: SourceDoc, state: CaseState): string {
  const lines = q.findingKeys.map((key) => {
    const f = state.findings.find((x) => x.key === key);
    const c = state.charges.find((x) => x._id === (f?.chargeId ?? key));
    return { key, line: f?.lineNo ?? c?.lineNo, chargeType: c?.chargeType, description: c?.description, billed: c && formatUSD(c.amountCents) };
  });
  return JSON.stringify({ question: q.text, askedAbout: lines, reply: replyDoc.text }, null, 2);
}

export async function interpretReply(
  q: Question, replyDoc: SourceDoc, state: CaseState, deps: { send?: ClaudeSender } = {},
): Promise<InterpretedReply> {
  const out = await callClaude({ system: INTERPRET_REPLY_SYSTEM, user: describe(q, replyDoc, state), schema: ReplySchema, send: deps.send });

  const askedTypes = new Set(q.findingKeys.flatMap((key) => {
    const f = state.findings.find((x) => x.key === key);
    return state.charges.filter((c) => c._id === (f?.chargeId ?? key)).map((c) => c.chargeType);
  }));
  const dropped: string[] = [];
  const facts: NewFact[] = [];
  for (const f of out.facts) {
    if (!askedTypes.has(f.chargeType)) { dropped.push(`${f.kind} for ${f.chargeType}: not a line that was asked about`); continue; }
    if (!quoteIsInText(f.quote, replyDoc.text)) { dropped.push(`${f.kind} for ${f.chargeType}: quote is not in the reply: "${f.quote}"`); continue; }
    // Code, not Claude, reads the amount: only when the quote states exactly one.
    const amounts = moneyInText(f.quote);
    facts.push({
      kind: f.kind,
      chargeType: f.chargeType,
      ...(amounts.length === 1 ? { amountCents: amounts[0], currency: "USD" } : {}),
      effectiveAt: replyDoc.sentAt ?? q.createdAt,
      statedBy: q.to,
      origin: "reply",
      span: { docId: replyDoc._id, locator: "reply", quote: f.quote },
    });
  }

  // Never guess: a clear answer with nothing usable in it is treated as ambiguous.
  const interpretation = out.interpretation !== "ambiguous" && facts.length === 0 ? "ambiguous" : out.interpretation;
  return { interpretation, facts, followUpQuestion: out.followUpQuestion.trim(), dropped };
}

// What happens to the question after a reply. One follow-up per thread, then the thread closes unresolved.
export function resolveReply(
  q: Question, reply: Pick<InterpretedReply, "interpretation" | "followUpQuestion">, questions: Question[],
): { questionStatus: Question["status"]; followUp: NewQuestion | null } {
  if (reply.interpretation !== "ambiguous") return { questionStatus: "answered", followUp: null };
  const alreadyFollowedUp = q.followupOf !== undefined || questions.some((x) => x.followupOf === q._id);
  if (alreadyFollowedUp) return { questionStatus: "closed_unresolved", followUp: null };
  return {
    questionStatus: "answered",
    followUp: {
      to: q.to,
      findingKeys: q.findingKeys,
      text: reply.followUpQuestion || `Sorry, we need a clear answer to go on: ${q.text}`,
      citations: q.citations,
      followupOf: q._id,
    },
  };
}
