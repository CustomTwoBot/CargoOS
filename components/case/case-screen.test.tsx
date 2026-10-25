import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CaseScreen } from "./case-screen";

const atStake = () => screen.getByTestId("at-stake").textContent;
const tab = (name: RegExp | string) => screen.getByRole("tab", { name });
const tabNames = () => screen.getAllByRole("tab").map((t) => t.textContent);

describe("CaseScreen (replay, tabs per issue)", () => {
  afterEach(() => { cleanup(); vi.useRealTimers(); });

  it("Overview: $300 at stake, one tab per thing to decide, no role switcher", () => {
    render(<CaseScreen />);
    expect(atStake()).toBe("$300");
    expect(screen.getByText("1 to dispute · 2 waiting on answers · 5 cleared")).toBeInTheDocument();
    expect(tabNames()).toEqual(["Overview", "Ocean freight 40HC Ningbo-Long Beach+$300", "Your answer$600"]);
    expect(screen.getByText(/checked against Quote Q-PCL-0902, email, chat\./)).toBeInTheDocument();
    expect(screen.getByText("Replay")).toBeInTheDocument();
    expect(screen.queryByText("Ops lead")).not.toBeInTheDocument();
  });

  it("a line's tab shows its evidence and opens the email with the quote highlighted", () => {
    render(<CaseScreen />);
    fireEvent.click(tab(/Ocean freight/));
    expect(screen.getByText("What the forwarder promised")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Ocean freight reduced to $4,500 if booked by Sep 10" }));
    expect(screen.getByRole("button", { name: "Back to evidence" })).toBeInTheDocument();
    expect(document.querySelector("mark")?.textContent).toBe("Ocean freight reduced to $4,500 if booked by Sep 10");
  });

  it("Not an issue clears the line, lowers At stake, and Undo puts it back", () => {
    render(<CaseScreen />);
    fireEvent.click(tab(/Ocean freight/));
    fireEvent.click(screen.getByRole("button", { name: "Not an issue" }));
    expect(atStake()).toBe("$0");
    expect(screen.getByText("Marked as not an issue. Saved to case history.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(atStake()).toBe("$300");
  });

  it("answering replays the recorded run: recheck, then $700, a change banner and a new tab", () => {
    vi.useFakeTimers();
    render(<CaseScreen />);
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
    expect(tabNames()).toEqual(["Overview", "Ocean freight 40HC Ningbo-Long Beach+$300", "Rush handling+$400"]);
  });

  it("one operator drafts and approves; nothing is sent", () => {
    render(<CaseScreen />);
    fireEvent.click(screen.getByRole("button", { name: "After answers" }));
    fireEvent.click(screen.getByRole("button", { name: "Draft dispute" }));
    expect(tab(/Dispute/)).toHaveAttribute("aria-selected", "true");
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    expect(screen.getByText("Approved. Nothing was sent.")).toBeInTheDocument();
    expect(screen.queryByText("Requires controller")).not.toBeInTheDocument();
  });

  it("the rail switches to Documents and History without losing the case state", () => {
    render(<CaseScreen />);
    fireEvent.click(screen.getByRole("button", { name: "After answers" }));
    fireEvent.click(screen.getByRole("button", { name: "Draft dispute" }));
    fireEvent.click(screen.getByRole("button", { name: "History" }));
    expect(screen.getByRole("table", { name: "Events" })).toBeInTheDocument();
    expect(screen.getAllByText("draft_created").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Documents" }));
    expect(within(screen.getByRole("list", { name: "Documents" })).getByText("Invoice PCL-INV-1012")).toBeInTheDocument();
  });

  it("a screen holding only ops lead can answer but sees no dispute, verdict, evidence or approve controls", () => {
    render(<CaseScreen roles={["ops_lead"]} />);
    expect(screen.queryByRole("button", { name: "Draft dispute" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add evidence" })).not.toBeInTheDocument();
    fireEvent.click(tab(/Ocean freight/));
    expect(screen.queryByRole("button", { name: "Not an issue" })).not.toBeInTheDocument();
    fireEvent.click(tab(/Your answer/));
    expect(screen.getByLabelText("Your answer")).toBeInTheDocument();
  });
});
