import { describe, expect, it } from "vitest";
import type { CaseEvent } from "@/lib/types";
import { byPhase, clockPT, historyEntries, linesPhrase, scenarioAHistory, storySteps, whoLabel } from "./history";

const x = scenarioAHistory();
const entries = historyEntries(x);

// Scenario A after the answer, drafted and approved: one line per CaseEvent, oldest first.
const EXPECTED: [string, string, CaseEvent["type"]][] = [
  ["CargoOS rules", "Added Quote Q-PCL-0902", "doc_added"],
  ["CargoOS rules", "Added the Sep 5 email", "doc_added"],
  ["CargoOS rules", "Added the WhatsApp chat", "doc_added"],
  ["CargoOS rules", "Added Invoice PCL-INV-1012", "doc_added"],
  ["CargoOS agent", "Read Quote Q-PCL-0902: 7 terms", "facts_extracted"],
  ["CargoOS agent", "Read the Sep 5 email: 1 term", "facts_extracted"],
  ["CargoOS agent", "Read the WhatsApp chat: 1 term", "facts_extracted"],
  ["CargoOS agent", "Read Invoice PCL-INV-1012: 8 charges", "facts_extracted"],
  ["CargoOS rules", "Checked 8 lines: 1 to dispute, 2 waiting, 5 cleared", "recomputed"],
  ["CargoOS agent", "Asked you about lines 4 and 6", "question_asked"],
  ["You · ops lead", "Answered the question", "reply_received"],
  ["CargoOS rules", "Rechecked: line 4 cleared, line 6 to dispute", "recomputed"],
  ["You · clerk", "Drafted a $700 dispute for lines 1 and 6", "draft_created"],
  ["You · clerk", "Asked for approval", "approval_requested"],
  ["You · controller", "Approved the dispute. Nothing was sent.", "approved"],
];

describe("historyEntries", () => {
  it("turns every Scenario A event into who / what / code, oldest first", () => {
    expect(entries.map((e) => [whoLabel(e), e.what, e.code])).toEqual(EXPECTED);
  });

  it("orders by instant, not by array position or string", () => {
    const shuffled = { ...x, events: [...x.events].reverse() };
    expect(historyEntries(shuffled).map((e) => e.id)).toEqual(entries.map((e) => e.id));
  });

  it("shows times in Pacific time", () => {
    expect(clockPT(entries[0].at)).toBe("1:50 PM");
    expect(clockPT(entries.at(-1)!.at)).toBe("2:09 PM");
    expect(clockPT("2026-10-24T21:05:00Z")).toBe("2:05 PM");
  });

  it("keeps the words that caused a step, verbatim", () => {
    const byCode = (i: number) => entries[i].quotes;
    expect(byCode(8)).toEqual(["Ocean freight reduced to $4,500 if booked by Sep 10", "Booking confirmed for your 40HC, booked today Sep 8"]);
    expect(byCode(9)).toEqual(["possible congestion at LB terminal, may be extra"]);
    expect(byCode(10)).toEqual(["approved the $200 congestion fee on WhatsApp, nobody agreed to $400 rush handling"]);
    expect(byCode(11)).toEqual(["approved the $200 congestion fee on WhatsApp", "nobody agreed to $400 rush handling"]);
  });

  it("groups into the four phases", () => {
    expect(byPhase(entries).map((g) => [g.phase, g.entries.length])).toEqual([
      ["documents", 8], ["checked", 1], ["question", 3], ["dispute", 3],
    ]);
  });

  it("marks approval_blocked and names the line of a verdict", () => {
    const extra: CaseEvent[] = [
      { _id: "b1", caseId: "case_A", at: "2026-10-24T14:10:00-07:00", actor: "clerk", type: "finding_dismissed", payload: { findingKey: "chg_1" } },
      { _id: "b2", caseId: "case_A", at: "2026-10-24T14:11:00-07:00", actor: "clerk", type: "approval_blocked", payload: {} },
    ];
    const [dismissed, blocked] = historyEntries({ ...x, events: extra });
    expect(dismissed.what).toBe("Marked line 1 as not an issue");
    expect(blocked).toMatchObject({ blocked: true, what: "Approval blocked: only the controller can approve", role: "clerk" });
  });
});

describe("storySteps", () => {
  it("folds repeated document events into one step and keeps every event under it", () => {
    const steps = storySteps(entries);
    expect(steps.map((s) => s.what)).toEqual([
      "Added 4 documents",
      "Read Quote Q-PCL-0902, the Sep 5 email, the WhatsApp chat and Invoice PCL-INV-1012",
      ...EXPECTED.slice(8).map(([, what]) => what),
    ]);
    expect(steps.flatMap((s) => s.entries.map((e) => e.id))).toEqual(entries.map((e) => e.id));
  });

  it("says a quote once when the step above already shows it", () => {
    const steps = storySteps(entries);
    expect(steps[4].quotes).toEqual(["approved the $200 congestion fee on WhatsApp, nobody agreed to $400 rush handling"]);
    expect(steps[5].quotes).toEqual([]);
  });
});

describe("linesPhrase", () => {
  it("reads like a sentence", () => {
    expect(linesPhrase([4])).toBe("line 4");
    expect(linesPhrase([6, 4])).toBe("lines 4 and 6");
    expect(linesPhrase([1, 4, 6])).toBe("lines 1, 4 and 6");
  });
});
