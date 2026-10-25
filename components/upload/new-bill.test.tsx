// /bills/new: the replay example, dropped files with their detected kinds, and the live upload calls.
// Only convex/react (and whether a Convex provider is present) is mocked; kinds and the page run for real.
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { FunctionReference } from "convex/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BillsProvider } from "@/components/app/bills-provider";
import { SCENARIO_A } from "@/components/case/fixture";
import { EXAMPLE_FILES, NewBillPage } from "./new-bill";
import { QrCode } from "./qr-code";

const h = vi.hoisted(() => ({
  live: false,
  queries: {} as Record<string, unknown>,
  calls: [] as { name: string; args: unknown }[],
  results: {} as Record<string, unknown>,
}));

vi.mock("@/components/convex-provider", () => ({ useHasConvex: () => h.live }));
vi.mock("convex/react", async () => {
  const { getFunctionName } = await import("convex/server");
  return {
    useQuery: (ref: FunctionReference<"query">, args?: unknown) => (args === "skip" ? undefined : h.queries[getFunctionName(ref)]),
    useMutation: (ref: FunctionReference<"mutation">) => async (args: unknown) => {
      const name = getFunctionName(ref);
      h.calls.push({ name, args });
      return h.results[name];
    },
  };
});

const mount = () => render(<BillsProvider><NewBillPage /></BillsProvider>);
const choose = async (files: File[]) => {
  await act(async () => { fireEvent.change(screen.getByLabelText("Files to add"), { target: { files } }); });
};
const rows = () => within(screen.getByRole("list", { name: "Added documents" })).getAllByRole("listitem");
const pdf = (name: string) => new File(["%PDF-1.4"], name, { type: "application/pdf" });
const CHAT = "10/12/26, 09:14 - Derek PCL: Ocean is 2,150 all in\n10/12/26, 09:20 - Sam Bayline: ok";

