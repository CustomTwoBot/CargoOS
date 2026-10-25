import { describe, expect, it } from "vitest";
import { SCENARIO_A, scenarioAAt } from "@/components/case/fixture";
import { SCENARIO_B } from "@/components/demo/scenario-b/scenario-b";
import { ago, approvalItems, inboxCounts, questionItems } from "./items";
import { allAsking, CASE_B, caseB, DEMO_REJECTION, inboxCase, scenarioAWithDraft } from "./sample";

describe("questionItems", () => {
  it("lists every open question across cases, oldest first", () => {
    const items = questionItems(allAsking());
    expect(items.map((q) => [q.caseTitle, q.questionId, q.status, q.askedAt])).toEqual([
      ["Bayline 20GP Yantian-Oakland", "qB_1", "open", "2026-10-23T09:10:00-07:00"],
      ["Bayline 20GP Yantian-Oakland", "qB_2", "open", "2026-10-24T08:30:00-07:00"],
      ["Bayline 40HC Ningbo-LB", "q_1", "open", "2026-10-24T13:55:00-07:00"],
    ]);
    expect(new Set(items.map((q) => q.id)).size).toBe(3);
  });

  it("each item carries the lines it covers with their billed amounts and what waits on it", () => {
    const q = questionItems(allAsking()).find((i) => i.questionId === "q_1")!;
    expect(q.lines.map((l) => [l.lineNo, l.description, l.billed, l.group])).toEqual([
      [4, "Port congestion fee", "$200", "waiting"],
      [6, "Rush handling", "$400", "waiting"],
    ]);
    expect(q.waiting).toBe("$600");
    expect(q.answer).toBeUndefined();
    expect(q.citations[0].quote).toBe("possible congestion at LB terminal, may be extra");
  });

  it("answered questions come after the open ones, latest answer first, with the answer word for word", () => {
    const items = questionItems([inboxCase(SCENARIO_A, scenarioAAt("after")), inboxCase(CASE_B, caseB("one_answered"))]);
    expect(items.map((q) => [q.questionId, q.status])).toEqual([["qB_2", "open"], ["q_1", "answered"], ["qB_1", "answered"]]);
    const a = items[1];
    expect(a.answer).toEqual({ text: "approved the $200 congestion fee on WhatsApp, nobody agreed to $400 rush handling", at: "2026-10-24T14:05:00-07:00" });
    expect(a.waiting).toBe("$0");
    expect(a.lines.map((l) => [l.lineNo, l.group, l.delta])).toEqual([[4, "cleared", "—"], [6, "dispute", "+$400"]]);
  });

  it("each item knows its total, where its quotes come from, and whether the sources disagree", () => {
    const [a] = questionItems([inboxCase(SCENARIO_A, scenarioAAt("before"))]);
    expect(a).toMatchObject({ total: "$600", conflict: false });
    expect(a.lines.map((l) => l.code)).toEqual(["R6", "R6"]);
    expect(a.mentions.map((m) => [m.docType, m.quote])).toEqual([["chat", "possible congestion at LB terminal, may be extra"]]);
    const drayage = questionItems([inboxCase(SCENARIO_B, SCENARIO_B.at("before"))]).find((q) => q.questionId === "b_q_2")!;
    expect(drayage).toMatchObject({ total: "$5,850", conflict: true });
    expect(drayage.mentions.map((m) => m.docType)).toEqual(["email", "proforma"]);
  });

  it("labels questions when a case has more than one: Question 1, Question 2, Follow-up", () => {
    expect(questionItems([inboxCase(SCENARIO_B, SCENARIO_B.at("before"))]).map((q) => q.label)).toEqual(["Question 1", "Question 2"]);
    expect(questionItems([inboxCase(SCENARIO_B, SCENARIO_B.at("after-q2"))]).map((q) => [q.questionId, q.label]))
      .toEqual([["b_q_3", "Follow-up"], ["b_q_2", "Question 2"], ["b_q_1", "Question 1"]]);
    expect(questionItems([inboxCase(SCENARIO_A, scenarioAAt("before"))])[0].label).toBeUndefined();
  });

  it("a follow-up carries the earlier answer word for word", () => {
    const q = questionItems([inboxCase(SCENARIO_B, SCENARIO_B.at("after-q2"))]).find((i) => i.status === "open")!;
    expect(q.questionId).toBe("b_q_3");
    expect(q.followUpOf).toEqual({ answer: "Lena and I went over drayage on a call last month. I'd have to check my notes." });
  });

  it("replay: says the recorded answer is read, and blocks answers out of the recorded order", () => {
    const [fees, drayage] = questionItems([inboxCase(SCENARIO_B, SCENARIO_B.at("before"))]);
    expect(fees.replay).toEqual({ note: "Replay of a recorded run: CargoOS reads the recorded answer.", blocked: undefined });
    expect(drayage.replay?.blocked).toBe("Answer Question 1 in this case first. In this replay the answers play in the order they were recorded.");
    const [b] = questionItems([inboxCase(CASE_B, caseB("asking"))]);
    expect(b.replay).toEqual({ note: "This replay has no recorded answer for this question." });
  });

  it("no cases, no questions", () => {
    expect(questionItems([])).toEqual([]);
  });
});

