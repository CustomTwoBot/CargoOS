import { describe, expect, it } from "vitest";
import { personById } from "@/lib/people";
import { SCENARIO_A } from "@/components/case/fixture";
import { SCENARIO_B } from "@/components/demo/scenario-b/scenario-b";
import { caseHeading, caseInitials, caseLine, caseName, caseSubline, pendingFor } from "./case-status";
import { sidebarMode } from "./layout";

const sam = personById("sam")!, maya = personById("maya")!, leo = personById("leo")!;
const before = SCENARIO_A.at(SCENARIO_A.start);
const after = SCENARIO_A.at(SCENARIO_A.end);
const draft = SCENARIO_A.draft(after)!;
const requested = { ...after, drafts: [{ ...draft, status: "pending_approval" as const, requestedBy: "maya" }] };

describe("caseLine: where a case goes in the sidebar and the word under it (§0.4 п.1)", () => {
  it("an open question needs the owner, and waits for Sam on the bookkeeper's screen", () => {
    expect(caseLine(before, sam)).toEqual({ needs: true, text: "Answer 1 question", tone: "waiting" });
    expect(caseLine(SCENARIO_B.at(SCENARIO_B.start), sam).text).toMatch(/^Answer \d+ questions$/);
    expect(caseLine(before, maya)).toEqual({ needs: false, text: "Waiting for Sam", tone: "waiting" });
  });

  it("after the answers both can dispute $700", () => {
    expect(caseLine(after, sam)).toEqual({ needs: true, text: "Ready to dispute $700", tone: "dispute" });
    expect(caseLine(after, maya)).toEqual({ needs: true, text: "Ready to dispute $700", tone: "dispute" });
  });

  it("a bookkeeper's request needs the owner's decision and waits for Sam on the bookkeeper's screen", () => {
    expect(caseLine(requested, sam)).toEqual({ needs: true, text: "Approve dispute · $700", tone: "waiting" });
    expect(caseLine(requested, maya)).toEqual({ needs: false, text: "Waiting for Sam", tone: "waiting" });
  });

  it("an accepted dispute is earlier work; a rejected request comes back to whoever made it", () => {
    const accepted = { ...after, drafts: [{ ...draft, status: "approved" as const }] };
    expect(caseLine(accepted, sam)).toEqual({ needs: false, text: "Disputed $700 · accepted", tone: "muted" });
    const rejected = { ...requested, drafts: [{ ...requested.drafts[0], status: "rejected" as const }] };
    expect(caseLine(rejected, maya)).toMatchObject({ needs: true, text: "Dispute rejected" });
    expect(caseLine(rejected, sam).needs).toBe(false);
  });

  it("an uploader gets no amounts and nothing to act on, only how many documents", () => {
    expect(caseLine(before, leo)).toEqual({ needs: false, text: "4 documents", tone: "muted" });
  });
});

describe("pendingFor: what waits on this person in the thread", () => {
  it("counts questions for whoever answers them and decisions for whoever may decide", () => {
    expect(pendingFor(before, sam)).toBe(1);
    expect(pendingFor(before, maya)).toBe(0);
    expect(pendingFor(requested, sam)).toBe(1);
    expect(pendingFor(requested, maya)).toBe(0);
    expect(pendingFor({ ...after, drafts: [{ ...draft, status: "pending_approval" as const, requestedBy: "sam" }] }, sam)).toBe(0);
  });

  it("counts a dispute ready to draft or send for approval for whoever reviews, until it is drafted", () => {
    expect(pendingFor(after, maya)).toBe(1);
    expect(pendingFor(after, sam)).toBe(1);
    expect(pendingFor(after, leo)).toBe(0);
    expect(pendingFor(requested, maya)).toBe(0);
  });
});

describe("case names", () => {
  it("names a case by forwarder and invoice number, and heads it with the invoice", () => {
    expect(caseName(before)).toBe("Pacific Crest · PCL-INV-1012");
    expect(caseHeading(before)).toBe("Invoice PCL-INV-1012 from Pacific Crest Logistics");
    expect(caseSubline(before)).toBe("40HC Ningbo → Long Beach · Oct 12");
    const b = SCENARIO_B.at(SCENARIO_B.start);
    expect(caseName(b, "Kestrel Bay Logistics")).toBe("Kestrel Bay · KBL-INV-2291");
    expect(caseSubline(b)).toBe("3x40HC Shanghai → Oakland · Oct 14");
  });

  it("takes two letters for the rail from the forwarder", () => {
    expect(caseInitials("Pacific Crest · PCL-INV-1012")).toBe("PC");
    expect(caseInitials("Kestrel Bay · KBL-INV-2291")).toBe("KB");
  });
});

describe("sidebarMode", () => {
  it("expands at 1280 and up, collapses at 1024–1279, and lets the operator's choice win", () => {
    expect(sidebarMode(null, "wide")).toBe("expanded");
    expect(sidebarMode(null, "mid")).toBe("collapsed");
    expect(sidebarMode("expanded", "mid")).toBe("expanded");
    expect(sidebarMode("collapsed", "wide")).toBe("collapsed");
  });

  it("leaves it to CSS before the width is known, and is always full in the drawer", () => {
    expect(sidebarMode("collapsed", "unknown")).toBe("auto");
    expect(sidebarMode("collapsed", "narrow")).toBe("expanded");
  });
});
