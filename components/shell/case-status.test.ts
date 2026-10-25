import { describe, expect, it } from "vitest";
import { SCENARIO_A } from "@/components/case/fixture";
import { SCENARIO_B } from "@/components/demo/scenario-b/scenario-b";
import { caseInitials, caseStatus } from "./case-status";
import { sidebarMode } from "./layout";

describe("caseStatus", () => {
  const before = SCENARIO_A.at(SCENARIO_A.start);
  const after = SCENARIO_A.at(SCENARIO_A.end);
  const draft = SCENARIO_A.draft(after)!;

  it("waits on you while a question is open", () => {
    expect(caseStatus(before)).toEqual({ tone: "you", label: "Waiting on you" });
    expect(caseStatus(SCENARIO_B.at(SCENARIO_B.start)).tone).toBe("you");
  });

  it("is ready to dispute once answered with money at stake", () => {
    expect(caseStatus(after)).toEqual({ tone: "dispute", label: "Ready to dispute" });
  });

  it("waits on you again while a drafted dispute needs your decision, and a rejected one can be drafted again", () => {
    expect(caseStatus({ ...after, drafts: [{ ...draft, status: "pending_approval" }] }).tone).toBe("you");
    expect(caseStatus({ ...after, drafts: [{ ...draft, status: "rejected" }] }).tone).toBe("dispute");
  });

  it("has nothing to do after the dispute is accepted", () => {
    expect(caseStatus({ ...after, drafts: [{ ...draft, status: "approved" }] })).toEqual({ tone: "none", label: "Nothing to do" });
  });
});

describe("caseInitials", () => {
  it("takes the first two words that start with a letter", () => {
    expect(caseInitials("Bayline 40HC Ningbo-LB")).toBe("BN");
    expect(caseInitials("Juniper Peak 3x40HC Shanghai-Oakland")).toBe("JP");
    expect(caseInitials("40HC")).toBe("4");
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
