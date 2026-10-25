import { Profiler } from "react";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CaseScreen } from "./case-screen";
import { SCENARIO_A } from "./fixture";

const atStake = () => screen.getByTestId("at-stake").textContent;
const tab = (name: RegExp | string) => screen.getByRole("tab", { name });
const tabNames = () => screen.getAllByRole("tab").map((t) => t.textContent);

describe("CaseScreen (replay, tabs per issue)", () => {
  afterEach(() => { cleanup(); vi.useRealTimers(); });

  it("Overview: $300 at stake, one tab per thing to decide, no role switcher", () => {
    render(<CaseScreen cases={[SCENARIO_A]} />);
    expect(atStake()).toBe("$300");
    expect(screen.getByText("1 to dispute · 2 waiting on answers · 5 cleared")).toBeInTheDocument();
    expect(tabNames()).toEqual(["Overview", "Ocean freight 40HC Ningbo-Long Beach+$300", "Your answer$600", "Documents", "History"]);
    expect(screen.getByTestId("case-facts")).toHaveTextContent(/^Invoice PCL-INV-1012 · Pacific Crest Logistics · Replay · /);
    expect(screen.queryByText("Ops lead")).not.toBeInTheDocument();
  });

  it("a line's tab shows its evidence and opens the email with the quote highlighted", () => {
    render(<CaseScreen cases={[SCENARIO_A]} />);
    fireEvent.click(tab(/Ocean freight/));
    expect(screen.getByText("What the forwarder promised")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Ocean freight reduced to $4,500 if booked by Sep 10" }));
    expect(screen.getByRole("button", { name: "Back to evidence" })).toBeInTheDocument();
    expect(document.querySelector("mark")?.textContent).toBe("Ocean freight reduced to $4,500 if booked by Sep 10");
  });

  it("Not an issue clears the line, lowers At stake, and Undo puts it back", () => {
    render(<CaseScreen cases={[SCENARIO_A]} />);
    fireEvent.click(tab(/Ocean freight/));
    fireEvent.click(screen.getByRole("button", { name: "Not an issue" }));
    expect(atStake()).toBe("$0");
    expect(screen.getByText("Marked as not an issue. Saved to case history.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(atStake()).toBe("$300");
  });

  it("answering replays the recorded run: recheck, then $700, a change banner and a new tab", () => {
    vi.useFakeTimers();
    render(<CaseScreen cases={[SCENARIO_A]} />);
    fireEvent.click(tab(/Your answer/));
    fireEvent.change(screen.getByLabelText("Your answer"), { target: { value: "approved congestion, not rush handling" } });
    fireEvent.click(screen.getByRole("button", { name: "Reply" }));
    act(() => { vi.advanceTimersByTime(0); });
    expect(screen.getByText("Rechecking 8 charges with your answer…")).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(1600); });
    expect(screen.getByText("1 to dispute · 1 waiting on answers · 6 cleared")).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(2600); });
    expect(atStake()).toBe("$700");
    expect(screen.getByText("Your answer changed 2 charges")).toBeInTheDocument();
    expect(tabNames()).toEqual(["Overview", "Ocean freight 40HC Ningbo-Long Beach+$300", "Rush handling+$400New", "Documents", "History"]);
  });

  it("one operator drafts and accepts; the message to the seller is drafted and nothing is sent", () => {
    render(<CaseScreen cases={[SCENARIO_A]} />);
    fireEvent.click(screen.getByRole("button", { name: "After answers" }));
    fireEvent.click(screen.getByRole("button", { name: "Draft dispute" }));
    expect(tab(/Dispute/)).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText(/Drafted by you/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    expect(screen.getByText(/Accepted by you/)).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Message to the seller" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Send/ })).not.toBeInTheDocument();
  });

  it("reject needs a reason and leaves the dispute ready to draft again", () => {
    render(<CaseScreen cases={[SCENARIO_A]} />);
    fireEvent.click(screen.getByRole("button", { name: "After answers" }));
    fireEvent.click(screen.getByRole("button", { name: "Draft dispute" }));
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    fireEvent.change(screen.getByLabelText("Why are you rejecting it?"), { target: { value: "They did expedite it. Pay it this time." } });
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    expect(screen.getByText("“They did expedite it. Pay it this time.”")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Draft dispute" })).not.toHaveAttribute("aria-disabled");
  });
  // Documents and History moved from the sidebar into the case's own tab strip (docs/design.md §0.2);
  // their tests live with the case (workspace / case tabs).

  it("a screen holding only ops lead can answer but sees no dispute, verdict, evidence or approve controls", () => {
    render(<CaseScreen cases={[SCENARIO_A]} roles={["ops_lead"]} />);
    expect(screen.queryByRole("button", { name: "Draft dispute" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add evidence" })).not.toBeInTheDocument();
    fireEvent.click(tab(/Ocean freight/));
    expect(screen.queryByRole("button", { name: "Not an issue" })).not.toBeInTheDocument();
    fireEvent.click(tab(/Your answer/));
    expect(screen.getByLabelText("Your answer")).toBeInTheDocument();
  });
});

describe("sidebar", () => {
  afterEach(cleanup);

  it("names the case with what is at stake and collapses to the icon rail", () => {
    localStorage.removeItem("cargoos.sidebar");
    render(<CaseScreen cases={[SCENARIO_A]} />);
    const nav = screen.getByRole("navigation", { name: "Sections" });
    expect(within(nav).getAllByText("Bayline 40HC Ningbo-LB").length).toBeGreaterThan(0);
    expect(within(nav).getByText("$300")).toBeInTheDocument();
    expect(within(nav).getByRole("button", { name: "Bayline 40HC Ningbo-LB, $300 at stake, Waiting on you" })).toBeInTheDocument();
    fireEvent.click(within(nav).getByRole("button", { name: "Collapse sidebar" }));
    expect(screen.getByRole("button", { name: "Expand sidebar" })).toBeInTheDocument();
    expect(localStorage.getItem("cargoos.sidebar")).toBe("collapsed");
    fireEvent.click(screen.getByRole("button", { name: "Expand sidebar" }));
    expect(screen.getByRole("button", { name: "Collapse sidebar" })).toBeInTheDocument();
  });
});

describe("several cases", () => {
  afterEach(cleanup);

  it("settles after mounting two cases instead of re-rendering forever", async () => {
    let renders = 0;
    render(<Profiler id="app" onRender={() => { renders++; }}><CaseScreen /></Profiler>);
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    const settled = renders;
    await act(async () => { await new Promise((r) => setTimeout(r, 100)); });
    expect(renders).toBe(settled);
    expect(screen.getAllByText("Juniper Peak 3x40HC Shanghai-Oakland").length).toBeGreaterThan(0);
  });
});
