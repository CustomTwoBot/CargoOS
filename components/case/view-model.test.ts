import { describe, expect, it } from "vitest";
import { scenarioA, scenarioAAt, scenarioADraft } from "./fixture";
import { ACTION_ROLE, ALL_ROLES, canAct } from "./roles";
import {
  casePill, checkedAgainst, checkedLine, countLine, isRechecking, latestQuestion, groupsOf, stepsOf, toRows, totalsOf, type CaseInput,
} from "./view-model";
import { delta, money } from "./format";

// Fixture events are on Oct 24, 2026 (Pacific).
const NOW = new Date("2026-10-24T15:00:00-07:00");

const dismiss = (x: CaseInput, key: string): CaseInput => ({
  ...x,
  findings: x.findings.map((f) =>
    f.key === key && f.revision === x.case.revision ? { ...f, userVerdict: "false_positive", userVerdictBy: "clerk" } : f),
});

describe("Scenario A, before the answer (revision 1)", () => {
  const x = scenarioA(1);

  it("counts 1 / 2 / 5 and $300 at stake (SPEC W3 step 2)", () => {
    expect(countLine(toRows(x))).toBe("1 to dispute · 2 waiting on answers · 5 cleared");
    expect(totalsOf(x)).toMatchObject({ billedCents: 750000, agreedCents: 660000, atStakeCents: 30000, waitingCents: 60000 });
  });

  it("groups are To dispute, Waiting, Cleared with the right lines", () => {
    const g = groupsOf(toRows(x));
    expect(g.map((v) => v.rows.map((r) => r.lineNo))).toEqual([[1], [4, 6], [2, 3, 5, 7, 8]]);
    expect(g.map((v) => v.billedCents)).toEqual([480000, 60000, 210000]);
    expect(g[0].overCents).toBe(30000);
  });

  it("shows the engine why-line verbatim and the plain reason", () => {
    const row = toRows(x)[0];
    expect(row.why).toBe("Billed $4,800. Agreed $4,500 (email, Sep 5, if booked by Sep 10; booked Sep 8). Over by $300.");
    expect(row.reason).toEqual({ code: "R2", plain: "Higher than agreed" });
  });

  it("is waiting for the operator's answer", () => {
    expect(casePill(x)).toEqual({ label: "Waiting for your answer", tone: "waiting" });
    expect(checkedLine(x, NOW)).toBe("Checked today at 1:50 PM");
    expect(stepsOf(x, NOW).map((s) => [s.state, s.title, s.sub])).toEqual([
      ["done", "Checked 8 charges", "4 documents read"],
      ["current", "Waiting for your answer", "1 question, 2 charges"],
      ["todo", "Draft dispute", "$300, 1 line"],
      ["todo", "Approve", "Nothing is sent"],
    ]);
  });

  it("names what the invoice was checked against, in date order", () => {
    expect(checkedAgainst(x)).toBe("Invoice PCL-INV-1012, checked against Quote Q-PCL-0902, email, chat.");
    expect(checkedAgainst(scenarioA(2))).toBe(
      "Invoice PCL-INV-1012, checked against Quote Q-PCL-0902, email, chat, your answer.");
  });

  it("Not an issue moves the line to Cleared, lowers At stake and records the waived amount", () => {
    const d = dismiss(x, "chg_1");
    const row = toRows(d).find((r) => r.key === "chg_1");
    expect(row).toMatchObject({ group: "cleared", tag: "Dismissed by clerk" });
    expect(totalsOf(d)).toMatchObject({ atStakeCents: 0, waivedCents: 30000 });
    expect(countLine(toRows(d))).toBe("0 to dispute · 2 waiting on answers · 6 cleared");
  });
});

describe("Scenario A, after the answer (revision 2)", () => {
  const x = scenarioA(2);

  it("counts 2 / 0 / 6 and $700 at stake (SPEC W3 step 2)", () => {
    expect(countLine(toRows(x))).toBe("2 to dispute · 0 waiting on answers · 6 cleared");
    expect(totalsOf(x)).toMatchObject({ billedCents: 750000, agreedCents: 680000, atStakeCents: 70000, waitingCents: 0 });
  });

  it("tags the two lines that moved", () => {
    const tags = Object.fromEntries(toRows(x).filter((r) => r.tag).map((r) => [r.lineNo, r.tag]));
    expect(tags).toEqual({ 4: "Just cleared", 6: "Moved from Waiting" });
  });

  it("says the answer came from the operator", () => {
    expect(checkedLine(x, NOW)).toBe("Updated at 2:05 PM after your answer");
    expect(toRows(x).find((r) => r.lineNo === 4)?.reason.plain).toBe("Approved by you");
    expect(stepsOf(x, NOW).slice(1).map((s) => [s.state, s.title, s.sub])).toEqual([
      ["done", "You answered", "Today at 2:05 PM"],
      ["current", "Draft dispute", "$700, 2 lines"],
      ["todo", "Approve", "Nothing is sent"],
    ]);
    expect(casePill(x).label).toBe("Ready to dispute");
  });

  it("after drafting, approval is the current step", () => {
    const withDraft = { ...x, drafts: [scenarioADraft()] };
    expect(casePill(withDraft).label).toBe("Ready to approve");
    expect(stepsOf(withDraft, NOW).slice(2).map((s) => [s.state, s.title, s.sub])).toEqual([
      ["done", "Dispute drafted", "$700, 2 lines"],
      ["current", "Approve", "Nothing is sent"],
    ]);
  });
});

describe("replay of the recorded answer", () => {
  it("answered: reply in, still revision 1 numbers, rechecking", () => {
    const x = scenarioAAt("answered");
    expect(isRechecking(x)).toBe(true);
    expect(casePill(x).label).toBe("Rechecking");
    expect(totalsOf(x).atStakeCents).toBe(30000);
    expect(latestQuestion(x)?.status).toBe("answered");
  });

  it("partial: line 4 has moved to Cleared, line 6 still waiting", () => {
    const x = scenarioAAt("partial");
    expect(isRechecking(x)).toBe(false);
    expect(countLine(toRows(x))).toBe("1 to dispute · 1 waiting on answers · 6 cleared");
    expect(totalsOf(x)).toMatchObject({ agreedCents: 680000, atStakeCents: 30000, waitingCents: 40000 });
  });

  it("after: same as revision 2", () => {
    expect(totalsOf(scenarioAAt("after")).atStakeCents).toBe(70000);
  });
});

describe("one operator", () => {
  it("holds every role, and each action carries its own role", () => {
    expect((Object.keys(ACTION_ROLE) as (keyof typeof ACTION_ROLE)[]).every((a) => canAct(ALL_ROLES, a))).toBe(true);
    expect([ACTION_ROLE.dismiss, ACTION_ROLE.reply, ACTION_ROLE.approve]).toEqual(["clerk", "ops_lead", "controller"]);
  });

  it("a screen with only ops lead can answer but not dispute or approve", () => {
    expect(canAct(["ops_lead"], "reply")).toBe(true);
    expect(["confirm", "dismiss", "draftDispute", "approve"].some((a) => canAct(["ops_lead"], a as keyof typeof ACTION_ROLE))).toBe(false);
  });
});

describe("format", () => {
  it("formats money and deltas for display", () => {
    expect(money(480000)).toBe("$4,800");
    expect(money(-5000)).toBe("−$50");
    expect(delta(30000)).toBe("+$300");
    expect(delta(0)).toBe("—");
    expect(delta(undefined)).toBe("—");
  });
});
