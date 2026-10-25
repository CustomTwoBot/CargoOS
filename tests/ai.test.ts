import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { callClaude, ClaudeError, type ClaudeReply, type ClaudeSender } from "@/lib/ai/client";
import { draftDispute } from "@/lib/ai/draftDispute";
import { interpretReply, resolveReply } from "@/lib/ai/interpretReply";
import { formatUSD, moneyInText } from "@/lib/ai/money";
import { planQuestion, questionCandidates } from "@/lib/ai/planQuestion";
import { validateSpans } from "@/lib/ai/validateSpans";
import type { NewCharge, NewFact } from "@/lib/ai/types";
import { reconcile } from "@/lib/engine/reconcile";
import type { Charge, Fact, Finding, Question } from "@/lib/types";
import answerKey from "@/fixtures/scenarioA.json";
import scenarioFacts from "@/fixtures/scenarioA.facts.json";
import replyFixture from "@/fixtures/scenarioA.reply.facts.json";
import { z } from "zod";
import { AI_CASES, hasRecording, INPUTS, recordingSender, replaySender, type AmbigResult, type ScreenshotResult } from "./aiCases";

// ---- Fakes (unit tests of our code; recordings below test the real model) ----

const reply = (value: unknown): ClaudeReply => ({ stopReason: "end_turn", text: typeof value === "string" ? value : JSON.stringify(value) });
function fakeSender(...replies: ClaudeReply[]): ClaudeSender & { calls: number } {
  const send = Object.assign(async () => {
    const next = replies[send.calls++];
    if (!next) throw new Error("fake Claude called more times than expected");
    return next;
  }, { calls: 0 });
  return send;
}
const neverCalled: ClaudeSender = async () => { throw new Error("Claude must not be called here"); };

const Answer = z.object({ answer: z.string() });

describe("callClaude", () => {
  it("retries once: invalid JSON then valid succeeds", async () => {
    const send = fakeSender(reply("{not json"), reply({ answer: "ok" }));
    await expect(callClaude({ system: "s", user: "u", schema: Answer, send })).resolves.toEqual({ answer: "ok" });
    expect(send.calls).toBe(2);
  });

  it("invalid output twice throws a typed error", async () => {
    const send = fakeSender(reply("nope"), reply({ wrong: 1 }));
    const err = await callClaude({ system: "s", user: "u", schema: Answer, send }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ClaudeError);
    expect(err).toMatchObject({ kind: "invalid_output", attempts: 2 });
    expect(send.calls).toBe(2);
  });

  it("treats failed checks and cut-off output as invalid", async () => {
    const send = fakeSender({ stopReason: "max_tokens", text: '{"answer": "o' }, reply({ answer: "bad" }), reply({ answer: "good" }));
    const check = (v: { answer: string }) => (v.answer === "bad" ? ["bad answer"] : []);
    await expect(callClaude({ system: "s", user: "u", schema: Answer, check, send })).rejects.toMatchObject({ kind: "invalid_output" });
    await expect(callClaude({ system: "s", user: "u", schema: Answer, check, send })).resolves.toEqual({ answer: "good" });
  });

  it("does not retry a refusal", async () => {
    const send = fakeSender({ stopReason: "refusal", text: "" });
    await expect(callClaude({ system: "s", user: "u", schema: Answer, send })).rejects.toMatchObject({ kind: "refusal", attempts: 1 });
    expect(send.calls).toBe(1);
  });

  it("fails without a network call when no API key is set", async () => {
    const saved = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      await expect(callClaude({ system: "s", user: "u", schema: Answer })).rejects.toMatchObject({ kind: "missing_api_key" });
    } finally {
      if (saved !== undefined) process.env.ANTHROPIC_API_KEY = saved;
    }
  });

  it("sends the configured model and a JSON schema", async () => {
    let seen: Parameters<ClaudeSender>[0] | undefined;
    await callClaude({ system: "s", user: "u", schema: Answer, send: async (r) => { seen = r; return reply({ answer: "x" }); } });
    expect(seen).toMatchObject({ model: "claude-sonnet-5-5", system: "s", user: "u" });
    expect(seen?.jsonSchema).toMatchObject({ type: "object" });
  });
});

