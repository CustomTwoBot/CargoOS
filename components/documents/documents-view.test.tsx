import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { scenarioAAt } from "@/components/case/fixture";
import type { CaseEvent } from "@/lib/types";
import { DocumentsView } from "./documents-view";

const x = scenarioAAt("after");
const list = () => screen.getByRole("list", { name: "Documents" });
const open = (title: string) => fireEvent.click(within(list()).getByRole("button", { name: new RegExp(title) }));
const marks = () => [...screen.getByTestId("document-text").querySelectorAll("mark")].map((m) => m.textContent);
const evt = (type: CaseEvent["type"], at: string, docId: string): CaseEvent =>
  ({ _id: `t_${type}`, caseId: "case_A", at, actor: "system", type, payload: { docId } });

describe("DocumentsView on Scenario A", () => {
  afterEach(cleanup);

  it("lists every document with what was read from it, oldest first, and no page shell", () => {
    render(<DocumentsView x={x} />);
    const items = within(list()).getAllByRole("listitem").map((li) => li.textContent);
    expect(items).toEqual([
      "Quote Q-PCL-0902Quote · Forwarder · Sep 2Read, 7 facts",
      "Email: RE: Q-PCL-0902 revisedEmail · Forwarder · Sep 5Read, 1 fact",
      "WhatsApp: Derek PCL / Sam BaylineChat · Sep 28Read, 1 fact",
      "Invoice PCL-INV-1012Invoice · Forwarder · Oct 12Read, 8 invoice lines",
      "Reply from ops leadYour answer · You · Oct 24Read, 2 facts",
    ]);
    expect(within(list()).getAllByRole("button")[0]).toHaveAttribute("aria-current", "true");
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 1 })).not.toBeInTheDocument();
    expect(screen.queryByText("Replay")).not.toBeInTheDocument();
  });

  it("before the answer there is no reply document", () => {
    render(<DocumentsView x={scenarioAAt("before")} />);
    expect(within(list()).getAllByRole("listitem")).toHaveLength(4);
    expect(within(list()).queryByText("Reply from ops lead")).not.toBeInTheDocument();
  });

  it("shows Couldn't read and Waiting to be read from the events", () => {
    render(<DocumentsView x={{ ...x, events: [...x.events,
      evt("extraction_failed", "2026-10-24T13:51:00-07:00", "doc_chat"),
      evt("doc_added", "2026-10-24T15:00:00-07:00", "doc_email")] }} />);
    expect(within(list()).getByText("Couldn't read")).toBeInTheDocument();
    expect(within(list()).getByText("Waiting to be read")).toBeInTheDocument();
    open("WhatsApp");
    expect(screen.getByText("Couldn't read part of this document; affected lines are waiting on answers.")).toBeInTheDocument();
    expect(screen.getByText("Nothing was taken from it.")).toBeInTheDocument();
    expect(marks()).toEqual([]);
    open("Email: RE");
    expect(screen.getByText("Not read yet.")).toBeInTheDocument();
  });

  it("highlights the email's quote and says what it became", () => {
    render(<DocumentsView x={x} />);
    open("Email: RE");
    expect(within(list()).getAllByRole("button")[1]).toHaveAttribute("aria-current", "true");
    expect(marks()).toEqual(["Ocean freight reduced to $4,500 if booked by Sep 10"]);
    expect(screen.getByRole("button", { name: "Ocean freight agreed at $4,500 if booked by Sep 10 Used for line 1" })).toBeInTheDocument();
  });

  it("highlights every invoice line and lists them with their amounts", () => {
    render(<DocumentsView x={x} />);
    open("Invoice PCL-INV-1012");
    expect(marks()).toHaveLength(8);
    expect(marks()[0]).toBe("Ocean freight 40HC Ningbo-Long Beach      4,800.00");
    expect(marks()[5]).toBe("Rush handling                               400.00");
    expect(screen.getByRole("button", { name: "Line 6: Rush handling, $400" })).toBeInTheDocument();
  });

  it("the quote's replaced ocean rate says what replaced it", () => {
    render(<DocumentsView x={x} />);
    expect(marks()).toHaveLength(7);
    expect(screen.getByText("Replaced by the email of Sep 5")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Allowed: PSS/GRI as filed Used for line 2" })).toBeInTheDocument();
  });

  it("hovering what CargoOS read outlines its quote in the text", () => {
    render(<DocumentsView x={x} />);
    open("Email: RE");
    fireEvent.mouseEnter(screen.getByRole("button", { name: /Ocean freight agreed at \$4,500/ }));
    expect(screen.getByTestId("document-text").querySelector("mark")).toHaveClass("outline-2");
  });
});
