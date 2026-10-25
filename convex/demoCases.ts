// 30 demo cases for designing the case list and screens at scale. Not part of the judged journey (that is
// Scenario A, convex/seed.ts). Each case is Scenario A or one of its 10 variations (fixtures/variations)
// under another forwarder, shipment and invoice size, left in one of the states a case goes through:
// waiting for the owner's answer, answered, approval requested, accepted, rejected, nothing to dispute.
// Findings come from the engine (reconcile); questions are a code template, so no Claude call is made.
// Amounts are scaled in the document text and in the facts and charges alike, so every quote stays an
// exact substring of its document (CLAUDE.md rule 4).
// TODO(Pranav): new file in convex/ at Dzhamal's request (design data); review before deploying.
import { v } from "convex/values";
import { z } from "zod";
import { diffFindings } from "../lib/engine/diff";
import { reconcile } from "../lib/engine/reconcile";
import { caseTotals } from "../lib/engine/totals";
import { NewChargeSchema, NewFactSchema, SourceDocSchema } from "../lib/schemas";
import type { Finding } from "../lib/types";
import scenarioA from "../fixtures/scenarioA.json";
import factsA from "../fixtures/scenarioA.facts.json";
import replyA from "../fixtures/scenarioA.reply.facts.json";
import ambig from "../fixtures/variations/A-ambig/scenario.json";
import ambigFacts from "../fixtures/variations/A-ambig/facts.json";
import clean from "../fixtures/variations/A-clean/scenario.json";
import cleanFacts from "../fixtures/variations/A-clean/facts.json";
import cny from "../fixtures/variations/A-cny/scenario.json";
import cnyFacts from "../fixtures/variations/A-cny/facts.json";
import conflict from "../fixtures/variations/A-conflict/scenario.json";
import conflictFacts from "../fixtures/variations/A-conflict/facts.json";
import dup from "../fixtures/variations/A-dup/scenario.json";
import dupFacts from "../fixtures/variations/A-dup/facts.json";
import excl from "../fixtures/variations/A-excl/scenario.json";
import exclFacts from "../fixtures/variations/A-excl/facts.json";
import late from "../fixtures/variations/A-late/scenario.json";
import lateFacts from "../fixtures/variations/A-late/facts.json";
import no from "../fixtures/variations/A-no/scenario.json";
import noFacts from "../fixtures/variations/A-no/facts.json";
import noReply from "../fixtures/variations/A-no/reply.facts.json";
import nopss from "../fixtures/variations/A-nopss/scenario.json";
import nopssFacts from "../fixtures/variations/A-nopss/facts.json";
import yes from "../fixtures/variations/A-yes/scenario.json";
import yesFacts from "../fixtures/variations/A-yes/facts.json";
import yesReply from "../fixtures/variations/A-yes/reply.facts.json";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, query, type MutationCtx } from "./_generated/server";
import { SCENARIO_A_REF } from "./seed";

type Fixture = { documents: unknown[]; case: { incoterm?: string } };
type Extracted = { facts: unknown[]; charges: unknown[] };
type Reply = { replyDoc: { text: string; sentAt?: string }; interpretation: string; facts: unknown[] };
type Source = { key: string; scenario: Fixture; extracted: Extracted; reply?: Reply };

const SOURCES: Source[] = [
  { key: "A", scenario: scenarioA, extracted: factsA, reply: replyA },
  { key: "A-yes", scenario: yes, extracted: yesFacts, reply: yesReply },
  { key: "A-no", scenario: no, extracted: noFacts, reply: noReply },
  { key: "A-ambig", scenario: ambig, extracted: ambigFacts },
  { key: "A-clean", scenario: clean, extracted: cleanFacts },
  { key: "A-cny", scenario: cny, extracted: cnyFacts },
  { key: "A-conflict", scenario: conflict, extracted: conflictFacts },
  { key: "A-dup", scenario: dup, extracted: dupFacts },
  { key: "A-excl", scenario: excl, extracted: exclFacts },
  { key: "A-late", scenario: late, extracted: lateFacts },
  { key: "A-nopss", scenario: nopss, extracted: nopssFacts },
];

