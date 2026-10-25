// What the Scenario B run in the app found, kept fixed: a 15-line case with a CNY line, a
// duplicate, a capped surcharge, a conflict, two questions and a follow-up.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SCENARIO_B } from "@/components/demo/scenario-b/scenario-b";
import { CaseScreen } from "./case-screen";
import { chainOf, timelineOf } from "./evidence";
import { issuesOf, questionTitle } from "./issues";
import { casePill, checkedAgainst, toRows, totalsOf } from "./view-model";

const before = SCENARIO_B.at(SCENARIO_B.start);
const after = SCENARIO_B.at(SCENARIO_B.end);
const row = (x: typeof before, line: number) => toRows(x).find((r) => r.lineNo === line)!;

describe("Scenario B in the case model", () => {
  it("shows the CNY line as its own waiting issue and keeps it out of USD totals", () => {
    const cny = issuesOf(before).find((i) => i.kind === "line" && i.row.currency === "CNY");
    expect(cny).toMatchObject({ amount: "CNY 4,200" });
    expect(totalsOf(before).unconverted).toEqual([{ currency: "CNY", cents: 420000 }]);
    expect(chainOf(before, row(before, 2)).result.text).toBe("Waiting for an agreed exchange rate");
  });

  it("names questions stably and calls the follow-up a follow-up", () => {
    const [q1, q2] = before.questions;
    expect([questionTitle(before, q1), questionTitle(before, q2)]).toEqual(["Question 1", "Question 2"]);
    const followUp = SCENARIO_B.stages.map((s) => SCENARIO_B.at(s)).flatMap((x) => x.questions).find((q) => q.followupOf);
    expect(followUp && questionTitle(after, followUp)).toBe("Follow-up");
  });

  it("gives disputed lines the right reason and result", () => {
    expect(row(before, 5).reason.plain).toBe("More than the quote allows");
    expect(chainOf(before, row(before, 5)).result.text).toBe("More than the quote allows");
    const dup = chainOf(before, row(before, 12));
    expect(dup.result.text).toBe("Billed twice");
    expect(dup.steps.some((s) => s.title === "Already billed on line 6")).toBe(true);
    expect(row(after, 13).reason.plain).toBe("More than you approved");
  });

  it("says the drayage sources disagree instead of calling one a replacement", () => {
    const steps = chainOf(before, row(before, 9)).steps.map((s) => s.title);
    expect(steps).toEqual(expect.arrayContaining(["The email says $5,550", "The proforma says $5,850"]));
    // The Sep 3 quote was replaced on Sep 9; the email and proforma (same moment) don't replace each other.
    expect(steps.filter((t) => t === "The original quote")).toHaveLength(1);
    const ids = timelineOf(after).flatMap((e) => e.quotes.map((q) => q.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("writes each source once in the header and is honest about what waits", () => {
    expect(checkedAgainst(after)).not.toMatch(/your answer, your answer/);
    expect(checkedAgainst(after)).toMatch(/your answers \(3\)/);
    expect(casePill(after).label).toBe("Ready to dispute · 1 waiting");
  });
});

// TODO(rework §0.4): old tabbed layout; the canvas session rewrites these.
describe.skip("Scenario B in the app", () => {
  afterEach(cleanup);

  it("only lets you answer the next recorded question in this replay", () => {
    render(<CaseScreen cases={[SCENARIO_B]} />);
    fireEvent.click(screen.getByRole("tab", { name: /Question 2/ }));
    expect(screen.getByText(/Answer Question 1 first/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Your answer")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: /Question 1/ }));
    expect(screen.getByLabelText("Your answer")).toBeInTheDocument();
  });

  it("lists the waiting CNY line in To decide with a section per status", () => {
    render(<CaseScreen cases={[SCENARIO_B]} />);
    const list = screen.getByRole("region", { name: "To decide" });
    expect(within(list).getAllByRole("heading").map((h) => h.textContent)).toContain("Waiting · 1");
    expect(within(list).getByText("CNY 4,200")).toBeInTheDocument();
    expect(within(list).queryByText(/1 charges/)).not.toBeInTheDocument();
  });
});
