import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { largeCase } from "@/components/documents/large-case";
import { historyEntries, scenarioAHistory } from "./history";
import { HistoryView } from "./history-view";

const big = largeCase();
const total = historyEntries(big).length;
const rows = () => screen.queryAllByTestId("history-entry");
const dividers = () => screen.queryAllByTestId("history-round").map((d) => d.textContent);
const codeOf = (r: HTMLElement) => r.querySelector("code")?.textContent;
const search = (q: string) => fireEvent.change(screen.getByRole("searchbox", { name: "Search history" }), { target: { value: q } });
const who = (name: RegExp) => fireEvent.click(within(screen.getByRole("group", { name: "Who" })).getByRole("button", { name }));

describe("HistoryView on Scenario A", () => {
  afterEach(cleanup);

  it("separates the checks with a thin divider, newest first, and has no search box", () => {
    render(<HistoryView x={scenarioAHistory()} />);
    expect(dividers()).toEqual(["Since the last check", "Rechecked at 2:05 PM after your answerrevision 2", "Checked at 1:50 PMrevision 1"]);
    const groups = screen.getAllByRole("rowgroup");
    expect(within(groups[1]).getAllByTestId("history-entry").map(codeOf)).toEqual(["recomputed", "reply_received", "question_asked"]);
    expect(rows()).toHaveLength(15);
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
  });

  it("opens a step to show the words that caused it", () => {
    render(<HistoryView x={scenarioAHistory()} />);
    const recheck = screen.getByRole("button", { name: "Rechecked: line 4 cleared, line 6 to dispute" });
    expect(recheck).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("list", { name: "Quoted words" })).not.toBeInTheDocument();
    fireEvent.click(recheck);
    expect(recheck).toHaveAttribute("aria-expanded", "true");
    expect(within(screen.getByRole("list", { name: "Quoted words" })).getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "“approved the $200 congestion fee on WhatsApp”", "“nobody agreed to $400 rush handling”",
    ]);
    // Steps without quoted words are plain text, not buttons.
    expect(screen.queryByRole("button", { name: "Asked for approval" })).not.toBeInTheDocument();
  });
});

describe("HistoryView on a large case", () => {
  afterEach(cleanup);

  it("shows what changed when: one divider per check, newest first", () => {
    render(<HistoryView x={big} />);
    expect(dividers()).toEqual([
      "Since the last check",
      "Rechecked at 2:31 PM after your answer about line 15revision 4",
      "Rechecked at 2:14 PM after your answer about lines 11 and 15revision 3",
      "Rechecked at 2:05 PM after your answer about lines 12 and 14revision 2",
      "Checked at 1:52 PMrevision 1",
    ]);
    expect(rows()).toHaveLength(total);
    expect(codeOf(rows()[0])).toBe("doc_added");
    expect(codeOf(rows().at(-1)!)).toBe("doc_added");
  });

  it("keeps the blocked approval red", () => {
    render(<HistoryView x={big} />);
    const blocked = rows().find((r) => codeOf(r) === "approval_blocked")!;
    expect(within(blocked).getByText("Approval blocked: only the controller can approve")).toHaveClass("text-dispute");
    expect(blocked.querySelector("code")).toHaveClass("text-dispute");
  });

  it("filters by who and hides checks with nothing left to show", () => {
    render(<HistoryView x={big} />);
    expect(screen.getByRole("button", { name: `All ${total}` })).toHaveAttribute("aria-pressed", "true");
    who(/^You/);
    expect(rows().map(codeOf)).toEqual([
      "doc_added", "approved", "approval_blocked", "approval_requested", "draft_created", "finding_dismissed", "finding_confirmed",
      "reply_received", "reply_received", "reply_received",
    ]);
    expect(dividers()).toHaveLength(4);
  });

  it("searches by line across sentences and narrows the who counts with it", () => {
    render(<HistoryView x={big} />);
    search("line 15");
    expect(rows().map(codeOf)).toEqual(["draft_created", "recomputed", "reply_received", "question_asked", "reply_received", "question_asked", "recomputed"]);
    expect(screen.getByRole("button", { name: "All 7" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "You 3" })).toBeInTheDocument();
    search("congested");
    expect(rows().map((r) => r.textContent)).toEqual([expect.stringContaining("Asked you about lines 12 and 14")]);
  });

  it("an empty result says so calmly and offers to show everything", () => {
    render(<HistoryView x={big} />);
    who(/^CargoOS rules/);
    search("approved");
    expect(rows()).toEqual([]);
    expect(dividers()).toEqual([]);
    expect(screen.getByText("Nothing from CargoOS rules matches “approved”.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show everything" }));
    expect(rows()).toHaveLength(total);
    expect(screen.getByRole("searchbox", { name: "Search history" })).toHaveValue("");
    expect(screen.getByRole("button", { name: `All ${total}` })).toHaveAttribute("aria-pressed", "true");
  });

  it("a case with no events yet says so", () => {
    render(<HistoryView x={{ ...big, events: [] }} />);
    expect(screen.getByText("Nothing has happened in this case yet.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Show everything" })).not.toBeInTheDocument();
  });

  it("keeps long sentences and quotes inside their cell", () => {
    render(<HistoryView x={big} />);
    const failed = screen.getByText("Couldn't read part of the WhatsApp chat Lin Trucking / Sam Bayline: messages 18–22");
    expect(failed.closest('[role="cell"]')).toHaveClass("min-w-0", "break-words");
    fireEvent.click(screen.getByRole("button", { name: "Checked 16 lines: 5 to dispute, 4 waiting, 7 cleared" }));
    expect(within(screen.getByRole("list", { name: "Quoted words" })).getAllByRole("listitem")[0]).toHaveClass("break-words");
  });
});