/** Forwarders the cases are billed by; `short` replaces "PCL" and `contact` replaces "Derek" in the text. */
const FORWARDERS = [
  { name: "Pacific Crest Logistics", short: "PCL", contact: "Derek" },
  { name: "Kestrel Bay Logistics", short: "KBL", contact: "Anna" },
  { name: "Harbor Line Freight", short: "HLF", contact: "Marco" },
  { name: "Blue Meridian Shipping", short: "BMS", contact: "Priya" },
  { name: "Northwind Cargo", short: "NWC", contact: "Tom" },
  { name: "Atlas Ocean Partners", short: "AOP", contact: "Lena" },
] as const;

const SHIPMENTS = [
  "Bayline 40HC Ningbo-LB", "Cedar & Co 2x40HC Yantian-Oakland", "Northgate 20GP Busan-Seattle",
  "Lumen Home 40HC Shanghai-Savannah", "Bayline 40HC Qingdao-LB", "Fernwood Kitchen 40HC Xiamen-Houston",
  "Bayline spring restock 3x40HC Ningbo-Long Beach via Ontario warehouse", "Orchid Lane 20GP Haiphong-Tacoma",
  "Bayline 40HC Kaohsiung-LB", "Mesa Outdoor 2x20GP Laem Chabang-Oakland",
];

/** Invoice size relative to Scenario A ($7,500). */
const SCALES = [1, 1.3, 0.6, 2.4, 0.85, 1.75, 4, 0.45, 1.1, 3.2, 1.55, 0.7, 2.8];

type State = "question" | "answered" | "requested" | "accepted" | "rejected" | "fresh";
/** The state each case is left in, by index. */
const STATES: State[] = ["question", "requested", "accepted", "question", "fresh", "rejected", "answered", "question", "requested", "fresh"];

const REJECTION = "They really did expedite it for us. Let's pay it this time.";

/** Seeded demo cases carry invoice numbers from 4001 up; Scenario A's PCL-INV-1012 never matches. */
const DEMO_REF = /-INV-4\d{3}$/;

// ---- text and amounts ----

const dollars = (s: string) => Number(s.replace(/,/g, ""));
const withCommas = (n: number) => n.toLocaleString("en-US");
/** One scaling for every amount, so text, facts and charges agree: whole dollars, never below $1. */
const scaleDollars = (d: number, k: number) => Math.max(1, Math.round(d * k));
const scaleCents = (cents: number, k: number) => scaleDollars(cents / 100, k) * 100;

/** Rewrites money in text: "$4,500", "4,800.00", "4,615" (thousands) scale; dates, "40HC" and line numbers don't. */
function scaleText(text: string, k: number): string {
  if (k === 1) return text;
  return text.replace(/\$(\d{1,3}(?:,\d{3})*|\d+)(\.\d{2})?|\b(\d{1,3}(?:,\d{3})+|\d+)\.(\d{2})\b|\b(\d{1,3}(?:,\d{3})+)\b/g,
    (m, a: string | undefined, aDec: string | undefined, b: string | undefined, _bDec: string | undefined, c: string | undefined) => {
      if (a !== undefined) return `$${withCommas(scaleDollars(dollars(a), k))}${aDec ? ".00" : ""}`;
      if (b !== undefined) return `${withCommas(scaleDollars(dollars(b), k))}.00`;
      if (c !== undefined) return withCommas(scaleDollars(dollars(c), k));
      return m;
    });
}

type Look = { fwd: (typeof FORWARDERS)[number]; invoice: string; quote: string; k: number };

/** Forwarder names, invoice and quote numbers, and amounts, applied the same way to any text. */
function rewrite(text: string, l: Look): string {
  const named = text
    .replaceAll("PCL-INV-1012", l.invoice).replaceAll("Q-PCL-0902", l.quote)
    .replaceAll("PACIFIC CREST LOGISTICS", l.fwd.name.toUpperCase()).replaceAll("Pacific Crest Logistics", l.fwd.name)
    .replaceAll("PCL", l.fwd.short).replaceAll("Derek", l.fwd.contact);
  return scaleText(named, l.k);
}

