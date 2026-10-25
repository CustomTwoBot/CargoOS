import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { scenarioAAt } from "@/components/case/fixture";
import type { CaseEvent } from "@/lib/types";
import { DocumentsLab } from "./documents-lab";
import { DocumentsScreen } from "./documents-screen";

const list = () => screen.getByRole("list", { name: "Documents" });
const open = (title: string) => fireEvent.click(within(list()).getByRole("button", { name: new RegExp(title) }));
const marks = () => [...screen.getByTestId("document-text").querySelectorAll("mark")].map((m) => m.textContent);
const evt = (type: CaseEvent["type"], at: string, docId: string): CaseEvent =>
  ({ _id: `t_${type}`, caseId: "case_A", at, actor: "system", type, payload: { docId } });

describe("DocumentsScreen A, list (replay mode)", () => {
  afterEach(cleanup);

  it("lists every document with what was read from it, oldest first", () => {
    render(<DocumentsScreen />);
    const items = within(list()).getAllByRole("listitem").map((li) => li.textContent);
    expect(items).toEqual([
      "Quote Q-PCL-0902Quote · Forwarder · Sep 2Read, 7 facts",
      "Email: RE: Q-PCL-0902 revisedEmail · Forwarder · Sep 5Read, 1 fact",
      "WhatsApp: Derek PCL / Sam BaylineChat · Sep 28Read, 1 fact",
      "Invoice PCL-INV-1012Invoice · Forwarder · Oct 12Read, 8 invoice lines",
      "Reply from ops leadYour answer · You · Oct 24Read, 2 facts",
    ]);
    expect(screen.getByText("Replay")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Documents" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Cases" })).toHaveAttribute("href", "/");
  });

  it("shows Couldn't read and Waiting to be read from the events", () => {
    const x = scenarioAAt("after");
    render(<DocumentsScreen x={{ ...x, events: [...x.events,
      evt("extraction_failed", "2026-10-24T13:51:00-07:00", "doc_chat"),
      evt("doc_added", "2026-10-24T15:00:00-07:00", "doc_email")] }} />);
    expect(within(list()).getByText("Couldn't read")).toBeInTheDocument();
    expect(within(list()).getByText("Waiting to be read")).toBeInTheDocument();
    open("WhatsApp");
    expect(screen.getByText("Couldn't read part of this document; affected lines are waiting on answers.")).toBeInTheDocument();
    expect(marks()).toEqual([]);
  });

  it("highlights the email's quote and says what it became", () => {
    render(<DocumentsScreen />);
    open("Email: RE");
    expect(marks()).toEqual(["Ocean freight reduced to $4,500 if booked by Sep 10"]);
    expect(screen.getByRole("button", { name: "Ocean freight agreed at $4,500 if booked by Sep 10 Used for line 1" })).toBeInTheDocument();
  });

  it("highlights every invoice line and lists them with their amounts", () => {
    render(<DocumentsScreen />);
    open("Invoice PCL-INV-1012");
    expect(marks()).toHaveLength(8);
    expect(marks()[0]).toBe("Ocean freight 40HC Ningbo-Long Beach      4,800.00");
    expect(marks()[5]).toBe("Rush handling                               400.00");
    expect(screen.getByRole("button", { name: "Line 6: Rush handling, $400" })).toBeInTheDocument();
  });

  it("the quote's replaced ocean rate says what replaced it", () => {
    render(<DocumentsScreen />);
    expect(marks()).toHaveLength(7);
    expect(screen.getByText("Replaced by the email of Sep 5")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Allowed: PSS/GRI as filed Used for line 2" })).toBeInTheDocument();
  });
});

const failedChat = () => {
  const x = scenarioAAt("after");
  return { ...x, events: [...x.events, evt("extraction_failed", "2026-10-24T13:51:00-07:00", "doc_chat")] };
};

