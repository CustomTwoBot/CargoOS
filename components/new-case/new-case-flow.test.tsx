import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import fx from "@/fixtures/scenarioA.json";
import { CasesEmpty } from "./cases-empty";
import { EmptyCaseUpload } from "./empty-case";
import type { NewCaseDocument, NewCaseDraft, ReadDocument, ReadResult } from "./model";
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
/** Paste on one of the four targets: "invoice", "quote", "email", "chat". */
const pasteAs = (kind: string, t: string, add = true) => {
  fireEvent.click(button(`Paste ${kind} text`));
  const label = kind.charAt(0).toUpperCase() + kind.slice(1);
  fireEvent.change(screen.getByLabelText(`${label} text`), { target: { value: t } });
  if (add) fireEvent.click(button(`Add ${kind}`));
};
const pasteScenarioA = () => {
  pasteAs("invoice", text("doc_invoice"));
  pasteAs("quote", text("doc_quote"));
  pasteAs("email", text("doc_email"));
  pasteAs("chat", text("doc_chat"));
};
const choose = async (label: string, files: File[]) => {
  await act(async () => { fireEvent.change(screen.getByLabelText(label), { target: { files } }); });
};
const added = () => within(screen.getByRole("list", { name: "Added documents" })).getAllByRole("listitem");

/** A reader the test settles by hand, one document type at a time. */
function manualReader() {
  const pending = new Map<string, (r: ReadResult) => void>();
  const onRead = vi.fn<ReadDocument>((doc) => new Promise((resolve) => pending.set(doc.type, resolve)));
  const settle = async (type: string, r: ReadResult) => { await act(async () => { pending.get(type)!(r); }); };
  return { onRead, settle };
}

