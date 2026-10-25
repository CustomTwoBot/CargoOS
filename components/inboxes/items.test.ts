import { describe, expect, it } from "vitest";
import { SCENARIO_A, scenarioAAt } from "@/components/case/fixture";
import { ago, approvalItems, inboxCounts, questionItems } from "./items";
import { allAsking, CASE_B, caseB, inboxCase, scenarioAWithDraft } from "./sample";

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

  it("no cases, no questions", () => {
    expect(questionItems([])).toEqual([]);
  });
});

describe("approvalItems", () => {
  it("drafts waiting for approval come first, oldest first, with total, lines and when they were drafted", () => {
    const items = approvalItems([inboxCase(SCENARIO_A, scenarioAWithDraft()), inboxCase(CASE_B, caseB("drafted"))]);
    expect(items.map((d) => [d.caseTitle, d.status, d.total, d.lineCount, d.draftedAt])).toEqual([
      ["Bayline 20GP Yantian-Oakland", "waiting", "$400", 1, "2026-10-24T11:40:00-07:00"],
      ["Bayline 40HC Ningbo-LB", "waiting", "$700", 2, "2026-10-24T14:07:00-07:00"],
    ]);
    expect(items[1]).toMatchObject({ forwarder: "Pacific Crest Logistics", subject: "Invoice PCL-INV-1012: 2 disputed lines ($700)" });
    expect(items[1].lines.map((l) => [l.lineNo, l.description, l.delta])).toEqual([
      [1, "Ocean freight 40HC Ningbo-Long Beach", "+$300"], [6, "Rush handling", "+$400"],
    ]);
  });

  it("approved drafts follow, latest approval first; rejected drafts are left out", () => {
    const rejected = { ...caseB("drafted"), drafts: [{ ...caseB("drafted").drafts[0], status: "rejected" as const }] };
    const items = approvalItems([inboxCase(CASE_B, caseB("approved")), inboxCase(SCENARIO_A, scenarioAWithDraft(true))]);
    expect(items.map((d) => [d.caseId, d.status, d.approvedAt])).toEqual([
      ["case_A", "approved", "2026-10-24T14:10:00-07:00"],
      ["case_B", "approved", "2026-10-24T11:52:00-07:00"],
    ]);
    expect(approvalItems([inboxCase(CASE_B, rejected)])).toEqual([]);
  });

  it("without a forwarder name the party is named by its role", () => {
    const [d] = approvalItems([{ demo: SCENARIO_A, x: scenarioAWithDraft() }]);
    expect(d.forwarder).toBe("Forwarder");
  });
});

describe("inboxCounts", () => {
  it("counts open questions and drafts waiting for approval, never answered or approved ones", () => {
    expect(inboxCounts(allAsking())).toEqual({ questions: 3, approvals: 0 });
    expect(inboxCounts([inboxCase(SCENARIO_A, scenarioAWithDraft()), inboxCase(CASE_B, caseB("one_answered"))]))
      .toEqual({ questions: 1, approvals: 1 });
    expect(inboxCounts([inboxCase(SCENARIO_A, scenarioAWithDraft(true)), inboxCase(CASE_B, caseB("approved"))]))
      .toEqual({ questions: 0, approvals: 0 });
    expect(inboxCounts([])).toEqual({ questions: 0, approvals: 0 });
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
