import { useEffect } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BillsProvider, useBills, type BillsValue } from "@/components/app/bills-provider";
import type { DemoCase } from "@/components/case/demo-case";
import { SCENARIO_A, scenarioADraft } from "@/components/case/fixture";
import { plainMessage, printPage, signedBy } from "@/components/inboxes/message";
import { setDevicePerson } from "@/components/shell/person";
import { contactOf, LetterPage } from "./letter-page";

const held: { api?: BillsValue } = {};
function Capture() { const v = useBills(); useEffect(() => { held.api = v; }); return null; }

const ID = SCENARIO_A.id;
const bill = () => held.api!.bill(ID)!;
const draft = scenarioADraft();

function mount(print = vi.fn(), cases?: DemoCase[]) {
  render(<BillsProvider cases={cases}><Capture /><LetterPage id={ID} print={print} /></BillsProvider>);
  return print;
}

/**
 * Scenario A after the answer: Maya asks for approval and Sam accepts, through the replay actions. Whoever
 * asks can't accept (CLAUDE.md rule 8, case-store draftDispute), so the request comes from Maya's screen.
 */
function accept() {
  act(() => bill().actions.reset("after"));
  act(() => setDevicePerson("maya"));
  let id = "";
  act(() => { id = bill().actions.draftDispute()!._id; });
  act(() => setDevicePerson("sam"));
  act(() => bill().actions.accept(id));
}

const message = () => screen.getByRole("textbox", { name: "Message text, numbers are locked" });
const chipsIn = (el: HTMLElement) => [...el.querySelectorAll<HTMLElement>("[data-chip]")];