describe("validateSpans", () => {
  const doc = { _id: "doc_email", text: "Hi Maya, we can do better on ocean. Ocean freight reduced to $4,500 if booked by Sep 10." };
  const fact = (quote: string, docId = "doc_email") => ({ kind: "agreed_rate", span: { docId, locator: "email body", quote } });

  it("keeps an exact match and drops a paraphrase, reporting what was dropped", () => {
    const exact = fact("Ocean freight reduced to $4,500 if booked by Sep 10");
    const paraphrase = fact("Ocean freight is now $4,500 when booked before Sep 10");
    const out = validateSpans({ facts: [exact, paraphrase] }, doc);
    expect(out.facts).toEqual([exact]);
    expect(out.dropped).toEqual([{ kind: "fact", item: paraphrase, reason: expect.stringContaining("not in doc_email") }]);
  });

  it("tolerates whitespace differences only", () => {
    expect(validateSpans({ facts: [fact("Ocean   freight\nreduced to $4,500")] }, doc).facts).toHaveLength(1);
    expect(validateSpans({ facts: [fact("ocean freight reduced to $4,500")] }, doc).facts).toHaveLength(0);
  });

  it("drops spans that point at another document, and empty quotes", () => {
    const out = validateSpans({ facts: [fact("Hi Maya", "doc_chat"), fact("  ")], charges: [fact("Hi Maya")] }, doc);
    expect(out.facts).toEqual([]);
    expect(out.charges).toHaveLength(1);
    expect(out.dropped.map((d) => d.reason)).toEqual([expect.stringContaining("points at doc_chat"), expect.stringContaining("not in")]);
  });
});

describe("money helpers", () => {
  it("formats and reads dollar amounts as cents", () => {
    expect([formatUSD(480000), formatUSD(7500), formatUSD(480050), formatUSD(0)]).toEqual(["$4,800", "$75", "$4,800.50", "$0"]);
    expect(moneyInText("approved the $200 fee, not $1,400.50 or 300")).toEqual([20000, 140050]);
  });
});

// ---- planQuestion code rules ----

const plan = (over: Record<string, unknown> = {}) => reply({ ask: true, text: "Did anyone agree to lines 4 and 6?", citations: [], reason: "r", ...over });

describe("planQuestion code rules", () => {
  it("only R3, R6 and R7 waiting lines can be asked about, grouped for one person", () => {
    const state = INPUTS.planA;
    const extra: Finding[] = [
      { ...state.findings[0], key: "chg_x", lineNo: 9, status: "needs_review", ruleId: "R3_MATH_CURRENCY" },
      { ...state.findings[0], key: "chg_y", lineNo: 10, status: "needs_review", ruleId: "R7_CONFLICT" },
    ];
    expect(questionCandidates(state, [...state.findings, ...extra])?.findings.map((f) => f.lineNo)).toEqual([4, 6, 9, 10]);
    expect(questionCandidates(state, state.findings)?.to).toBe("ops_lead");
  });

  it("asks nothing, without calling Claude, when no line is askable (A-clean)", async () => {
    await expect(planQuestion(INPUTS.planClean, INPUTS.planClean.findings, { send: neverCalled })).resolves.toBeNull();
  });

  it("never asks again about a line already in an open question; closed questions don't block", async () => {
    const open: Question = { ...INPUTS.questionA, status: "open" };
    const state = { ...INPUTS.planA, questions: [open] };
    await expect(planQuestion(state, state.findings, { send: neverCalled })).resolves.toBeNull();
    const closed = { ...INPUTS.planA, questions: [{ ...open, status: "closed_unresolved" as const }] };
    await expect(planQuestion(closed, closed.findings, { send: fakeSender(plan()) })).resolves.toMatchObject({ findingKeys: ["chg_4", "chg_6"] });
  });

  it("code sets the lines covered and drops citations that are not real quotes", async () => {
    const q = await planQuestion(INPUTS.planA, INPUTS.planA.findings, {
      send: fakeSender(plan({
        citations: [
          { docId: "doc_chat", locator: "msg", quote: "possible congestion at LB terminal, may be extra" },
          { docId: "doc_chat", locator: "msg", quote: "congestion will definitely be extra" },
        ],
      })),
    });
    expect(q).toEqual({
      to: "ops_lead", findingKeys: ["chg_4", "chg_6"], text: "Did anyone agree to lines 4 and 6?",
      citations: [{ docId: "doc_chat", locator: "msg", quote: "possible congestion at LB terminal, may be extra" }],
    });
  });

  it("returns null when Claude says no question can help", async () => {
    await expect(planQuestion(INPUTS.planA, INPUTS.planA.findings, { send: fakeSender(plan({ ask: false, text: "" })) })).resolves.toBeNull();
  });

  it("rejects a question with an amount code doesn't know, then retries", async () => {
    const send = fakeSender(plan({ text: "Line 4 bills $250, line 6 $400: agreed?" }), plan({ text: "Line 4 bills $200, line 6 $400: agreed?" }));
    await expect(planQuestion(INPUTS.planA, INPUTS.planA.findings, { send })).resolves.toMatchObject({ text: "Line 4 bills $200, line 6 $400: agreed?" });
    expect(send.calls).toBe(2);
  });
});