beforeEach(() => {
  h.live = false; h.queries = {}; h.calls = []; h.results = {};
  try { localStorage.clear(); } catch { /* none */ }
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("New bill: replay", () => {
  it("lays out the drop zone, the phone card and the needs card", () => {
    mount();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Drop the bill and everything that was agreed.");
    expect(screen.getByRole("link", { name: "← All bills" })).toHaveAttribute("href", "/bills");
    expect(screen.getByRole("button", { name: "Choose files" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "What CargoOS needs" })).toBeInTheDocument();
    // The replay QR points at the demo phone page.
    expect(screen.getByRole("img", { name: /^QR code for http:\/\/localhost(:\d+)?\/upload\/demo$/ })).toBeInTheDocument();
  });

  it("runs the Scenario A example to Open the bill", async () => {
    vi.useFakeTimers();
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Use the example (Scenario A)" }));
    await act(async () => { vi.advanceTimersByTime(700); });
    expect(screen.getByText(/^Reading documents · 0 of \d$/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Open the bill" })).not.toBeInTheDocument();
    await act(async () => { vi.advanceTimersByTime(5000); });
    expect(screen.getByText("Read all 4 documents")).toBeInTheDocument();
    expect(rows().map((r) => r.textContent)).toEqual([
      "PDFPCL-INV-1012.pdfInvoiceRead", "PDFQ-PCL-0902.pdfQuoteRead",
      "EMLRE Q-PCL-0902 revised.emlEmailRead", "WAWhatsApp Chat with Derek PCL.txtWhatsApp chatRead",
    ]);
    expect(screen.getByText("Checked. Open the bill to see what is safe to pay.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open the bill" })).toHaveAttribute("href", `/bills/${SCENARIO_A.id}`);
  });

  it("uses Scenario A's four document types", () => {
    const types = SCENARIO_A.at(SCENARIO_A.start).documents.map((d) => d.type).filter((t) => t !== "reply").sort();
    expect(EXAMPLE_FILES.map((f) => f.docType).sort()).toEqual(types);
  });

  it("lists dropped files with their detected kinds, not read in a replay", async () => {
    mount();
    await choose([
      pdf("PCL-INV-1012.pdf"), pdf("Q-PCL-0902.pdf"),
      new File([CHAT], "WhatsApp Chat with Derek PCL.txt", { type: "text/plain" }),
      new File(["Subject: RE: rate\nFrom: Derek"], "rate.eml", { type: "message/rfc822" }),
      new File(["jpg"], "IMG_2041.jpg", { type: "image/jpeg" }),
    ]);
    const kinds = rows().map((r) => within(r).getAllByText(/./).map((n) => n.textContent));
    expect(kinds.map((k) => k.slice(1, 3))).toEqual([
      ["PCL-INV-1012.pdf", "Invoice"], ["Q-PCL-0902.pdf", "Quote"], ["WhatsApp Chat with Derek PCL.txt", "WhatsApp chat"],
      ["rate.eml", "Email"], ["IMG_2041.jpg", "Photo"],
    ]);
    rows().forEach((r) => expect(r).toHaveTextContent("Not read"));
    expect(screen.getByText("In this replay, new files aren't read. Use the example to see the checks.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Open the bill" })).not.toBeInTheDocument();
  });

  it("adds pasted text with the type chosen", async () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Paste text" }));
    fireEvent.change(screen.getByLabelText("Pasted text"), { target: { value: CHAT } });
    expect(screen.getByLabelText("What it is")).toHaveValue("chat");
    fireEvent.change(screen.getByLabelText("What it is"), { target: { value: "other" } });
    fireEvent.click(screen.getByRole("button", { name: "Add text" }));
    expect(rows()[0]).toHaveTextContent("Note");
  });
});

describe("New bill: live", () => {
  const CASE = "case_new_1";
  beforeEach(() => {
    h.live = true;
    h.results = { "uploads:createCase": CASE, "uploads:generateUploadUrl": "https://upload.example/u1", "uploads:addDocument": "doc_1" };
  });

  it("creates the case, then uploads the file and adds it as a document", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ storageId: "st_1" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const view = mount();
    const file = pdf("invoice-PCL-INV-1012.pdf");
    await choose([file]);

    const names = h.calls.map((c) => c.name).filter((n) => n.startsWith("uploads:"));
    expect(names).toEqual(["uploads:createCase", "uploads:generateUploadUrl", "uploads:addDocument"]);
    expect(h.calls.find((c) => c.name === "uploads:createCase")!.args).toEqual({ personId: "sam", title: "Invoice PCL-INV-1012" });
    expect(h.calls.find((c) => c.name === "uploads:generateUploadUrl")!.args).toEqual({ personId: "sam" });
    expect(fetchMock).toHaveBeenCalledWith("https://upload.example/u1",
      { method: "POST", headers: { "Content-Type": "application/pdf" }, body: file });
    expect(h.calls.find((c) => c.name === "uploads:addDocument")!.args).toEqual({
      caseId: CASE, personId: "sam", storageId: "st_1", fileName: "invoice-PCL-INV-1012.pdf", docType: "freight_invoice",
    });

    // The server reads it; then the bill can be opened, and the QR points at this case.
    h.queries["uploads:getUploadContext"] = { title: "Invoice PCL-INV-1012", documents: [{ _id: "doc_1", title: file.name, type: "freight_invoice", readStatus: "reading" }] };
    view.rerender(<BillsProvider><NewBillPage /></BillsProvider>);
    expect(rows()[0]).toHaveTextContent("Reading…");
    h.queries["uploads:getUploadContext"] = { title: "Invoice PCL-INV-1012", documents: [{ _id: "doc_1", title: file.name, type: "freight_invoice", readStatus: "read" }] };
    view.rerender(<BillsProvider><NewBillPage /></BillsProvider>);
    expect(rows()[0]).toHaveTextContent("Read");
    expect(screen.getByRole("link", { name: "Open the bill" })).toHaveAttribute("href", `/bills/${CASE}`);
    expect(screen.getByRole("img", { name: new RegExp(`QR code for .*/upload/${CASE}$`) })).toBeInTheDocument();
    // Remembered in the bills list as soon as the case exists, and the page keeps its uploads.
    expect(JSON.parse(localStorage.getItem("cargoos.bills") ?? "[]")).toEqual([CASE]);
    expect(rows()[0]).toHaveTextContent("Read");
  });

  it("shows why a document couldn't be read", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ storageId: "st_1" }))));
    const view = mount();
    await choose([pdf("scan.pdf")]);
    h.queries["uploads:getUploadContext"] = { title: "New bill", documents: [{ _id: "doc_1", title: "scan.pdf", type: "other", readStatus: "not_read", readError: "the PDF has no text layer" }] };
    view.rerender(<BillsProvider><NewBillPage /></BillsProvider>);
    expect(rows()[0]).toHaveTextContent("Couldn't read: the PDF has no text layer");
    expect(screen.queryByRole("link", { name: "Open the bill" })).not.toBeInTheDocument();
  });

  it("makes the case for a phone link before any file", async () => {
    mount();
    expect(screen.queryByRole("img", { name: /QR code/ })).not.toBeInTheDocument();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Get a phone link" })); });
    expect(h.calls.find((c) => c.name === "uploads:createCase")!.args).toEqual({ personId: "sam", title: "New bill" });
    expect(screen.getByRole("img", { name: new RegExp(`QR code for .*/upload/${CASE}$`) })).toBeInTheDocument();
  });

  it("sends pasted text with its type and title", async () => {
    h.results["uploads:addPastedText"] = "doc_2";
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Paste text" }));
    fireEvent.change(screen.getByLabelText("Pasted text"), { target: { value: "Subject: RE: Q-PCL-0902 revised\nOcean is $2,150." } });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Add text" })); });
    expect(h.calls.find((c) => c.name === "uploads:addPastedText")!.args).toEqual({
      caseId: CASE, personId: "sam", text: "Subject: RE: Q-PCL-0902 revised\nOcean is $2,150.", docType: "email", title: "Email: RE: Q-PCL-0902 revised",
    });
  });
});

describe("QrCode", () => {
  it("draws an SVG labelled with its URL", () => {
    render(<QrCode url="https://cargoos.app/upload/abc123" />);
    const svg = screen.getByRole("img", { name: "QR code for https://cargoos.app/upload/abc123" });
    // Version 3: 29 modules plus a 4-module quiet zone on each side.
    expect(svg).toHaveAttribute("viewBox", "0 0 37 37");
    expect(svg.querySelector("path")?.getAttribute("d")).toMatch(/^M4 4h7v1h-7z/);
  });
});