describe("approvalItems", () => {
  it("requests to decide come first, oldest request first, with who asked, total, lines and chips' numbers", () => {
    const items = approvalItems([inboxCase(SCENARIO_A, scenarioAWithDraft()), inboxCase(CASE_B, caseB("drafted"))]);
    expect(items.map((d) => [d.caseTitle, d.status, d.total, d.lineCount, d.requestedBy, d.requestedAt])).toEqual([
      ["Bayline 20GP Yantian-Oakland", "pending", "$400", 1, "maya", "2026-10-24T11:40:05-07:00"],
      ["Bayline 40HC Ningbo-LB", "pending", "$700", 2, "maya", "2026-10-24T14:07:05-07:00"],
    ]);
    expect(items[1]).toMatchObject({ forwarder: "Pacific Crest Logistics", subject: "", message: "" });
    expect(items[1].lines.map((l) => [l.lineNo, l.description, l.agreed, l.billed, l.delta])).toEqual([
      [1, "Ocean freight 40HC Ningbo-Long Beach", "$4,500", "$4,800", "+$300"],
      [6, "Rush handling", undefined, "$400", "+$400"],
    ]);
  });

  it("still reads drafts the replay store wrote before lib/types Draft had the decision fields", () => {
    const x = scenarioAWithDraft("rejected");
    const legacy = { ...x, events: x.events.filter((e) => e.type !== "draft_rejected"),
      drafts: x.drafts.map((d) => ({ ...d, rejectedBy: "you", rejectedAt: "2026-10-24T14:12:00-07:00" })) };
    expect(approvalItems([inboxCase(SCENARIO_A, legacy)])[0]).toMatchObject({ decidedBy: "you", decidedAt: "2026-10-24T14:12:00-07:00" });
  });

  it("decided ones follow, latest decision first: accepted with the message, rejected with the reason", () => {
    const items = approvalItems([inboxCase(CASE_B, caseB("approved")), inboxCase(SCENARIO_A, scenarioAWithDraft("rejected"))]);
    expect(items.map((d) => [d.caseId, d.status, d.decidedBy, d.decidedAt])).toEqual([
      ["case_A", "rejected", "sam", "2026-10-24T14:10:00-07:00"],
      ["case_B", "accepted", "sam", "2026-10-24T11:52:00-07:00"],
    ]);
    expect(items[0]).toMatchObject({ rejectionReason: DEMO_REJECTION, message: "" });
    expect(items[1].subject).toBe("Invoice PCL-INV-2210: 1 disputed line ($400)");
    expect(items[1].message).toMatch(/^Hi Derek,/);
  });

  it("an edited message replaces CargoOS's draft", () => {
    const x = scenarioAWithDraft("accepted");
    const [d] = approvalItems([inboxCase(SCENARIO_A, { ...x, drafts: [{ ...x.drafts[0], editedBody: "Hi Derek, edited." } as typeof x.drafts[0]] })]);
    expect(d.message).toBe("Hi Derek, edited.");
  });

  it("drafts nobody requested yet stay out", () => {
    const x = scenarioAWithDraft();
    expect(approvalItems([inboxCase(SCENARIO_A, { ...x, drafts: [{ ...x.drafts[0], status: "draft" }] })])).toEqual([]);
  });

  it("without a forwarder name the party is named by its role", () => {
    const [d] = approvalItems([{ demo: SCENARIO_A, x: scenarioAWithDraft() }]);
    expect(d.forwarder).toBe("Forwarder");
  });
});

describe("inboxCounts", () => {
  it("counts open questions, requests to decide and rejections, never answered or accepted ones", () => {
    expect(inboxCounts(allAsking())).toEqual({ questions: 3, approvals: 0, rejected: 0 });
    expect(inboxCounts([inboxCase(SCENARIO_A, scenarioAWithDraft()), inboxCase(CASE_B, caseB("one_answered"))]))
      .toEqual({ questions: 1, approvals: 1, rejected: 0 });
    expect(inboxCounts([inboxCase(SCENARIO_A, scenarioAWithDraft("rejected")), inboxCase(CASE_B, caseB("approved"))]))
      .toEqual({ questions: 0, approvals: 0, rejected: 1 });
    expect(inboxCounts([])).toEqual({ questions: 0, approvals: 0, rejected: 0 });
  });
});

describe("ago", () => {
  const now = new Date("2026-10-24T15:55:00-07:00");
  it("says how long something has waited in plain words", () => {
    expect(ago("2026-10-24T15:54:40-07:00", now)).toBe("just now");
    expect(ago("2026-10-24T15:54:00-07:00", now)).toBe("1 minute ago");
    expect(ago("2026-10-24T15:10:00-07:00", now)).toBe("45 minutes ago");
    expect(ago("2026-10-24T13:55:00-07:00", now)).toBe("2 hours ago");
    expect(ago("2026-10-23T09:10:00-07:00", now)).toBe("yesterday");
    expect(ago("2026-10-20T09:10:00-07:00", now)).toBe("4 days ago");
    expect(ago("2026-10-24T16:30:00-07:00", now)).toBe("just now");
  });
});
