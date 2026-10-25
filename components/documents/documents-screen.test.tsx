import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { scenarioAAt } from "@/components/case/fixture";
import type { CaseEvent } from "@/lib/types";
import { DocumentsScreen } from "./documents-screen";

const list = () => screen.getByRole("list", { name: "Documents" });
const open = (title: string) => fireEvent.click(within(list()).getByRole("button", { name: new RegExp(title) }));
const marks = () => [...screen.getByTestId("document-text").querySelectorAll("mark")].map((m) => m.textContent);
const evt = (type: CaseEvent["type"], at: string, docId: string): CaseEvent =>
  ({ _id: `t_${type}`, caseId: "case_A", at, actor: "system", type, payload: { docId } });

describe("DocumentsScreen (replay mode)", () => {
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
    expect(screen.getByRole("button", { name: "Ocean freight agreed at $4,500 if booked by Sep 10" })).toBeInTheDocument();
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
    expect(screen.getByRole("button", { name: "Allowed: PSS/GRI as filed" })).toBeInTheDocument();
  });
});