describe("DocumentsScreen B, timeline", () => {
  afterEach(cleanup);

  it("shows every document by date with what it added, text hidden until asked", () => {
    render(<DocumentsScreen variant="timeline" />);
    const entries = within(list()).getAllByRole("listitem").filter((li) => li.parentElement === list());
    expect(entries.map((li) => li.querySelector("h2")?.textContent)).toEqual([
      "Quote Q-PCL-0902", "Email: RE: Q-PCL-0902 revised", "WhatsApp: Derek PCL / Sam Bayline", "Invoice PCL-INV-1012", "Reply from ops lead",
    ]);
    expect(within(entries[1]).getByText("Sep 5")).toBeInTheDocument();
    expect(within(entries[1]).getByText("Read, 1 fact")).toBeInTheDocument();
    expect(within(entries[2]).getByText("Booking date Sep 8")).toBeInTheDocument();
    expect(screen.queryByTestId("document-text")).not.toBeInTheDocument();
  });

  it("opens the email's text with its quote highlighted, then the invoice's", () => {
    render(<DocumentsScreen variant="timeline" />);
    const entries = within(list()).getAllByRole("listitem").filter((li) => li.parentElement === list());
    fireEvent.click(within(entries[1]).getByRole("button", { name: "Show the text" }));
    expect(marks()).toEqual(["Ocean freight reduced to $4,500 if booked by Sep 10"]);
    fireEvent.click(within(entries[3]).getByRole("button", { name: "Show the text" }));
    expect(screen.getAllByTestId("document-text")).toHaveLength(1);
    expect(marks()).toHaveLength(8);
    expect(within(entries[3]).getByRole("button", { name: "Line 6: Rush handling, $400" })).toBeInTheDocument();
  });

  it("says when a document couldn't be read", () => {
    render(<DocumentsScreen variant="timeline" x={failedChat()} />);
    expect(screen.getByText("Couldn't read")).toBeInTheDocument();
    expect(screen.getByText("Couldn't read part of this document; affected lines are waiting on answers.")).toBeInTheDocument();
    expect(screen.queryByText("Booking date Sep 8")).not.toBeInTheDocument();
  });
});

describe("DocumentsScreen C, tracker", () => {
  afterEach(cleanup);
  const rowOf = (title: string) => screen.getByRole("button", { name: new RegExp(title) }).closest("tr")!;

  it("shows received, read and used for every document", () => {
    render(<DocumentsScreen variant="tracker" />);
    const table = screen.getByRole("table", { name: "Documents" });
    expect(within(table).getAllByRole("row").slice(1).map((r) => [...r.querySelectorAll("td")].slice(1).map((td) => td.textContent))).toEqual([
      ["Oct 24", "7 facts", "5 of 7"],
      ["Oct 24", "1 fact", "1 of 1"],
      ["Oct 24", "1 fact", "1 of 1"],
      ["Oct 24", "8 invoice lines", "8 of 8"],
      ["Oct 24", "2 facts", "2 of 2"],
    ]);
  });

  it("marks a failed read and has nothing in use for it", () => {
    render(<DocumentsScreen variant="tracker" x={failedChat()} />);
    expect([...rowOf("WhatsApp").querySelectorAll("td")].slice(1).map((td) => td.textContent)).toEqual(["Oct 24", "Couldn't read", "—"]);
  });

  it("selecting the invoice opens it below with every line highlighted", () => {
    render(<DocumentsScreen variant="tracker" />);
    fireEvent.click(within(rowOf("Email: RE")).getByRole("button"));
    expect(marks()).toEqual(["Ocean freight reduced to $4,500 if booked by Sep 10"]);
    fireEvent.click(within(rowOf("Invoice PCL")).getByRole("button"));
    expect(marks()).toHaveLength(8);
  });
});

describe("DocumentsLab", () => {
  afterEach(cleanup);

  it("switches between the three variations and names each one's idea", () => {
    render(<DocumentsLab />);
    expect(screen.getByRole("button", { name: "A List and document" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText(/Best for verifying/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "B Timeline" }));
    expect(screen.getAllByRole("button", { name: "Show the text" })).toHaveLength(5);
    expect(screen.getByText(/Reads like a story/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "C Tracker" }));
    expect(screen.getByRole("table", { name: "Documents" })).toBeInTheDocument();
    expect(screen.getByText(/Best for spotting gaps/)).toBeInTheDocument();
  });
});
