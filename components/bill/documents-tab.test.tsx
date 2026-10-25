import { useEffect } from "react";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BillsProvider, useBills, type Bill, type BillsValue } from "@/components/app/bills-provider";
import { SCENARIO_A } from "@/components/case/fixture";
import { setDevicePerson } from "@/components/shell/person";
import { DocumentsTab, type DocFocus } from "./documents-tab";

const held: { api?: BillsValue } = {};
type Tweak = (b: Bill) => Bill;
function Tab({ focus, tweak = (b) => b }: { focus?: DocFocus; tweak?: Tweak }) {
  const v = useBills();
  useEffect(() => { held.api = v; });
  const bill = v.bill(SCENARIO_A.id);
  return bill ? <DocumentsTab bill={tweak(bill)} focus={focus} /> : null;
}

function mount(props: { focus?: DocFocus; tweak?: Tweak } = {}) {
  const r = render(<BillsProvider><Tab {...props} /></BillsProvider>);
  act(() => held.api!.bill(SCENARIO_A.id)!.actions.reset("after"));
  return { rerender: (p: { focus?: DocFocus; tweak?: Tweak }) => r.rerender(<BillsProvider><Tab {...p} /></BillsProvider>) };
}

const list = () => screen.getByRole("list", { name: "Documents" });
const current = () => within(list()).getAllByRole("button").find((b) => b.getAttribute("aria-current") === "true");
const marks = () => [...screen.getByTestId("document-text").querySelectorAll("mark")];

const EMAIL_QUOTE = "Ocean freight reduced to $4,500 if booked by Sep 10";