/** Every `...Cents` amount scaled and every quote rewritten, on any fact or charge. */
function rewriteRow<T extends { span: { quote: string } }>(row: T, l: Look): T {
  const out: Record<string, unknown> = { ...row, span: { ...row.span, quote: rewrite(row.span.quote, l) } };
  for (const [key, value] of Object.entries(row)) if (key.endsWith("Cents") && typeof value === "number") out[key] = scaleCents(value, l.k);
  return out as T;
}

// ---- writing a case ----

const FixtureDocSchema = SourceDocSchema.omit({ _id: true, caseId: true, fileId: true }).extend({ id: z.string() });

/** A fixed timeline per case: documents in September, the check on Oct 20 + i hours, later steps after it. */
const at = (i: number, minutes: number) => new Date(Date.UTC(2026, 9, 20, 16 + i, minutes)).toISOString();

async function log(ctx: MutationCtx, caseId: Id<"cases">, when: string, actor: Doc<"events">["actor"], type: Doc<"events">["type"], payload: Record<string, unknown>) {
  return await ctx.db.insert("events", { caseId, at: when, actor, type, payload });
}

/** reconcile -> findings revision N+1 -> `recomputed` event, as the pipeline does, without asking Claude. */
async function recheck(ctx: MutationCtx, caseId: Id<"cases">, when: string, cause?: Id<"events">): Promise<Finding[]> {
  const c = (await ctx.db.get(caseId))!;
  const documents = await ctx.db.query("documents").withIndex("by_case", (q) => q.eq("caseId", caseId)).collect();
  const facts = await ctx.db.query("facts").withIndex("by_case", (q) => q.eq("caseId", caseId)).collect();
  const charges = await ctx.db.query("charges").withIndex("by_case", (q) => q.eq("caseId", caseId)).collect();
  const prior = await ctx.db.query("findings").withIndex("by_case_rev", (q) => q.eq("caseId", caseId).eq("revision", c.revision)).collect();
  const next = reconcile({ case: c, facts, charges, prior, documents });
  for (const f of next) {
    const { learnedRuleId, ...rest } = f;
    await ctx.db.insert("findings", {
      ...rest, caseId, chargeId: f.chargeId as Id<"charges">, factIds: f.factIds as Id<"facts">[],
      evidence: f.evidence.map((s) => ({ ...s, docId: s.docId as Id<"documents"> })),
      ...(learnedRuleId ? { learnedRuleId: learnedRuleId as Id<"learnedRules"> } : {}),
    });
  }
  await ctx.db.patch(caseId, { revision: c.revision + 1 });
  await log(ctx, caseId, when, "system", "recomputed", { revision: c.revision + 1, causedByEventId: cause, changes: diffFindings(prior, next, cause ?? "") });
  return next;
}

/** The owner's question about the lines nobody agreed to, worded by a template. */
function questionText(open: Finding[], charges: Map<string, Doc<"charges">>): string {
  const parts = open.map((f) => `line ${f.lineNo} bills ${charges.get(f.chargeId)?.description.toLowerCase()} ($${withCommas(f.billedCents / 100)})`);
  const lines = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
  return `Invoice ${lines}. ${open.length === 1 ? "It is" : "None of them is"} in the quote, emails or chats. Did anyone agree to ${open.length === 1 ? "it" : "any of them"}?`;
}

const NEEDS_REPLY: ReadonlySet<State> = new Set(["answered", "requested", "accepted", "rejected"]);
const ANSWERED = SOURCES.filter((s) => s.reply);
const UNANSWERED = SOURCES.filter((s) => !s.reply);

/** Case i's state and source: states past the answer take a source with a recorded answer, the rest cycle through the others. */
function planOf(i: number): { state: State; source: Source } {
  const state = STATES[i % STATES.length];
  let replies = 0, others = 0;
  for (let j = 0; j < i; j++) if (NEEDS_REPLY.has(STATES[j % STATES.length])) replies++; else others++;
  return NEEDS_REPLY.has(state)
    ? { state, source: ANSWERED[replies % ANSWERED.length] }
    : { state, source: [...ANSWERED, ...UNANSWERED][others % SOURCES.length] };
}