// ---- interpretReply code rules ----

describe("interpretReply code rules", () => {
  const out = (facts: unknown[], interpretation = "partial", followUpQuestion = "") => reply({ interpretation, facts, followUpQuestion });
  const doc = INPUTS.replyDoc("A");
  const state = INPUTS.replyState("A");

  it("builds facts in code: amount read from the quote, stated by the person asked, dated by the reply", async () => {
    const r = await interpretReply(INPUTS.questionA, doc, state, { send: fakeSender(out([
      { kind: "approval", chargeType: "congestion", quote: "approved the $200 congestion fee on WhatsApp" },
    ])) });
    expect(r.facts).toEqual([{
      kind: "approval", chargeType: "congestion", amountCents: 20000, currency: "USD",
      effectiveAt: doc.sentAt, statedBy: "ops_lead", origin: "reply",
      span: { docId: doc._id, locator: "reply", quote: "approved the $200 congestion fee on WhatsApp" },
    }]);
  });

  it("drops facts about lines not asked, and quotes not in the reply", async () => {
    const r = await interpretReply(INPUTS.questionA, doc, state, { send: fakeSender(out([
      { kind: "approval", chargeType: "ocean_freight", quote: "approved the $200 congestion fee on WhatsApp" },
      { kind: "rejection", chargeType: "handling", quote: "nobody approved the rush fee" },
      { kind: "rejection", chargeType: "handling", quote: "nobody agreed to $400 rush handling" },
    ])) });
    expect(r.facts.map((f) => [f.kind, f.chargeType, f.amountCents])).toEqual([["rejection", "handling", 40000]]);
    expect(r.dropped).toHaveLength(2);
  });

  it("a clear answer with no usable facts is treated as ambiguous", async () => {
    const r = await interpretReply(INPUTS.questionA, doc, state, { send: fakeSender(out([], "yes")) });
    expect(r.interpretation).toBe("ambiguous");
  });
});

describe("resolveReply", () => {
  const q = INPUTS.questionA;
  it("a clear reply answers the question", () => {
    expect(resolveReply(q, { interpretation: "partial", followUpQuestion: "" }, [q])).toEqual({ questionStatus: "answered", followUp: null });
  });
  it("the first ambiguous reply gets one follow-up; the next closes the thread unresolved", () => {
    const first = resolveReply(q, { interpretation: "ambiguous", followUpQuestion: "Yes or no for each line?" }, [q]);
    expect(first.followUp).toMatchObject({ followupOf: q._id, to: "ops_lead", findingKeys: q.findingKeys, text: "Yes or no for each line?" });
    const followUp: Question = { ...first.followUp!, _id: "q_2", caseId: q.caseId, status: "open", createdAt: q.createdAt };
    expect(resolveReply(followUp, { interpretation: "ambiguous", followUpQuestion: "again?" }, [q, followUp]))
      .toEqual({ questionStatus: "closed_unresolved", followUp: null });
    // Even replying to the original again cannot start a second follow-up.
    expect(resolveReply(q, { interpretation: "ambiguous", followUpQuestion: "" }, [q, followUp]).followUp).toBeNull();
  });
});

