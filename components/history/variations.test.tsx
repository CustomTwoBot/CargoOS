import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { historyEntries, scenarioAHistory } from "./history";
import { HistoryLab } from "./lab";
import { HistoryLedger } from "./ledger";
import { HistoryStory } from "./story";
import { HistoryTimeline } from "./timeline";

const entries = historyEntries(scenarioAHistory());
const codes = entries.map((e) => e.code);
const rows = () => screen.getAllByTestId("history-entry");
const text = (el: HTMLElement) => el.textContent ?? "";

describe("History variations on Scenario A", () => {
  afterEach(cleanup);

  it("A, timeline: every event in order under its phase; codes only after the toggle", () => {
    render(<HistoryTimeline entries={entries} />);
    expect(rows().map(text)).toEqual(entries.map((e) => expect.stringContaining(e.what)));
    expect(screen.getAllByRole("heading", { level: 3 }).map(text)).toEqual(["Documents read", "Checked", "Question and answer", "Dispute"]);
    expect(screen.queryByText("draft_created")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Event codes" }));
    expect(rows().map((r) => r.querySelector("code")?.textContent)).toEqual(codes);
    expect(within(rows()[14]).getByText("You")).toBeInTheDocument();
    expect(within(rows()[14]).getByText("· controller")).toBeInTheDocument();
    expect(screen.getByText("Entries are only added, never edited or deleted.")).toBeInTheDocument();
  });

  it("B, table: every event newest first with its code; filter by who", () => {
    render(<HistoryLedger entries={entries} />);
    expect(rows().map((r) => r.querySelector("code")?.textContent)).toEqual([...codes].reverse());
    expect(text(rows()[0])).toBe("Oct 24, 2:09:01 PMYou · controllerApproved the dispute. Nothing was sent.approved");
    fireEvent.click(screen.getByRole("button", { name: "You 4" }));
    expect(rows().map((r) => r.querySelector("code")?.textContent)).toEqual(["approved", "approval_requested", "draft_created", "reply_received"]);
    fireEvent.click(screen.getByRole("button", { name: "CargoOS agent 5" }));
    expect(rows()).toHaveLength(5);
    expect(screen.getByText("Entries are only added, never edited or deleted.")).toBeInTheDocument();
  });

  it("C, story: one sentence per step with its quote; every event kept, in order, under the steps", () => {
    render(<HistoryStory entries={entries} />);
    const steps = screen.getAllByTestId("history-step");
    expect(steps).toHaveLength(9);
    expect(text(steps[0])).toContain("Added 4 documents");
    expect(within(steps[2]).getByText("“Ocean freight reduced to $4,500 if booked by Sep 10”")).toBeInTheDocument();
    expect(rows().map((r) => r.querySelector("code")?.textContent)).toEqual(codes);
    expect(screen.getByText("Entries are only added, never edited or deleted.")).toBeInTheDocument();
  });

  it("lab switches between A, B and C with one line on each idea", () => {
    render(<HistoryLab />);
    expect(screen.getByText(/Quiet timeline by phase/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "B · Table" }));
    expect(screen.getByRole("table", { name: "Events" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "C · Story" }));
    expect(screen.getAllByTestId("history-step")).toHaveLength(9);
    expect(screen.getByRole("button", { name: "C · Story" })).toHaveAttribute("aria-pressed", "true");
  });
});