describe("DocumentsTab", () => {
  beforeEach(() => { localStorage.clear(); setDevicePerson("sam"); });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); localStorage.clear(); });

  it("lists the bill's documents with kind, date and read status, the first one open", () => {
    mount();
    const items = within(list()).getAllByRole("listitem");
    expect(items).toHaveLength(5);
    expect(items[0]).toHaveTextContent("Quote Q-PCL-0902");
    expect(items[0]).toHaveTextContent("Quote · Sep 2");
    expect(items[0]).toHaveTextContent("Read, 7 facts");
    expect(current()).toHaveTextContent("Quote Q-PCL-0902");
    // Printed documents read in mono.
    expect(screen.getByTestId("document-text")).toHaveClass("font-mono");
  });

  it("marks every quote CargoOS used, each with the line it was used for", () => {
    mount();
    fireEvent.click(within(list()).getByRole("button", { name: /Email: RE/ }));
    const text = screen.getByTestId("document-text");
    expect(text).toHaveClass("font-sans");
    expect(marks().map((m) => m.textContent)).toEqual([EMAIL_QUOTE]);
    expect(within(text).getByText("Used for line 1")).toBeInTheDocument();

    fireEvent.click(within(list()).getByRole("button", { name: /Invoice PCL-INV-1012/ }));
    expect(marks()).toHaveLength(8);
    expect(within(screen.getByTestId("document-text")).getByText("Invoice line 6")).toBeInTheDocument();
  });

  it("focus selects that document and scrolls the quote into view", () => {
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    const { rerender } = mount();
    expect(current()).toHaveTextContent("Quote Q-PCL-0902");
    rerender({ focus: { docId: "doc_email", quote: EMAIL_QUOTE } });
    expect(current()).toHaveTextContent("Email: RE: Q-PCL-0902 revised");
    const focused = screen.getByTestId("document-text").querySelector("mark[data-focused]");
    expect(focused).toHaveTextContent(EMAIL_QUOTE);
    expect(scroll).toHaveBeenCalled();

    // A quote no item covers (a question's closest mention) is still marked and focused.
    rerender({ focus: { docId: "doc_chat", quote: "possible congestion at LB terminal, may be extra" } });
    expect(current()).toHaveTextContent("WhatsApp: Derek PCL / Sam Bayline");
    expect(screen.getByTestId("document-text").querySelector("mark[data-focused]")).toHaveTextContent("possible congestion at LB terminal, may be extra");
    Reflect.deleteProperty(Element.prototype, "scrollIntoView");
  });

  it("the focused quote flashes once when motion is allowed", () => {
    vi.useFakeTimers();
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} }));
    const { rerender } = mount();
    rerender({ focus: { docId: "doc_email", quote: EMAIL_QUOTE } });
    const flashing = () => screen.getByTestId("document-text").querySelector("mark[data-flash]");
    expect(flashing()).toHaveTextContent(EMAIL_QUOTE);
    act(() => { vi.advanceTimersByTime(1700); });
    expect(flashing()).toBeNull();
    // Still marked as the focused quote after the flash.
    expect(screen.getByTestId("document-text").querySelector("mark[data-focused]")).toHaveTextContent(EMAIL_QUOTE);
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("no flash under reduced motion", () => {
    const { rerender } = mount();
    rerender({ focus: { docId: "doc_email", quote: EMAIL_QUOTE } });
    expect(screen.getByTestId("document-text").querySelector("mark[data-flash]")).toBeNull();
  });

  it("a bill with no documents says so and shows no document", () => {
    mount({ tweak: (b) => ({ ...b, x: { ...b.x, documents: [] } }) });
    expect(screen.getByText("No documents on this bill yet.")).toBeInTheDocument();
    expect(screen.queryByTestId("document-text")).not.toBeInTheDocument();
  });

  it("the document has a way back to the list when they stack", () => {
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    mount();
    fireEvent.click(screen.getByRole("button", { name: "All documents" }));
    expect(scroll).toHaveBeenCalled();
    expect(document.activeElement).toBe(current());
    Reflect.deleteProperty(Element.prototype, "scrollIntoView");
  });

  it("a document that couldn't be read says so with the reason", () => {
    mount({ tweak: (b) => ({ ...b, x: { ...b.x, documents: b.x.documents.map((d) => d._id === "doc_chat"
      ? { ...d, readStatus: "not_read" as const, readError: "The screenshot is too blurry to read." } : d) } }) });
    const row = within(list()).getByRole("button", { name: /WhatsApp/ });
    expect(within(row).getByText("Couldn't read")).toBeInTheDocument();
    expect(within(row).getByText("The screenshot is too blurry to read.")).toBeInTheDocument();
    fireEvent.click(row);
    expect(within(screen.getByRole("region", { name: "WhatsApp: Derek PCL / Sam Bayline" })).getByRole("status")).toHaveTextContent("The screenshot is too blurry to read.");
  });

  it("Add and recheck sends the pasted text and its kind to addEvidence", () => {
    const addEvidence = vi.fn(() => ({ kind: "replay" as const }));
    mount({ tweak: (b) => ({ ...b, actions: { ...b.actions, addEvidence } }) });
    const add = screen.getByRole("button", { name: "Add and recheck" });
    expect(add).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Kind"), { target: { value: "chat" } });
    fireEvent.change(screen.getByLabelText("Text"), { target: { value: "  Derek: rush handling is waived  " } });
    fireEvent.click(add);
    expect(addEvidence).toHaveBeenCalledWith({ type: "chat", text: "Derek: rush handling is waived" });
    expect(screen.getByText("Saved to the case. In this replay it isn't read.")).toBeInTheDocument();
    expect(screen.getByLabelText("Text")).toHaveValue("");
  });

  it("in the replay, added evidence shows up in the list", () => {
    mount();
    fireEvent.change(screen.getByLabelText("Text"), { target: { value: "Note: Derek called, rush handling waived." } });
    fireEvent.change(screen.getByLabelText("Kind"), { target: { value: "other" } });
    fireEvent.click(screen.getByRole("button", { name: "Add and recheck" }));
    expect(within(list()).getByText("Note you added")).toBeInTheDocument();
  });

  it("links to the phone page; someone without clerk gets only the link", () => {
    mount();
    expect(screen.getByRole("link", { name: "Add from a phone" })).toHaveAttribute("href", "/upload/case_A");
    act(() => setDevicePerson("leo"));
    expect(screen.queryByRole("button", { name: "Add and recheck" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Add from a phone" })).toHaveAttribute("href", "/upload/case_A");
    // An uploader sees no findings: nothing marked, no "Used for".
    expect(marks()).toHaveLength(0);
    expect(screen.queryByText(/Used for/)).not.toBeInTheDocument();
  });
});
