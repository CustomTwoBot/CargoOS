// What the Scenario B run in the app found, kept fixed: a 15-line case with a CNY line, a
// duplicate, a capped surcharge, a conflict, two questions and a follow-up.
import { useState } from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { personById } from "@/lib/people";
import { CaseCanvas } from "@/components/canvas/case-canvas";
import { SCENARIO_B } from "@/components/demo/scenario-b/scenario-b";
import { useCaseStore } from "./case-store";
import { INVOICE, type Focus } from "./panes";
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

/** The canvas for Scenario B on Sam's screen, with its own store and focus. */
function CanvasB({ start = INVOICE }: { start?: Focus }) {
  const store = useCaseStore([SCENARIO_B], () => {});
  const [focus, setFocus] = useState<Focus>(start);
  return (
    <CaseCanvas demo={SCENARIO_B} x={store.inputs[SCENARIO_B.id]} local={store.state[SCENARIO_B.id]} actions={store.actionsFor(SCENARIO_B)}
      viewer={personById("sam")!} now={null} forwarder="Kestrel Bay Logistics" focus={focus} onFocus={setFocus} />
  );
}

/** A cell's text as a wide screen shows it (without the copy that only narrow panes show). */
const cellText = (d: Element) => { const c = d.cloneNode(true) as Element; c.querySelectorAll("[data-narrow]").forEach((e) => e.remove()); return c.textContent; };
const cells = (line: number) => [...screen.getAllByRole("row").find((r) => r.querySelector("td")?.textContent === String(line))!.querySelectorAll("td")]
  .map(cellText);

describe("Scenario B in the app", () => {
  afterEach(cleanup);

  it("shows all 15 lines and leaves the CNY line out of the USD verdict", () => {
    render(<CanvasB />);
    expect(screen.getByTestId("at-stake")).toHaveAccessibleName("$3,340");
    expect(screen.getByTestId("verdict-sentence")).toHaveTextContent(
      "Kestrel Bay billed $27,325. $16,470 matches what was agreed, $3,340 is more than agreed, and $7,515 waits for your answer. CNY 4,200 is billed in another currency and isn't counted.");
    expect(within(screen.getByRole("group", { name: "Show lines" })).getAllByRole("button").map((b) => b.textContent))
      .toEqual(["All 15", "To dispute 4", "Waiting 6", "Cleared 5"]);
    expect(cells(2)).toEqual(["2", "Origin trucking Kunshan-Shanghai port", "CNY 4,200", "no rate agreed", "Waiting for rate"]);
  });

  it("calls the duplicate Billed twice and proves it with the earlier line", () => {
    render(<CanvasB />);
    expect(cells(12)).toEqual(["12", "Destination THC Oakland", "$1,950", "already billed", "Billed twice"]);
    fireEvent.click(screen.getAllByRole("button", { name: "Destination THC Oakland" })[1]);
    expect(screen.getByTestId("proof")).toHaveTextContent(/Already billed on line 6: 6 Destination THC Oakland 1,950\.00/);
  });

  it("names the conflict, the cap and the CNY line in plain words", () => {
    render(<CanvasB />);
    expect(cells(9).slice(3)).toEqual(["sources disagree", "Asked you"]);
    expect(cells(5).slice(2)).toEqual(["$600", "$450", "$150 over"]);
    expect(cells(1)[1]).toBe("Ocean freight 3×40HC Shanghai-Oakland");
  });
});