// ---- draftDispute code rules ----

const wording = (over: Record<string, unknown> = {}) => reply({
  subject: "Disputed charges on invoice {invoiceRef}",
  intro: "Hi Derek, a few lines need correcting before we can pay.",
  lines: [{ key: "chg_1", reason: "The amended email rate applies." }, { key: "chg_6", reason: "Nobody on our side agreed to it." }],
  closing: "Please send a corrected invoice. Thanks, Accounts payable",
  ...over,
});

// Every dollar figure in the body must be a number code took from the findings.
function expectNumbersFromFindings(body: string, findings: Finding[], billedTotal: number) {
  const disputed = findings.filter((f) => f.status === "potential_discrepancy");
  const total = disputed.reduce((s, f) => s + (f.deltaCents ?? 0), 0);
  const allowed = new Set([...disputed.flatMap((f) => [f.billedCents, f.expectedCents ?? 0, f.deltaCents ?? 0]), total, billedTotal - total]);
  const amounts = moneyInText(body);
  expect(amounts.length).toBeGreaterThan(0);
  for (const cents of amounts) expect(allowed, `${formatUSD(cents)} is not from the findings`).toContain(cents);
  expect(body).toContain(`Total disputed: ${formatUSD(total)}.`);
  for (const f of disputed) expect(body).toContain(`Line ${f.lineNo}, `);
}

describe("draftDispute code rules", () => {
  const state = INPUTS.draftA;

  it("code inserts every number; Claude's words carry none", async () => {
    const d = await draftDispute(state.findings, state, { send: fakeSender(wording()) });
    expect(d).toMatchObject({ subject: "Disputed charges on invoice PCL-INV-1012", findingKeys: ["chg_1", "chg_6"], totalDisputedCents: 70000 });
    expect(d.body).toContain("Line 1, Ocean freight 40HC Ningbo-Long Beach: billed $4,800, agreed $4,500, over by $300.");
    expect(d.body).toContain("Total disputed: $700. Corrected invoice total: $6,800.");
    expectNumbersFromFindings(d.body, state.findings, 750000);
  });

  it("rejects wording with digits or missing lines, retries, then fails with a typed error", async () => {
    const send = fakeSender(wording({ intro: "We owe $6,800 per the quote." }), wording({ lines: [{ key: "chg_1", reason: "x" }] }));
    await expect(draftDispute(state.findings, state, { send })).rejects.toMatchObject({ kind: "invalid_output" });
    expect(send.calls).toBe(2);
  });

  it("skips dismissed lines and refuses when nothing is disputed", async () => {
    const dismissed = state.findings.map((f) => (f.lineNo === 6 ? { ...f, userVerdict: "false_positive" as const } : f));
    const d = await draftDispute(dismissed, state, { send: fakeSender(wording({ lines: [{ key: "chg_1", reason: "Email rate applies." }] })) });
    expect([d.findingKeys, d.totalDisputedCents]).toEqual([["chg_1"], 30000]);
    await expect(draftDispute(INPUTS.planClean.findings, INPUTS.planClean, { send: neverCalled })).rejects.toThrow("no disputed lines");
  });
});

// ---- Record / replay mechanism ----

describe("recordings", () => {
  it("replays what was recorded, and fails loudly when the request changed", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cargoos-rec-"));
    const recorder = recordingSender("draftDispute-A", fakeSender(wording()), dir);
    const live = await AI_CASES["draftDispute-A"](recorder.send);
    recorder.save("claude-sonnet-5-5");
    expect(hasRecording("draftDispute-A", dir)).toBe(true);
    await expect(AI_CASES["draftDispute-A"](replaySender("draftDispute-A", dir))).resolves.toEqual(live);
    await expect(AI_CASES["planQuestion-A"](replaySender("draftDispute-A", dir))).rejects.toThrow("request differs from the recording");
  });
});

// ---- Recorded responses from the real model (create with `npm run record`) ----

const recorded = (name: keyof typeof AI_CASES) => describe.skipIf(!hasRecording(name))(`recorded: ${name}`, () => {
  it("matches the expected result from the fixtures", async () => {
    await EXPECT[name]();
  });
});

