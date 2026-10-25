import { describe, expect, it } from "vitest";
import { largeCase } from "@/components/documents/large-case";
import { historyEntries, matches, roundsOf, scenarioAHistory } from "./history";

const a = scenarioAHistory();
const big = largeCase();
const bigEntries = historyEntries(big);
const what = (code: string) => bigEntries.filter((e) => e.code === code).map((e) => e.what);

describe("roundsOf", () => {
  it("splits Scenario A into the first check, the recheck after your answer and what came after", () => {
    const rounds = roundsOf(historyEntries(a), a);
    expect(rounds.map((r) => [r.label, r.revision, r.entries.length])).toEqual([
      ["Checked at 1:50 PM", 1, 9],
      ["Rechecked at 2:05 PM after your answer", 2, 3],
      ["Since the last check", undefined, 3],
    ]);
    expect(rounds[1].entries.map((e) => e.code)).toEqual(["question_asked", "reply_received", "recomputed"]);
  });

  it("names which answer caused each recheck when a case has several questions", () => {
    expect(roundsOf(bigEntries, big).map((r) => [r.label, r.revision, r.entries.length])).toEqual([
      ["Checked at 1:52 PM", 1, 18],
      ["Rechecked at 2:05 PM after your answer about lines 12 and 14", 2, 5],
      ["Rechecked at 2:14 PM after your answer about lines 11 and 15", 3, 2],
      ["Rechecked at 2:31 PM after your answer about line 15", 4, 3],
      ["Since the last check", undefined, 7],
    ]);
  });

  it("keeps every entry exactly once, in order", () => {
    expect(roundsOf(bigEntries, big).flatMap((r) => r.entries)).toEqual(bigEntries);
  });

  it("says why a recheck happened when no answer caused it", () => {
    const e = (id: string, code: "doc_added" | "charge_edited" | "recomputed", at: string) =>
      ({ ...bigEntries[0], id, code, at });
    const rounds = roundsOf([
      e("1", "recomputed", "2026-10-24T13:00:00-07:00"),
      e("2", "doc_added", "2026-10-24T13:10:00-07:00"), e("3", "recomputed", "2026-10-24T13:11:00-07:00"),
      e("4", "charge_edited", "2026-10-24T13:20:00-07:00"), e("5", "recomputed", "2026-10-24T13:21:00-07:00"),
    ], big);
    expect(rounds.map((r) => r.label)).toEqual(["Checked at 1:00 PM", "Rechecked at 1:11 PM after new evidence", "Rechecked at 1:21 PM after your edit"]);
    expect(roundsOf([e("1", "doc_added", "2026-10-24T13:00:00-07:00")], big).map((r) => r.label)).toEqual(["Not checked yet"]);
    expect(roundsOf([], big)).toEqual([]);
  });
});

describe("historyEntries on a large case", () => {
  it("names each WhatsApp chat when a case has more than one", () => {
    expect(what("doc_added")).toContain("Added the WhatsApp chat Lin Trucking / Sam Bayline");
    expect(what("doc_added").at(-1)).toBe("Added an email");
  });

  it("says what failed: part of a document and where, or the agent step", () => {
    expect(what("extraction_failed")).toEqual([
      "Couldn't read part of the WhatsApp chat Lin Trucking / Sam Bayline: messages 18–22",
      "Couldn't read part of Delivery receipt CAIU5551234 (scan)",
      "Couldn't write the question; the lines stay waiting",
    ]);
  });

  it("tells questions, the follow-up and answers apart by their lines", () => {
    expect(what("question_asked")).toEqual(["Asked you about lines 12 and 14", "Asked you about lines 11 and 15", "Asked you a follow-up about line 15"]);
    expect(what("reply_received")).toEqual([
      "Answered the question about lines 12 and 14", "Answered the question about lines 11 and 15", "Answered the question about line 15",
    ]);
  });

  it("joins lines that land in the same group into one phrase", () => {
    expect(what("recomputed")).toEqual([
      "Checked 17 lines: 5 to dispute, 4 waiting, 8 cleared",
      "Rechecked: line 12 cleared, line 14 to dispute",
      "Rechecked: line 11 cleared",
      "Rechecked: line 15 to dispute",
    ]);
    const [first] = bigEntries.filter((e) => e.code === "recomputed");
    expect(new Set(first.quotes).size).toBe(first.quotes.length);
    const many = historyEntries({
      ...big, events: [{ ...big.events.find((e) => e.payload.revision === 2)!, payload: { revision: 2, changes: [4, 9, 6, 12].map((n) => ({
        key: `lc_${n}`, lineNo: n, from: { status: "needs_review" }, to: { status: n === 6 ? "potential_discrepancy" : "supported" },
        causedByEventId: "x", causedByFactIds: [],
      })) } }],
    });
    expect(many[0].what).toBe("Rechecked: lines 4, 9 and 12 cleared, line 6 to dispute");
  });

  it("keeps the blocked approval marked", () => {
    expect(bigEntries.filter((e) => e.blocked).map((e) => e.code)).toEqual(["approval_blocked"]);
  });
});

describe("matches", () => {
  const ids = (q: string) => bigEntries.filter((e) => matches(e, q)).map((e) => e.code);

  it("finds every step about a line, including a line inside a list", () => {
    expect(ids("line 15")).toEqual(["recomputed", "question_asked", "reply_received", "question_asked", "reply_received", "recomputed", "draft_created"]);
    expect(ids("Line 9")).toEqual(["recomputed", "finding_dismissed"]);
  });

  it("searches the sentence, who, the event code and the quoted words, ignoring case", () => {
    expect(ids("CONGESTED")).toEqual(["question_asked"]);
    expect(ids("approval_blocked")).toEqual(["approval_blocked"]);
    expect(ids("controller")).toEqual(["approval_blocked", "approved"]);
    expect(ids("   ")).toHaveLength(bigEntries.length);
    expect(ids("nothing like this")).toEqual([]);
  });

  it("a bare number finds the line and any text with it", () => {
    expect(ids("2207")).toEqual(["doc_added", "facts_extracted"]);
    expect(ids("11")).toEqual(expect.arrayContaining(["question_asked", "reply_received"]));
  });
});