async function insertCase(ctx: MutationCtx, i: number): Promise<Id<"cases">> {
  const { state, source } = planOf(i);
  const fwd = FORWARDERS[i % FORWARDERS.length];
  const look: Look = { fwd, invoice: `${fwd.short}-INV-${4001 + i}`, quote: `Q-${fwd.short}-${3001 + i}`, k: SCALES[i % SCALES.length] };

  const caseId = await ctx.db.insert("cases", {
    title: SHIPMENTS[i % SHIPMENTS.length], shipmentRef: look.invoice, forwarder: fwd.name,
    ...(source.scenario.case.incoterm ? { incoterm: source.scenario.case.incoterm } : {}),
    baseCurrency: "USD", revision: 0, status: "open",
  });

  const docIds = new Map<string, Id<"documents">>();
  for (const raw of source.scenario.documents) {
    const { id, ...doc } = FixtureDocSchema.parse(raw);
    const docId = await ctx.db.insert("documents", {
      ...doc, caseId, title: rewrite(doc.title, look), text: rewrite(doc.text, look),
      ...(doc.sender ? { sender: rewrite(doc.sender, look) } : {}), readStatus: "read",
    });
    docIds.set(id, docId);
    await log(ctx, caseId, doc.sentAt ?? at(i, 0), "system", "doc_added", { docId });
  }
  const docId = (fixtureId: string) => docIds.get(fixtureId)!;
  for (const raw of source.extracted.facts) {
    const fact = rewriteRow(NewFactSchema.parse(raw), look);
    await ctx.db.insert("facts", { ...fact, caseId, span: { ...fact.span, docId: docId(fact.span.docId) } });
  }
  for (const raw of source.extracted.charges) {
    const charge = rewriteRow(NewChargeSchema.parse(raw), look);
    await ctx.db.insert("charges", { ...charge, caseId, docId: docId(charge.docId), span: { ...charge.span, docId: docId(charge.span.docId) } });
  }

  let findings = await recheck(ctx, caseId, at(i, 0));
  if (state === "fresh") return caseId;

  // The question, for the lines the documents can't settle.
  const charges = new Map((await ctx.db.query("charges").withIndex("by_case", (q) => q.eq("caseId", caseId)).collect()).map((c) => [c._id as string, c]));
  const open = findings.filter((f) => f.status === "needs_review" && charges.get(f.chargeId)?.currency === "USD");
  if (open.length === 0) return caseId;
  const questionId = await ctx.db.insert("questions", {
    caseId, to: "ops_lead", findingKeys: open.map((f) => f.key), text: questionText(open, charges), citations: [],
    status: "open", createdAt: at(i, 5),
  });
  await ctx.db.patch(caseId, { status: "awaiting_answer" });
  await log(ctx, caseId, at(i, 5), "agent", "question_asked", { questionId, findingKeys: open.map((f) => f.key) });
  if (state === "question" || !source.reply) return caseId;

  // The owner's recorded answer: a reply document, its facts, and the recheck.
  const reply = source.reply;
  const replyDocId = await ctx.db.insert("documents", {
    caseId, type: "reply", title: "Reply from Sam", sender: "ops_lead", sentAt: at(i, 30), text: rewrite(reply.replyDoc.text, look), readStatus: "read",
  });
  docIds.set("doc_reply_1", replyDocId);
  const factIds: Id<"facts">[] = [];
  for (const raw of reply.facts) {
    const fact = rewriteRow(NewFactSchema.parse(raw), look);
    factIds.push(await ctx.db.insert("facts", { ...fact, effectiveAt: at(i, 30), caseId, span: { ...fact.span, docId: replyDocId } }));
  }
  await ctx.db.insert("replies", {
    caseId, questionId, from: "ops_lead", docId: replyDocId, factIds,
    interpretation: z.enum(["yes", "partial", "no", "ambiguous"]).parse(reply.interpretation),
  });
  await ctx.db.patch(questionId, { status: "answered" });
  const replied = await log(ctx, caseId, at(i, 30), "ops_lead", "reply_received", { questionId, docId: replyDocId, personId: "sam" });
  findings = await recheck(ctx, caseId, at(i, 31), replied);
  await ctx.db.patch(caseId, { status: "open" });

  const disputed = findings.filter((f) => (f.status === "potential_discrepancy" || f.status === "invoice_noncompliance") && f.userVerdict !== "false_positive");
  if (state === "answered" || disputed.length === 0) return caseId;

  // Maya asks Sam to approve; Sam accepts or rejects it.
  const total = caseTotals(findings).atStake;
  const draftId = await ctx.db.insert("drafts", {
    caseId, to: "forwarder", subject: "", body: "", findingKeys: disputed.map((f) => f.key), totalDisputedCents: total,
    status: "pending_approval", createdBy: "clerk", requestedBy: "maya",
  });
  await ctx.db.patch(caseId, { status: "ready_for_approval" });
  await log(ctx, caseId, at(i, 40), "clerk", "approval_requested", { draftId, personId: "maya", findingKeys: disputed.map((f) => f.key), totalDisputedCents: total });
  if (state === "accepted") {
    await ctx.db.patch(draftId, { status: "approved", approvedBy: "sam" });
    await ctx.db.patch(caseId, { status: "approved" });
    await log(ctx, caseId, at(i, 50), "controller", "approved", { draftId, personId: "sam" });
  } else if (state === "rejected") {
    await ctx.db.patch(draftId, { status: "rejected", rejectedBy: "sam", rejectionReason: REJECTION });
    await ctx.db.patch(caseId, { status: "open" });
    await log(ctx, caseId, at(i, 50), "controller", "draft_rejected", { draftId, personId: "sam", reason: REJECTION });
  }
  return caseId;
}