describe("New case: start", () => {
  afterEach(cleanup);

  it("shows four large targets, the invoice marked required", () => {
    mount();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("New caseReplay");
    expect(screen.getByText("Synthetic data. Nothing is sent or paid automatically.")).toBeInTheDocument();
    const targets = ["Invoice", "Quote", "Email", "Chat"].map((n) => screen.getByRole("region", { name: n }));
    expect(targets[0]).toHaveTextContent("Required");
    expect(targets[0]).toHaveTextContent("PDF or photo");
    expect(targets[1]).not.toHaveTextContent("Required");
    expect(targets[2]).toHaveTextContent(".eml file or pasted text");
    expect(targets[3]).toHaveTextContent("WhatsApp export, .txt");
  });

  it("can't continue without an invoice, and says why", () => {
    const { onCreate } = mount({ onRead: vi.fn() });
    pasteAs("email", text("doc_email"));
    const read = button("Read documents");
    expect(read).toHaveAttribute("aria-disabled", "true");
    expect(read).toHaveAccessibleDescription("Add the forwarder's invoice to continue.");
    fireEvent.click(read);
    expect(screen.getByRole("region", { name: "Invoice" })).toBeInTheDocument();
    expect(onCreate).not.toHaveBeenCalled();
  });

  it("labels the invoice, counts it on its target and names the case from it", () => {
    mount();
    pasteAs("invoice", text("doc_invoice"));
    expect(added()[0]).toHaveTextContent("Invoice PCL-INV-1012");
    expect(added()[0]).toHaveTextContent("Pacific Crest Logistics · Oct 12");
    expect(screen.getByRole("region", { name: "Invoice" })).toHaveTextContent("Added 1");
    expect(screen.getByLabelText("Shipment")).toHaveAttribute("placeholder", "Invoice PCL-INV-1012");
    expect(button("Read documents")).not.toHaveAttribute("aria-disabled");
    expect(screen.getByText("Without a quote, email or chat, every charge waits on answers.")).toBeInTheDocument();
    fireEvent.click(button("Remove Invoice PCL-INV-1012"));
    expect(button("Read documents")).toHaveAttribute("aria-disabled", "true");
  });

  it("each document shows type, title, sender and date; the type can be changed", () => {
    mount();
    pasteScenarioA();
    const rows = added();
    expect(rows).toHaveLength(4);
    expect(rows[1]).toHaveTextContent("Quote Q-PCL-0902");
    expect(rows[1]).toHaveTextContent("Pacific Crest Logistics · Sep 2");
    expect(rows[2]).toHaveTextContent("Email: RE: Q-PCL-0902 revised");
    expect(rows[3]).toHaveTextContent("Derek PCL, Sam Bayline · Sep 8");
    expect(screen.getByLabelText("Type of WhatsApp chat")).toHaveValue("chat");
    fireEvent.change(screen.getByLabelText("Type of Quote Q-PCL-0902"), { target: { value: "proforma" } });
    expect(screen.getByLabelText("Type of Quote Q-PCL-0902")).toHaveValue("proforma");
  });

  it("several pastes at once on one target, split by a line of dashes", () => {
    mount();
    pasteAs("email", `${text("doc_email")}\n---\nSubject: Booking\nConfirmed for Sep 8. - Derek`);
    expect(added()).toHaveLength(2);
    expect(screen.getByRole("region", { name: "Email" })).toHaveTextContent("Added 2");
    expect(screen.queryByLabelText("Email text")).not.toBeInTheDocument();
  });

  it("files dropped on a target take its type; several at once", async () => {
    mount();
    const pdf = (name: string) => new File(["%PDF-1.4"], name, { type: "application/pdf" });
    await choose("Quote files", [pdf("Q-PCL-0902.pdf"), pdf("scan.pdf")]);
    const rows = added();
    expect(rows).toHaveLength(2);
    expect(screen.getByLabelText("Type of Q-PCL-0902")).toHaveValue("quote");
    expect(screen.getByLabelText("Type of scan")).toHaveValue("quote");
    expect(rows[0]).toHaveTextContent("PDF · 1 KB");
    await choose("Invoice files", [pdf("PCL-INV-1012.pdf")]);
    expect(added()[0]).toHaveTextContent("PCL-INV-1012");
    expect(button("Read documents")).not.toHaveAttribute("aria-disabled");
  });

  it("files dropped between the targets get a type from their name or text", async () => {
    mount();
    await choose("Files", [
      new File(["%PDF"], "invoice-PCL-INV-1012.pdf", { type: "application/pdf" }),
      new File([text("doc_chat")], "whatsapp-derek-pcl.txt", { type: "text/plain" }),
    ]);
    expect(added()[0]).toHaveTextContent("Invoice PCL-INV-1012");
    expect(added()[1]).toHaveTextContent("WhatsApp chat");
    expect(screen.getByLabelText("Type of WhatsApp chat")).toHaveValue("chat");
  });

  it("text left in the paste box is added when reading starts", () => {
    mount();
    pasteAs("invoice", text("doc_invoice"), false);
    expect(button("Read documents")).not.toHaveAttribute("aria-disabled");
    fireEvent.click(button("Read documents"));
    expect(screen.getByRole("heading", { name: "1 document added" })).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Documents" })).toHaveTextContent("Invoice PCL-INV-1012");
  });

  it("shows the phone uploader's address where the QR code goes, when there is one", () => {
    mount({ uploadUrl: "https://cargoos.example/upload/case_A" });
    const card = screen.getByRole("region", { name: "Add from your phone" });
    expect(within(card).getByRole("img", { name: "QR code for https://cargoos.example/upload/case_A" })).toBeInTheDocument();
    expect(card).toHaveTextContent("Scan to upload a WhatsApp export, a PDF or a photo.");
    cleanup();
    mount();
    expect(screen.queryByRole("region", { name: "Add from your phone" })).not.toBeInTheDocument();
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
    pasteScenarioA();
    fireEvent.click(button("Read documents"));
    expect(screen.getByRole("heading", { name: "4 documents added" })).toBeInTheDocument();
    expect(screen.getAllByText("Not read in this replay.")).toHaveLength(4);
    expect(screen.getByText("This is a replay. Nothing is read, and nothing reaches Claude.")).toBeInTheDocument();
    expect(screen.queryByText(/Reading documents/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Check the invoice" })).not.toBeInTheDocument();
    fireEvent.click(button("Load Scenario A"));
    expect(onLoadExample).toHaveBeenCalledWith("case_A");
    expect(onCreate).not.toHaveBeenCalled();
  });

  it("Edit documents goes back with everything kept", () => {
    mount();
    pasteAs("invoice", text("doc_invoice"));
    fireEvent.click(button("Read documents"));
    fireEvent.click(button("Edit documents"));
    expect(added()[0]).toHaveTextContent("Invoice PCL-INV-1012");
  });
});

describe("New case: reading live, then ready", () => {
  afterEach(cleanup);

  it("counts documents as they finish, then shows the summary and Check the invoice", async () => {
    const { onRead, settle } = manualReader();
    const { onCreate } = mount({ onRead });
    fireEvent.change(screen.getByLabelText("Shipment"), { target: { value: "Bayline 40HC Ningbo-LB" } });
    pasteScenarioA();
    fireEvent.click(button("Read documents"));

    expect(onRead).toHaveBeenCalledTimes(4);
    expect(onRead.mock.calls[0][0]).toEqual({ type: "freight_invoice", title: "Invoice PCL-INV-1012", text: text("doc_invoice") });
    expect(screen.getByRole("heading", { name: "Reading documents… 0 of 4" })).toBeInTheDocument();
    expect(screen.getAllByText("Reading…")).toHaveLength(4);
    expect(button("Check the invoice")).toHaveAttribute("aria-disabled", "true");
    expect(button("Check the invoice")).toHaveAccessibleDescription("Waiting for every document to be read.");

    await settle("freight_invoice", { kind: "read", facts: 0, charges: 8 });
    await settle("quote", { kind: "read", facts: 6 });
    expect(screen.getByRole("heading", { name: "Reading documents… 2 of 4" })).toBeInTheDocument();
    await settle("email", { kind: "read", facts: 1 });
    const rows = within(screen.getByRole("list", { name: "Documents" })).getAllByRole("listitem");
    expect(rows[0]).toHaveTextContent("Invoice PCL-INV-1012Invoice8 charges");
    expect(rows[1]).toHaveTextContent("6 facts");
    expect(rows[2]).toHaveTextContent("1 fact");
    expect(rows[3]).toHaveTextContent("Reading…");

    await settle("chat", { kind: "failed", where: "messages 3–4", facts: 1 });
    expect(screen.getByRole("heading", { name: "Read 4 documents" })).toBeInTheDocument();
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(FAILED);
    expect(alert).toHaveTextContent("WhatsApp chat, messages 3–4.");

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
    pasteAs("invoice", text("doc_invoice"));
    pasteAs("chat", text("doc_chat"));
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
    expect(screen.getByRole("heading", { name: "Reading documents… 1 of 2" })).toBeInTheDocument();
    await settle("chat", { kind: "read", facts: 2 });
    expect(screen.getByText("2 facts")).toBeInTheDocument();
    expect(screen.getByText("8 charges found on the invoice, 1 document with agreements.")).toBeInTheDocument();
  });

  it("an invoice with no charges read can't be checked, with the reason shown", async () => {
    const onRead = vi.fn<ReadDocument>(async () => ({ kind: "no_amounts" }));
    const { onCreate } = mount({ onRead });
    pasteAs("invoice", "Invoice 2291\nsee attached");
    await act(async () => { fireEvent.click(button("Read documents")); });
    expect(screen.getByText("No charges found")).toBeInTheDocument();
    const check = button("Check the invoice");
    expect(check).toHaveAccessibleDescription("No charges found on the invoice. Paste its text instead.");
    fireEvent.click(check);
    expect(onCreate).not.toHaveBeenCalled();
  });

  it("a read that throws is shown as the failed sentence, never a crash", async () => {
    const onRead = vi.fn<ReadDocument>(async () => { throw new Error("invalid JSON"); });
    mount({ onRead });
    pasteAs("invoice", text("doc_invoice"));
    await act(async () => { fireEvent.click(button("Read documents")); });
    expect(screen.getByRole("alert")).toHaveTextContent(FAILED);
  });

  it("results that arrive after Edit documents are ignored", async () => {
    const { onRead, settle } = manualReader();
    mount({ onRead });
    pasteAs("invoice", text("doc_invoice"));
    fireEvent.click(button("Read documents"));
    fireEvent.click(button("Edit documents"));
    await settle("freight_invoice", { kind: "read", facts: 0, charges: 8 });
    expect(screen.queryByText("8 charges")).not.toBeInTheDocument();
    expect(button("Read documents")).toBeInTheDocument();
  });
});

describe("Empty case in live mode", () => {
  afterEach(cleanup);

  it("shows the empty-case words, the four targets and the phone QR; files go up at once with their type", async () => {
    const onAdd = vi.fn<(docs: NewCaseDocument[]) => void>();
    const onLoadScenarioA = vi.fn();
    render(<EmptyCaseUpload onAdd={onAdd} uploadUrl="/upload/case_A" counts={{ quote: 1 }} onLoadScenarioA={onLoadScenarioA} />);
    expect(screen.getByRole("heading", { name: "No invoice in this case yet." })).toBeInTheDocument();
    expect(screen.getByText("Add the forwarder's invoice and the quote to start checking.")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Quote" })).toHaveTextContent("Added 1");
    expect(screen.getByRole("img", { name: "QR code for /upload/case_A" })).toBeInTheDocument();

    const pdf = new File(["%PDF"], "invoice-PCL-INV-1012.pdf", { type: "application/pdf" });
    await choose("Invoice files", [pdf]);
    expect(onAdd).toHaveBeenCalledWith([{ type: "freight_invoice", title: "Invoice PCL-INV-1012", text: "", file: pdf }]);

    pasteAs("email", text("doc_email"));
    expect(onAdd).toHaveBeenLastCalledWith([{ type: "email", title: "Email: RE: Q-PCL-0902 revised", text: text("doc_email") }]);

    fireEvent.click(button("Load Scenario A"));
    expect(onLoadScenarioA).toHaveBeenCalledOnce();
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