describe("LetterPage", () => {
  beforeEach(() => { localStorage.clear(); setDevicePerson("sam"); });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); localStorage.clear(); });

  it("before the dispute is accepted, it says to accept first and links back to the bill", () => {
    mount();
    expect(screen.getByRole("heading", { name: "Accept the dispute first" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to the bill" })).toHaveAttribute("href", `/bills/${ID}`);
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("shows To, From and About, and the body with every amount and line number as a locked chip", () => {
    mount();
    accept();
    expect(screen.getByRole("link", { name: "← Back to the bill" })).toHaveAttribute("href", `/bills/${ID}`);
    expect(screen.getByText("Message to Pacific Crest Logistics")).toBeInTheDocument();
    expect(screen.getByText("Derek, Pacific Crest Logistics")).toBeInTheDocument();
    expect(screen.getByText("Sam, Bayline Home Goods")).toBeInTheDocument();
    expect(screen.getByText("2 charges · $700")).toHaveAttribute("data-chip");
    expect(screen.getByText("Accepted by Sam. Nothing was sent.")).toBeInTheDocument();

    const chips = chipsIn(message());
    expect(chips.map((c) => c.textContent)).toEqual(["Line 1", "$4,800", "$4,500", "$300", "Line 6", "$400", "$400", "$400", "$700", "$6,800"]);
    for (const c of chips) expect(c).toHaveAttribute("contenteditable", "false");
    expect(message()).toHaveAttribute("contenteditable", "true");
    // The recorded draft is signed by whoever sends it.
    expect(message().textContent).toBe(signedBy(draft.body, "Sam"));
    expect(message().textContent).toContain("Thanks,\nSam\nBayline Home Goods");

    const locked = screen.getByRole("list", { name: "Locked from the bill" });
    expect(within(locked).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["Line 1", "$4,800", "$4,500", "$300", "Line 6", "$400", "$700", "$6,800"]);
    expect(screen.getByText("Click any word to edit it")).toBeInTheDocument();
    expect(screen.getByText("CargoOS never sends this. You send it yourself.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /send/i })).not.toBeInTheDocument();
  });

  it("Copy text puts the plain message on the clipboard and says who to paste it to", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    mount();
    accept();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Copy text" })); });
    expect(writeText).toHaveBeenCalledWith(plainMessage({ subject: draft.subject, body: signedBy(draft.body, "Sam") }));
    expect(await screen.findByText("Copied. Paste it into your email to Derek.")).toBeInTheDocument();
  });

  it("a clipboard failure is said plainly, never thrown", async () => {
    Object.defineProperty(navigator, "clipboard", { value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) }, configurable: true });
    mount();
    accept();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Copy text" })); });
    expect(await screen.findByText("Couldn't copy here. Select the text and copy it yourself.")).toBeInTheDocument();
  });

  it("Save as PDF prints the page with To, Subject and the body", () => {
    const print = mount();
    accept();
    fireEvent.click(screen.getByRole("button", { name: "Save as PDF" }));
    expect(print).toHaveBeenCalledWith(printPage({ to: "Derek, Pacific Crest Logistics", subject: draft.subject, body: signedBy(draft.body, "Sam") }));
  });

  it("edits to the words are saved to the draft after a pause", async () => {
    mount();
    accept();
    const el = message();
    const first = el.querySelector<HTMLElement>("span:not([data-chip])")!;
    first.textContent = "Hello Derek,\n\nThanks for invoice PCL-INV-1012. Before we pay, we need to raise two lines:\n\n";
    fireEvent.input(el);
    const subject = screen.getByRole("textbox", { name: "Subject" });
    expect(chipsIn(subject).map((c) => c.textContent)).toEqual(["$700"]);
    await waitFor(() => expect(bill().x.drafts.at(-1)!.editedBody).toBe(el.textContent));
    expect(bill().x.drafts.at(-1)!.editedBody).toMatch(/^Hello Derek,/);
    expect(bill().x.drafts.at(-1)!.subject).toBe(draft.subject);
  });

  it("someone without the controller role reads it without editing, and can still copy or save it", () => {
    const print = mount();
    accept();
    act(() => setDevicePerson("maya"));
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.getByText("Sam edits and sends this message.")).toBeInTheDocument();
    const text = screen.getByLabelText("Message text");
    expect(text).not.toHaveAttribute("contenteditable");
    expect(chipsIn(text).length).toBeGreaterThan(0);
    for (const c of chipsIn(text)) expect(c).not.toHaveAttribute("contenteditable");
    // Signed by Sam, who accepted it and sends it.
    expect(text.textContent).toContain("Thanks,\nSam");
    expect(screen.getByText("Sam, Bayline Home Goods")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save as PDF" }));
    expect(print).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Copy text" })).toBeInTheDocument();
  });

  it("an uploader sees no message and no amounts", () => {
    mount();
    accept();
    act(() => setDevicePerson("leo"));
    expect(screen.getByRole("heading", { name: "Only documents on this screen" })).toBeInTheDocument();
    expect(screen.queryByText(/\$\d/)).not.toBeInTheDocument();
  });

  it("an accepted draft with no words yet shows that CargoOS is writing it", () => {
    const empty: DemoCase = { ...SCENARIO_A, draft: (x) => (x.case.revision === 2 ? { ...scenarioADraft(), body: "" } : undefined) };
    mount(vi.fn(), [empty]);
    accept();
    expect(within(screen.getByRole("region", { name: "Message" })).getByRole("status")).toHaveTextContent("CargoOS is writing the message…");
    expect(screen.queryByRole("button", { name: "Copy text" })).not.toBeInTheDocument();
  });

  it("an unknown bill says so and links to the bills list", () => {
    render(<BillsProvider><LetterPage id="nope" /></BillsProvider>);
    expect(screen.getByRole("heading", { name: "This bill isn't on this screen" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to bills" })).toHaveAttribute("href", "/bills");
  });
});

describe("contactOf", () => {
  it("reads the greeted name, or nothing", () => {
    expect(contactOf("Hi Derek,\n\nThanks")).toBe("Derek");
    expect(contactOf("Dear Ms. Wong,")).toBe("Wong");
    expect(contactOf("Thanks for the invoice.")).toBeUndefined();
  });
});
