import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { historyEntries, scenarioAHistory } from "./history";
import { HistoryView } from "./history-view";
import { HistoryLedger } from "./ledger";

const x = scenarioAHistory();
const entries = historyEntries(x);
const codes = entries.map((e) => e.code);
const rows = () => screen.getAllByTestId("history-entry");
const codeOf = (r: HTMLElement) => r.querySelector("code")?.textContent;
const text = (el: HTMLElement) => el.textContent ?? "";
const APPEND_ONLY = "Entries are only added, never edited or deleted.";

describe("History table on Scenario A", () => {
  afterEach(cleanup);

  it("shows every event newest first with its code, time and sentence", () => {
    render(<HistoryLedger entries={entries} />);
    expect(rows().map(codeOf)).toEqual([...codes].reverse());
    expect(rows().map(text)).toEqual([...entries].reverse().map((e) => expect.stringContaining(e.what)));
    expect(text(rows()[0])).toBe("Oct 24, 2:09:01 PMYou · controllerApproved the dispute. Nothing was sent.approved");
    expect(text(rows().at(-1)!)).toBe("Oct 24, 1:50:00 PMCargoOS rulesAdded Quote Q-PCL-0902doc_added");
    expect(within(rows()[0]).getByText("· controller")).toBeInTheDocument();
  });

  it("filters by who, with a count on each filter", () => {
    render(<HistoryLedger entries={entries} />);
    expect(screen.getByRole("button", { name: "All 15" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "You 4" }));
    expect(screen.getByRole("button", { name: "You 4" })).toHaveAttribute("aria-pressed", "true");
    expect(rows().map(codeOf)).toEqual(["approved", "approval_requested", "draft_created", "reply_received"]);
    fireEvent.click(screen.getByRole("button", { name: "CargoOS rules 6" }));
    expect(rows().map(codeOf)).toEqual(["recomputed", "recomputed", "doc_added", "doc_added", "doc_added", "doc_added"]);
    fireEvent.click(screen.getByRole("button", { name: "CargoOS agent 5" }));
    expect(rows()).toHaveLength(5);
    fireEvent.click(screen.getByRole("button", { name: "All 15" }));
    expect(rows()).toHaveLength(15);
  });

  it("says History is append-only", () => {
    render(<HistoryLedger entries={entries} />);
    expect(screen.getByText(APPEND_ONLY)).toBeInTheDocument();
  });

  it("marks a blocked approval in red", () => {
    const blocked = historyEntries({
      ...x,
      events: [{ _id: "b1", caseId: "case_A", at: "2026-10-24T14:11:00-07:00", actor: "clerk", type: "approval_blocked", payload: {} }],
    });
    render(<HistoryLedger entries={blocked} />);
    expect(screen.getByText("Approval blocked: only the controller can approve")).toHaveClass("text-dispute");
  });
});

describe("HistoryView", () => {
  afterEach(cleanup);

  it("renders the table straight from the case, with no rail or page header", () => {
    render(<HistoryView x={x} />);
    expect(screen.getByRole("table", { name: "Events" })).toBeInTheDocument();
    expect(rows().map(codeOf)).toEqual([...codes].reverse());
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 1 })).not.toBeInTheDocument();
    expect(screen.getByText(APPEND_ONLY)).toBeInTheDocument();
  });
});