const sortFacts = (facts: { kind: string; chargeType?: string; amountCents?: number }[]) =>
  facts.map((f) => [f.kind, f.chargeType, f.amountCents]).sort((a, b) => String(a[1]).localeCompare(String(b[1])));

const EXPECT: Record<keyof typeof AI_CASES, () => Promise<void>> = {
  "planQuestion-A": async () => {
    const q = await AI_CASES["planQuestion-A"](replaySender("planQuestion-A"));
    expect(q).toMatchObject({ to: "ops_lead", findingKeys: ["chg_4", "chg_6"] });
  },
  "planQuestion-A-nopss": async () => {
    const q = await AI_CASES["planQuestion-A-nopss"](replaySender("planQuestion-A-nopss"));
    expect(q).toMatchObject({ to: "ops_lead", findingKeys: ["chg_2", "chg_4", "chg_6"] });
  },
  "interpretReply-A": async () => {
    const r = await AI_CASES["interpretReply-A"](replaySender("interpretReply-A"));
    expect(r.interpretation).toBe("partial");
    expect(sortFacts(r.facts)).toEqual([["approval", "congestion", 20000], ["rejection", "handling", 40000]]);
  },
  "interpretReply-A-no": async () => {
    const r = await AI_CASES["interpretReply-A-no"](replaySender("interpretReply-A-no"));
    expect(r.interpretation).toBe("no");
    expect(sortFacts(r.facts)).toEqual([["rejection", "congestion", undefined], ["rejection", "handling", undefined]]);
  },
  "interpretReply-A-yes": async () => {
    const r = await AI_CASES["interpretReply-A-yes"](replaySender("interpretReply-A-yes"));
    expect(r.interpretation).toBe("yes");
    expect(sortFacts(r.facts)).toEqual([["approval", "congestion", undefined], ["approval", "handling", undefined]]);
  },
  "interpretReply-A-ambig": async () => {
    const r: AmbigResult = await AI_CASES["interpretReply-A-ambig"](replaySender("interpretReply-A-ambig"));
    expect([r.first.interpretation, r.first.facts]).toEqual(["ambiguous", []]);
    expect(r.firstResolution.followUp).toMatchObject({ followupOf: "q_1", findingKeys: ["chg_4", "chg_6"] });
    expect([r.second.interpretation, r.second.facts]).toEqual(["ambiguous", []]);
    expect(r.secondResolution).toEqual({ questionStatus: "closed_unresolved", followUp: null });
  },
  "draftDispute-A": async () => {
    const d = await AI_CASES["draftDispute-A"](replaySender("draftDispute-A"));
    expect([d.findingKeys, d.totalDisputedCents]).toEqual([["chg_1", "chg_6"], 70000]);
    expectNumbersFromFindings(d.body, INPUTS.draftA.findings, 750000);
    for (const cents of moneyInText(d.subject)) expect(cents).toBe(70000);
  },
  "extract-live-quote": async () => {
    const x = await AI_CASES["extract-live-quote"](replaySender("extract-live-quote"));
    expect(factKeys(x.facts)).toEqual(factKeys(fixtureFacts("doc_quote")));
    expect(x.charges).toEqual([]);
  },
  "extract-live-invoice": async () => {
    const x = await AI_CASES["extract-live-invoice"](replaySender("extract-live-invoice"));
    expect(chargeKeys(x.charges)).toEqual(chargeKeys(scenarioFacts.charges as Charge[]));
    expect(x.facts).toEqual([]);
  },
  "extract-live-email": async () => {
    const x = await AI_CASES["extract-live-email"](replaySender("extract-live-email"));
    expect(factKeys(x.facts)).toEqual(factKeys(fixtureFacts("doc_email")));
    expect(x.facts[0].effectiveAt).toBe("2026-09-05T14:21:00-07:00"); // the email's Date header, to the minute
  },
  "extract-live-chat": async () => {
    const x = await AI_CASES["extract-live-chat"](replaySender("extract-live-chat"));
    expect(factKeys(x.facts)).toEqual(factKeys(fixtureFacts("doc_chat")));
    expect(x.facts.some((f) => f.span.quote.includes("may be extra"))).toBe(false); // hedged, not a fact
  },
  "transcribe-live-whatsapp-png": async () => {
    const r: ScreenshotResult = await AI_CASES["transcribe-live-whatsapp-png"](replaySender("transcribe-live-whatsapp-png"));
    expect(r.transcription.readable).toBe(true);
    const text = r.transcription.readable ? normalize(r.transcription.text) : "";
    for (const message of CHAT_MESSAGES) expect(text).toContain(normalize(message));
    const booking = r.extraction?.facts.find((f) => f.kind === "booking_date");
    expect(booking).toMatchObject({ statedBy: "forwarder", fromImage: true });
    expect(booking?.effectiveAt.slice(0, 10)).toBe("2026-09-08");
    expect(r.extraction?.facts.every((f) => f.fromImage)).toBe(true);
    expect(r.extraction?.facts.some((f) => f.span.quote.includes("may be extra"))).toBe(false);
  },
  "transcribe-unreadable-png": async () => {
    const t = await AI_CASES["transcribe-unreadable-png"](replaySender("transcribe-unreadable-png"));
    expect(t.readable).toBe(false);
    if (!t.readable) expect(t.reason.length).toBeGreaterThan(0);
  },
};

