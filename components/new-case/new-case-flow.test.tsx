import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import fx from "@/fixtures/scenarioA.json";
import { CasesEmpty } from "./cases-empty";
import type { NewCaseDraft, ReadDocument, ReadResult } from "./model";
import { NewCaseFlow } from "./new-case-flow";

const text = (id: string) => fx.documents.find((d) => d.id === id)!.text;
const FAILED = "Couldn't read part of this document; affected lines are waiting on answers.";

type Props = Partial<Parameters<typeof NewCaseFlow>[0]>;
function mount(props: Props = {}) {
  const cb = { onCancel: vi.fn(), onLoadExample: vi.fn<(id: string) => void>(), onCreate: vi.fn<(d: NewCaseDraft) => void>() };
  render(<NewCaseFlow {...cb} {...props} />);
  return cb;
}

const button = (name: string | RegExp) => screen.getByRole("button", { name });
const pasteInvoice = (t = text("doc_invoice")) => {
  fireEvent.click(button("paste its text"));
  fireEvent.change(screen.getByLabelText("Invoice text"), { target: { value: t } });
  fireEvent.click(button("Add invoice"));
};
const pasteAgreements = (t: string) => {
  fireEvent.change(screen.getByLabelText("Agreement text"), { target: { value: t } });
  fireEvent.click(button("Add"));
};
const allAgreements = [text("doc_quote"), text("doc_email"), text("doc_chat")].join("\n---\n");

/** A reader the test settles by hand, one document at a time. */
function manualReader() {
  const pending = new Map<string, (r: ReadResult) => void>();
  const onRead = vi.fn<ReadDocument>((doc) => new Promise((resolve) => pending.set(doc.type, resolve)));
  const settle = async (type: string, r: ReadResult) => { await act(async () => { pending.get(type)!(r); }); };
  return { onRead, settle };
}

describe("New case: start", () => {
  afterEach(cleanup);

  it("shows what is required and what is helpful", () => {
    mount();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("New caseReplay");
    expect(screen.getByText("Synthetic data. Nothing is sent or paid automatically.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Forwarder invoice" }).parentElement).toHaveTextContent("Required");
    expect(screen.getByRole("heading", { name: "What was agreed" }).parentElement).toHaveTextContent("Helpful");
  });

  it("can't continue without an invoice, and says why", () => {
    const { onCreate } = mount({ onRead: vi.fn() });
    pasteAgreements(text("doc_email"));
    const read = button("Read documents");
    expect(read).toHaveAttribute("aria-disabled", "true");
    expect(read).toHaveAccessibleDescription("Add the forwarder's invoice to continue.");
    fireEvent.click(read);
    expect(screen.getByLabelText("Agreement text")).toBeInTheDocument();
    expect(onCreate).not.toHaveBeenCalled();
  });

  it("labels the invoice and names the case from it", () => {
    mount();
    pasteInvoice();
    const row = screen.getByText("Invoice PCL-INV-1012").closest("li")!;
    expect(row).toHaveTextContent("Pacific Crest Logistics · Oct 12");
    expect(screen.getByLabelText("Shipment")).toHaveAttribute("placeholder", "Invoice PCL-INV-1012");
    expect(button("Read documents")).not.toHaveAttribute("aria-disabled");
    expect(screen.getByText("Without a quote, email or chat, every charge waits on answers.")).toBeInTheDocument();
    fireEvent.click(button("Remove Invoice PCL-INV-1012"));
    expect(button("Read documents")).toHaveAttribute("aria-disabled", "true");
  });

  it("adds several agreements at once, each with type, title, sender and date", () => {
    mount();
    pasteAgreements(allAgreements);
    const list = screen.getByRole("list", { name: "What was agreed" });
    const rows = within(list).getAllByRole("listitem");
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent("Quote Q-PCL-0902");
    expect(rows[0]).toHaveTextContent("Pacific Crest Logistics · Sep 2");
    expect(rows[1]).toHaveTextContent("Email: RE: Q-PCL-0902 revised");
    expect(rows[2]).toHaveTextContent("Derek PCL, Sam Bayline · Sep 8");
    expect(screen.getByLabelText("Type of WhatsApp chat")).toHaveValue("chat");
    fireEvent.change(screen.getByLabelText("Type of Quote Q-PCL-0902"), { target: { value: "proforma" } });
    expect(screen.getByLabelText("Type of Quote Q-PCL-0902")).toHaveValue("proforma");
    expect(screen.getByLabelText("Agreement text")).toHaveValue("");
  });

  it("an invoice pasted with the agreements fills the invoice slot", () => {
    mount();
    pasteAgreements(`${text("doc_invoice")}\n---\n${text("doc_email")}`);
    expect(screen.getByRole("list", { name: "Forwarder invoice" })).toHaveTextContent("Invoice PCL-INV-1012");
    expect(within(screen.getByRole("list", { name: "What was agreed" })).getAllByRole("listitem")).toHaveLength(1);
  });

  it("text left in a paste box is added when reading starts", () => {
    mount();
    fireEvent.change(screen.getByLabelText("Agreement text"), { target: { value: `${text("doc_invoice")}\n---\n${text("doc_email")}` } });
    expect(button("Read documents")).not.toHaveAttribute("aria-disabled");
    fireEvent.click(button("Read documents"));
    expect(screen.getByRole("heading", { name: "2 documents added" })).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Documents" })).toHaveTextContent("Invoice PCL-INV-1012");
  });

  it("a dropped PDF invoice is kept as a file", async () => {
    mount();
    const pdf = new File(["%PDF-1.4"], "PCL-INV-1012.pdf", { type: "application/pdf" });
    await act(async () => { fireEvent.change(screen.getByLabelText("Invoice file"), { target: { files: [pdf] } }); });
    expect(screen.getByRole("list", { name: "Forwarder invoice" })).toHaveTextContent("PCL-INV-1012");
    expect(screen.getByRole("list", { name: "Forwarder invoice" })).toHaveTextContent("PDF · 1 KB");
  });

  it("Cancel and the recorded cases call back", () => {
    const { onCancel, onLoadExample } = mount();
    fireEvent.click(button("Cancel"));
    expect(onCancel).toHaveBeenCalledOnce();
    const aside = screen.getByRole("complementary", { name: "Recorded cases" });
    fireEvent.click(within(aside).getByRole("button", { name: /Load the 3-container case/ }));
    expect(onLoadExample).toHaveBeenCalledWith("case_B");
  });
});

