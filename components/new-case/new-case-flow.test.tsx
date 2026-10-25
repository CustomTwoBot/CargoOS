import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import fx from "@/fixtures/scenarioA.json";
import { EmptyCaseUpload } from "./empty-case";
import type { NewCaseDocument, NewCaseDraft, ReadDocument, ReadResult } from "./model";
import { NewCaseFlow, PLAY_OPEN_MS, PLAY_STEP_MS } from "./new-case-flow";

const text = (id: string) => fx.documents.find((d) => d.id === id)!.text;
const FAILED = "Couldn't read part of this document; affected lines are waiting on answers.";

type Props = Partial<Parameters<typeof NewCaseFlow>[0]>;
function mount(props: Props = {}) {
  const cb = { onLoadExample: vi.fn<(id: string) => void>(), onCreate: vi.fn<(d: NewCaseDraft) => void>() };
  render(<NewCaseFlow {...cb} {...props} />);
  return cb;
}

const button = (name: string | RegExp) => screen.getByRole("button", { name });
const thread = () => screen.getByRole("complementary", { name: "CargoOS" });
/** Paste one or several documents (split by a line of dashes) into the paste box and add them. */
const paste = (...texts: string[]) => {
  fireEvent.click(button("Paste text"));
  fireEvent.change(screen.getByLabelText("Pasted text"), { target: { value: texts.join("\n---\n") } });
  fireEvent.click(button("Add text"));
};
const pasteScenarioA = () => paste(text("doc_invoice"), text("doc_quote"), text("doc_email"), text("doc_chat"));
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

describe("New case, like a new chat (§0.4 п.6)", () => {
  afterEach(cleanup);

  it("drops on the canvas, CargoOS says what it will do, and the recorded cases are there to load", () => {
    mount();
    expect(screen.getByRole("heading", { name: "New case", level: 1 })).toBeInTheDocument();
    // A no-break space keeps the dash with "agreed" when the heading wraps.
    expect(screen.getByRole("heading", { name: "Drop the invoice and everything that was agreed\u00a0— quotes, emails, chats" })).toBeInTheDocument();
    expect(thread()).toHaveTextContent("I'll read each one and check every charge against them. Nothing is sent or paid.");
    const examples = screen.getByRole("region", { name: "Recorded cases" });
    expect(within(examples).getAllByRole("button", { name: "Load example" })).toHaveLength(2);
    expect(screen.getByText("Replay")).toBeInTheDocument();
  });

  it("can't read without an invoice, and says why", () => {
    mount();
    paste(text("doc_quote"));
    const read = button("Read documents");
    expect(read).toHaveAttribute("aria-disabled", "true");
    expect(read).toHaveAccessibleDescription("Add the forwarder's invoice to continue.");
  });

  it("pasted documents get their type from the text; several at once split by a line of dashes; the invoice comes first", () => {
    mount();
    paste(text("doc_quote"), text("doc_invoice"));
    const rows = added();
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("Invoice PCL-INV-1012");
    expect(rows[1]).toHaveTextContent("Quote Q-PCL-0902");
    fireEvent.click(button("Remove Quote Q-PCL-0902"));
    expect(added()).toHaveLength(1);
  });

  it("files dropped or chosen get a type from their name or text", async () => {
    mount();
    await choose("Files", [new File(["%PDF"], "invoice-PCL-INV-1012.pdf", { type: "application/pdf" }), new File([text("doc_chat")], "chat.txt", { type: "text/plain" })]);
    const rows = added();
    expect(rows[0]).toHaveTextContent("Invoice PCL-INV-1012");
    expect(rows[1]).toHaveTextContent("WhatsApp chat");
  });

  it("writes out the phone uploader's full address, never a bare route", () => {
    mount({ uploadUrl: "/upload/new" });
    expect(screen.getByLabelText("Address for your phone")).toHaveTextContent(`${window.location.host}/upload/new`);
  });
});

describe("New case in replay", () => {
  afterEach(() => { cleanup(); vi.useRealTimers(); });

  it("Read documents reads nothing, says so, and points to the examples", () => {
    mount();
    paste(text("doc_invoice"));
    fireEvent.click(button("Read documents"));
    expect(thread()).toHaveTextContent("This is a replay. Nothing is read, and nothing reaches Claude.");
    fireEvent.click(button("Edit documents"));
    expect(button("Read documents")).toBeInTheDocument();
  });

  it("Load example plays the reading of the recorded documents, a tick per file, then opens the case", () => {
    vi.useFakeTimers();
    const docs = fx.documents.map((d) => ({ title: d.title, type: d.type as NewCaseDocument["type"] }));
    const { onLoadExample } = mount({ exampleDocs: { case_A: docs } });
    fireEvent.click(within(screen.getByRole("region", { name: "Recorded cases" })).getAllByRole("button", { name: "Load example" })[0]);
    expect(within(thread()).getByRole("status")).toHaveTextContent("Reading 4 documents…");
    expect(within(thread()).queryAllByLabelText("Read")).toHaveLength(0);
    const step = () => act(() => { vi.advanceTimersByTime(PLAY_STEP_MS); });
    step(); step();
    expect(within(thread()).getAllByLabelText("Read")).toHaveLength(2);
    step(); step();
    expect(within(thread()).getByRole("status")).toHaveTextContent("Read 4 documents. Opening the case…");
    expect(onLoadExample).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(PLAY_OPEN_MS); });
    expect(onLoadExample).toHaveBeenCalledWith("case_A");
  });

  it("an example without recorded documents opens at once", () => {
    const { onLoadExample } = mount();
    fireEvent.click(within(screen.getByRole("region", { name: "Recorded cases" })).getAllByRole("button", { name: "Load example" })[1]);
    expect(onLoadExample).toHaveBeenCalledWith("case_B");
  });
});