async function deleteCase(ctx: MutationCtx, caseId: Id<"cases">) {
  const rows = [
    ...(await ctx.db.query("documents").withIndex("by_case", (q) => q.eq("caseId", caseId)).collect()),
    ...(await ctx.db.query("facts").withIndex("by_case", (q) => q.eq("caseId", caseId)).collect()),
    ...(await ctx.db.query("charges").withIndex("by_case", (q) => q.eq("caseId", caseId)).collect()),
    ...(await ctx.db.query("findings").withIndex("by_case_rev", (q) => q.eq("caseId", caseId)).collect()),
    ...(await ctx.db.query("questions").withIndex("by_case", (q) => q.eq("caseId", caseId)).collect()),
    ...(await ctx.db.query("replies").withIndex("by_case", (q) => q.eq("caseId", caseId)).collect()),
    ...(await ctx.db.query("drafts").withIndex("by_case", (q) => q.eq("caseId", caseId)).collect()),
    ...(await ctx.db.query("events").withIndex("by_case_at", (q) => q.eq("caseId", caseId)).collect()),
  ];
  for (const row of rows) await ctx.db.delete(row._id);
  await ctx.db.delete(caseId);
}

/**
 * `npx convex run demoCases:seedDemoCases '{"count":30}'`: replaces the seeded demo cases with `count` new
 * ones (default 30). Scenario A and cases created by uploads are left alone.
 */
export const seedDemoCases = internalMutation({
  args: { count: v.optional(v.number()) },
  returns: v.array(v.id("cases")),
  handler: async (ctx, { count = 30 }) => {
    for await (const c of ctx.db.query("cases")) if (DEMO_REF.test(c.shipmentRef)) await deleteCase(ctx, c._id);
    const ids: Id<"cases">[] = [];
    for (let i = 0; i < Math.min(count, 99); i++) ids.push(await insertCase(ctx, i));
    return ids;
  },
});

/** Removes the seeded demo cases. */
export const clearDemoCases = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    let n = 0;
    for await (const c of ctx.db.query("cases")) if (DEMO_REF.test(c.shipmentRef)) { await deleteCase(ctx, c._id); n++; }
    return n;
  },
});

/** Every case for the case list: Scenario A first, then the rest newest first. Bounded to 200. */
export const listCaseIds = query({
  args: {},
  returns: v.array(v.id("cases")),
  handler: async (ctx) => {
    const cases = await ctx.db.query("cases").order("desc").take(200);
    return [...cases.filter((c) => c.shipmentRef === SCENARIO_A_REF), ...cases.filter((c) => c.shipmentRef !== SCENARIO_A_REF)].map((c) => c._id);
  },
});