describe("New case: reading in replay", () => {
  afterEach(cleanup);

  it("reads nothing, says so, and offers the recorded cases", () => {
    const { onLoadExample, onCreate } = mount();
    pasteInvoice();
    pasteAgreements(allAgreements);
    fireEvent.click(button("Read documents"));
    expect(screen.getByRole("heading", { name: "4 documents added" })).toBeInTheDocument();
    expect(screen.getAllByText("Not read in this replay.")).toHaveLength(4);
    expect(screen.getByText("This is a replay. Nothing is read, and nothing reaches Claude.")).toBeInTheDocument();
    expect(screen.queryByText("Reading with Claude…")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Check the invoice" })).not.toBeInTheDocument();
    fireEvent.click(button("Load Scenario A"));
    expect(onLoadExample).toHaveBeenCalledWith("case_A");
    expect(onCreate).not.toHaveBeenCalled();
  });

  it("Edit documents goes back with everything kept", () => {
    mount();
    pasteInvoice();
    fireEvent.click(button("Read documents"));
    fireEvent.click(button("Edit documents"));
    expect(screen.getByRole("list", { name: "Forwarder invoice" })).toHaveTextContent("Invoice PCL-INV-1012");
  });
});

describe("New case: reading live, then ready", () => {
  afterEach(cleanup);

  it("shows each document's reading state, then the summary and Check the invoice", async () => {
    const { onRead, settle } = manualReader();
    const { onCreate } = mount({ onRead });
    fireEvent.change(screen.getByLabelText("Shipment"), { target: { value: "Bayline 40HC Ningbo-LB" } });
    pasteInvoice();
    pasteAgreements(allAgreements);
    fireEvent.click(button("Read documents"));

    expect(onRead).toHaveBeenCalledTimes(4);
    expect(onRead.mock.calls[0][0]).toEqual({ type: "freight_invoice", title: "Invoice PCL-INV-1012", text: text("doc_invoice") });
    expect(screen.getByRole("heading", { name: "Reading 4 documents" })).toBeInTheDocument();
    expect(screen.getAllByText("Reading with Claude…")).toHaveLength(4);
    expect(button("Check the invoice")).toHaveAttribute("aria-disabled", "true");
    expect(button("Check the invoice")).toHaveAccessibleDescription("Waiting for every document to be read.");

    await settle("freight_invoice", { kind: "read", facts: 0, charges: 8 });
    await settle("quote", { kind: "read", facts: 6 });
    await settle("email", { kind: "read", facts: 1 });
    expect(screen.getByText("Read: 8 charges")).toBeInTheDocument();
    expect(screen.getByText("Read: 6 facts")).toBeInTheDocument();
    expect(screen.getByText("Read: 1 fact")).toBeInTheDocument();
    expect(screen.getAllByText("Reading with Claude…")).toHaveLength(1);

    await settle("chat", { kind: "failed", where: "messages 3–4", facts: 1 });
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(FAILED);
    expect(alert).toHaveTextContent("WhatsApp chat, messages 3–4.");

    expect(screen.getByRole("heading", { name: "Ready to check" })).toBeInTheDocument();
    expect(screen.getByText("8 charges found on the invoice, 3 documents with agreements.")).toBeInTheDocument();
    fireEvent.click(button("Check the invoice"));
    expect(onCreate).toHaveBeenCalledOnce();
    const draft = onCreate.mock.calls[0][0];
    expect(draft.title).toBe("Bayline 40HC Ningbo-LB");
    expect(draft.documents.map((d) => [d.type, d.title])).toEqual([
      ["freight_invoice", "Invoice PCL-INV-1012"], ["quote", "Quote Q-PCL-0902"],
      ["email", "Email: RE: Q-PCL-0902 revised"], ["chat", "WhatsApp chat"],
    ]);
  });

  it("Paste the text instead reads the document again with the pasted text", async () => {
    const { onRead, settle } = manualReader();
    mount({ onRead });
    pasteInvoice();
    pasteAgreements(text("doc_chat"));
    fireEvent.click(button("Read documents"));
    await settle("freight_invoice", { kind: "read", facts: 0, charges: 8 });
    await settle("chat", { kind: "failed", where: "messages 3–4" });

    fireEvent.click(button("Paste the text instead"));
    const again = button("Read again");
    expect(again).toHaveAttribute("aria-disabled", "true");
    fireEvent.change(screen.getByLabelText("Text of WhatsApp chat"), { target: { value: "Derek PCL: congestion $200 approved" } });
    fireEvent.click(again);
    expect(onRead).toHaveBeenCalledTimes(3);
    expect(onRead.mock.calls[2][0]).toMatchObject({ type: "chat", title: "WhatsApp chat", text: "Derek PCL: congestion $200 approved" });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText("Reading with Claude…")).toBeInTheDocument();
    await settle("chat", { kind: "read", facts: 2 });
    expect(screen.getByText("Read: 2 facts")).toBeInTheDocument();
    expect(screen.getByText("8 charges found on the invoice, 1 document with agreements.")).toBeInTheDocument();
  });

  it("an invoice with no charges read can't be checked, with the reason shown", async () => {
    const onRead = vi.fn<ReadDocument>(async () => ({ kind: "no_amounts" }));
    const { onCreate } = mount({ onRead });
    pasteInvoice("Invoice 2291\nsee attached");
    await act(async () => { fireEvent.click(button("Read documents")); });
    expect(screen.getByText("No charges found in this invoice.")).toBeInTheDocument();
    const check = button("Check the invoice");
    expect(check).toHaveAccessibleDescription("No charges found on the invoice. Paste its text instead.");
    fireEvent.click(check);
    expect(onCreate).not.toHaveBeenCalled();
  });

  it("a read that throws is shown as the failed sentence, never a crash", async () => {
    const onRead = vi.fn<ReadDocument>(async () => { throw new Error("invalid JSON"); });
    mount({ onRead });
    pasteInvoice();
    await act(async () => { fireEvent.click(button("Read documents")); });
    expect(screen.getByRole("alert")).toHaveTextContent(FAILED);
  });

  it("results that arrive after Edit documents are ignored", async () => {
    const { onRead, settle } = manualReader();
    mount({ onRead });
    pasteInvoice();
    fireEvent.click(button("Read documents"));
    fireEvent.click(button("Edit documents"));
    await settle("freight_invoice", { kind: "read", facts: 0, charges: 8 });
    expect(screen.queryByText("Read: 8 charges")).not.toBeInTheDocument();
    expect(button("Read documents")).toBeInTheDocument();
  });
});

describe("Cases list with no cases", () => {
  afterEach(cleanup);

  it("leads into New case and offers the recorded cases", () => {
    const onNew = vi.fn();
    const onLoadExample = vi.fn();
    render(<CasesEmpty onNew={onNew} onLoadExample={onLoadExample} />);
    expect(screen.getByRole("heading", { name: "No cases yet." })).toBeInTheDocument();
    fireEvent.click(button("New case"));
    expect(onNew).toHaveBeenCalledOnce();
    fireEvent.click(button(/Load Scenario A/));
    expect(onLoadExample).toHaveBeenCalledWith("case_A");
    expect(screen.getByText("1 invoice, 15 charges, two questions and a follow-up")).toBeInTheDocument();
  });
});