describe("New case: reading live, then ready", () => {
  afterEach(cleanup);

  it("counts documents as they finish in the thread, then shows the summary and Check the invoice", async () => {
    const { onRead, settle } = manualReader();
    const { onCreate } = mount({ onRead });
    pasteScenarioA();
    fireEvent.click(button("Read documents"));

    expect(onRead).toHaveBeenCalledTimes(4);
    expect(onRead.mock.calls[0][0]).toEqual({ type: "freight_invoice", title: "Invoice PCL-INV-1012", text: text("doc_invoice") });
    expect(within(thread()).getByRole("heading", { name: "Reading documents… 0 of 4" })).toBeInTheDocument();
    expect(button("Check the invoice")).toHaveAccessibleDescription("Waiting for every document to be read.");

    await settle("freight_invoice", { kind: "read", facts: 0, charges: 8 });
    await settle("quote", { kind: "read", facts: 6 });
    await settle("email", { kind: "read", facts: 1 });
    await settle("chat", { kind: "failed", where: "messages 3–4", facts: 1 });
    expect(within(thread()).getByRole("heading", { name: "Read 4 documents" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(FAILED);
    expect(screen.getByText("8 charges found on the invoice, 3 documents with agreements.")).toBeInTheDocument();

    fireEvent.click(button("Check the invoice"));
    const draft = onCreate.mock.calls[0][0];
    expect(draft.title).toBe("Invoice PCL-INV-1012");
    expect(draft.documents.map((d) => d.type)).toEqual(["freight_invoice", "quote", "email", "chat"]);
  });

  it("text left in the paste box is added when reading starts", () => {
    const { onRead } = manualReader();
    mount({ onRead });
    fireEvent.click(button("Paste text"));
    fireEvent.change(screen.getByLabelText("Pasted text"), { target: { value: text("doc_invoice") } });
    fireEvent.click(button("Read documents"));
    expect(onRead).toHaveBeenCalledOnce();
  });

  it("Paste the text instead reads the document again with the pasted text", async () => {
    const { onRead, settle } = manualReader();
    mount({ onRead });
    paste(text("doc_invoice"), text("doc_chat"));
    fireEvent.click(button("Read documents"));
    await settle("freight_invoice", { kind: "read", facts: 0, charges: 8 });
    await settle("chat", { kind: "failed", where: "messages 3–4" });
    fireEvent.click(button("Paste the text instead"));
    fireEvent.change(screen.getByLabelText("Text of WhatsApp chat"), { target: { value: "Derek PCL: congestion $200 approved" } });
    fireEvent.click(button("Read again"));
    expect(onRead.mock.calls[2][0]).toMatchObject({ type: "chat", text: "Derek PCL: congestion $200 approved" });
    await settle("chat", { kind: "read", facts: 2 });
    expect(screen.getByText("8 charges found on the invoice, 1 document with agreements.")).toBeInTheDocument();
  });

  it("an invoice with no charges read can't be checked; a read that throws shows the failed sentence", async () => {
    const onRead = vi.fn<ReadDocument>(async () => ({ kind: "no_amounts" }));
    const { onCreate } = mount({ onRead });
    paste(text("doc_invoice"));
    await act(async () => { fireEvent.click(button("Read documents")); });
    expect(button("Check the invoice")).toHaveAccessibleDescription("No charges found on the invoice. Paste its text instead.");
    fireEvent.click(button("Check the invoice"));
    expect(onCreate).not.toHaveBeenCalled();
    cleanup();

    mount({ onRead: vi.fn<ReadDocument>(async () => { throw new Error("invalid JSON"); }) });
    paste(text("doc_invoice"));
    await act(async () => { fireEvent.click(button("Read documents")); });
    expect(screen.getByRole("alert")).toHaveTextContent(FAILED);
  });

  it("results that arrive after Edit documents are ignored", async () => {
    const { onRead, settle } = manualReader();
    mount({ onRead });
    paste(text("doc_invoice"));
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
    expect(screen.getByRole("region", { name: "Quote" })).toHaveTextContent("Added 1");
    expect(screen.getByLabelText("Address for your phone")).toHaveTextContent(`${window.location.host}/upload/case_A`);
    const pdf = new File(["%PDF"], "invoice-PCL-INV-1012.pdf", { type: "application/pdf" });
    await choose("Invoice files", [pdf]);
    expect(onAdd).toHaveBeenCalledWith([{ type: "freight_invoice", title: "Invoice PCL-INV-1012", text: "", file: pdf }]);
    fireEvent.click(button("Load Scenario A"));
    expect(onLoadScenarioA).toHaveBeenCalledOnce();
  });
});