// ---- Live demo files end to end: the 4 extractions -> the engine -> the Scenario A answer key ----

const normalize = (s: string) => s.replace(/\s+/g, " ").trim();
const CHAT_MESSAGES = answerKey.documents.find((d) => d.id === "doc_chat")!.text.split("\n").map((l) => l.slice(l.indexOf(": ") + 2));
const fixtureFacts = (docId: string) => (scenarioFacts.facts as Fact[]).filter((f) => f.span.docId === docId);
const factKeys = (facts: (NewFact | Fact)[]) => facts.map((f) => [
  f.kind, f.chargeType ?? null, f.amountCents ?? null, f.currency ?? null, f.condition?.bookedBy ?? null,
  f.validUntil ?? null, f.statedBy, f.effectiveAt.slice(0, 10),
].join("|")).sort();
const chargeKeys = (charges: (NewCharge | Charge)[]) => charges
  .map((c) => [c.lineNo, c.chargeType, c.amountCents, c.currency, normalize(c.description)].join("|")).sort();

const LIVE_TEXT_CASES = ["extract-live-quote", "extract-live-invoice", "extract-live-email", "extract-live-chat"] as const;

describe.skipIf(!LIVE_TEXT_CASES.every((n) => hasRecording(n)))("recorded: live demo files end to end", () => {
  it("extracted facts and charges reproduce the Scenario A answer key, before and after the reply", async () => {
    const out = await Promise.all(LIVE_TEXT_CASES.map((n) => AI_CASES[n](replaySender(n))));
    const c = { ...scenarioFacts.case, revision: 0 } as Parameters<typeof reconcile>[0]["case"];
    const facts: Fact[] = out.flatMap((x) => x.facts).map((f, i) => ({ ...f, _id: `fact_${i}`, caseId: c._id }));
    const charges: Charge[] = out.flatMap((x) => x.charges).map((ch) => ({ ...ch, _id: `chg_${ch.lineNo}`, caseId: c._id }));
    expect(factKeys(facts)).toEqual(factKeys(scenarioFacts.facts as Fact[]));

    const pick = (f: { lineNo: number; status: string; ruleId: string; deltaCents?: number }) => [f.lineNo, f.status, f.ruleId, f.deltaCents ?? null];
    const before = reconcile({ case: c, facts, charges });
    expect(before.map(pick)).toEqual(answerKey.expected.findings.map(pick));
    const after = reconcile({ case: { ...c, revision: 1 }, facts: [...facts, ...(replyFixture.facts as Fact[])], charges, prior: before });
    expect(after.map(pick)).toEqual(answerKey.expected.replies[0].findingsAfter.map(pick));
    const atStake = (fs: Finding[]) => fs.filter((f) => f.status === "potential_discrepancy").reduce((s, f) => s + (f.deltaCents ?? 0), 0);
    expect([atStake(before), atStake(after)]).toEqual([30000, 70000]);
  });
});

(Object.keys(AI_CASES) as (keyof typeof AI_CASES)[]).forEach(recorded);
