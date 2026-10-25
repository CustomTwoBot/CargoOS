// /upload/[caseId]: the phone page. Replay adds are simulated; live adds go through convex/uploads.ts.
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { FunctionReference } from "convex/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SCENARIO_A } from "@/components/case/fixture";
import { PhoneUploadPage } from "./phone-upload";

const h = vi.hoisted(() => ({
  live: false,
  queries: {} as Record<string, unknown>,
  throwQuery: false,
  calls: [] as { name: string; args: unknown }[],
  results: {} as Record<string, unknown>,
}));

vi.mock("@/components/convex-provider", () => ({ useHasConvex: () => h.live }));
vi.mock("convex/react", async () => {
  const { getFunctionName } = await import("convex/server");
  return {
    useQuery: (ref: FunctionReference<"query">) => {
      if (h.throwQuery) throw new Error("ArgumentValidationError: Value does not match validator");
      return h.queries[getFunctionName(ref)];
    },
    useMutation: (ref: FunctionReference<"mutation">) => async (args: unknown) => {
      const name = getFunctionName(ref);
      h.calls.push({ name, args });
      return h.results[name];
    },
  };
});

const pick = async (label: string, file: File) => {
  await act(async () => { fireEvent.change(screen.getByLabelText(label), { target: { files: [file] } }); });
};
const added = () => within(screen.getByRole("list", { name: "You added" })).getAllByRole("listitem");
const pdf = (name: string) => new File(["%PDF-1.4"], name, { type: "application/pdf" });

beforeEach(() => { h.live = false; h.queries = {}; h.throwQuery = false; h.calls = []; h.results = {}; });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("Phone page: replay", () => {
  it("shows the three big buttons and nothing added yet", () => {
    render(<PhoneUploadPage caseId="demo" />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(`Add documents to ${SCENARIO_A.title}`);
    expect(screen.getByText("CargoOS · Bayline Home Goods")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "WhatsApp chat" })).toHaveAccessibleDescription("Chat → ⋯ → Export chat → Without media");
    expect(screen.getByRole("button", { name: "PDF" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Photo of a paper" })).toBeInTheDocument();
    expect(screen.getByLabelText("Photo of a paper", { selector: "input" })).toHaveAttribute("capture", "environment");
    expect(screen.getByText("Nothing yet.")).toBeInTheDocument();
    expect(screen.getByText("Demo: files aren't uploaded in this replay")).toBeInTheDocument();
  });

  it("asks what a PDF is, then adds it: Reading… then Added ✓", async () => {
    vi.useFakeTimers();
    render(<PhoneUploadPage caseId="demo" />);
    await pick("PDF file", pdf("Q-PCL-0902.pdf"));
    expect(screen.getByRole("group", { name: "What is this PDF?" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "WhatsApp chat" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Quote" }));
    expect(added()).toHaveLength(1);
    expect(added()[0]).toHaveTextContent("Quote PDF");
    expect(added()[0]).toHaveTextContent("Reading…");
    await act(async () => { vi.advanceTimersByTime(1500); });
    expect(added()[0]).toHaveTextContent("Added ✓");
    expect(screen.getByRole("button", { name: "WhatsApp chat" })).toBeInTheDocument();
    // Never an amount, finding or dispute.
    expect(document.body.textContent).not.toMatch(/\$|dispute|Hold|Pay\b/);
  });

  it("adds a WhatsApp export and a photo without asking", async () => {
    render(<PhoneUploadPage caseId="demo" />);
    await pick("WhatsApp chat export", new File(["10/12/26, 09:14 - Derek PCL: hi"], "WhatsApp Chat with Derek PCL.txt", { type: "text/plain" }));
    await pick("Photo of a paper", new File(["jpg"], "IMG_2041.jpg", { type: "image/jpeg" }));
    expect(added().map((r) => r.firstChild?.firstChild?.textContent)).toEqual(["WhatsApp chat", "Photo of a paper"]);
  });
});

describe("Phone page: live", () => {
  const CASE = "case_live_1";
  beforeEach(() => {
    h.live = true;
    h.results = { "uploads:generateUploadUrl": "https://upload.example/u1", "uploads:addDocument": "doc_9" };
  });

  it("says when the link doesn't match a bill", () => {
    h.queries["uploads:getUploadContext"] = null;
    render(<PhoneUploadPage caseId={CASE} />);
    expect(screen.getByRole("alert")).toHaveTextContent("This link doesn't match a bill. Ask for a new QR code.");
  });

  it("says the same for a malformed link", () => {
    h.throwQuery = true;
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(<PhoneUploadPage caseId="not-a-case" />);
    expect(screen.getByRole("alert")).toHaveTextContent("This link doesn't match a bill.");
    spy.mockRestore();
  });

  it("uploads a chat export into the case as the device's person and follows its reading", async () => {
    h.queries["uploads:getUploadContext"] = { title: "Bayline 40HC Ningbo-LB", documents: [] };
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ storageId: "st_9" })));
    vi.stubGlobal("fetch", fetchMock);
    const view = render(<PhoneUploadPage caseId={CASE} />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Add documents to Bayline 40HC Ningbo-LB");
    const file = new File(["10/12/26, 09:14 - Derek PCL: hi"], "WhatsApp Chat with Derek PCL.txt", { type: "text/plain" });
    await pick("WhatsApp chat export", file);
    expect(h.calls.map((c) => c.name)).toEqual(["uploads:generateUploadUrl", "uploads:addDocument"]);
    expect(fetchMock).toHaveBeenCalledWith("https://upload.example/u1", { method: "POST", headers: { "Content-Type": "text/plain" }, body: file });
    expect(h.calls[1].args).toEqual({ caseId: CASE, personId: "sam", storageId: "st_9", fileName: file.name, docType: "chat" });
    expect(added()[0]).toHaveTextContent("Reading…");

    h.queries["uploads:getUploadContext"] = { title: "Bayline 40HC Ningbo-LB", documents: [{ _id: "doc_9", title: file.name, type: "chat", readStatus: "read" }] };
    view.rerender(<PhoneUploadPage caseId={CASE} />);
    expect(added()[0]).toHaveTextContent("Added ✓");
  });

  it("sends an invoice PDF with the kind chosen", async () => {
    h.queries["uploads:getUploadContext"] = { title: "New bill", documents: [] };
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ storageId: "st_9" }))));
    render(<PhoneUploadPage caseId={CASE} />);
    await pick("PDF file", pdf("scan.pdf"));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Invoice" })); });
    expect(h.calls.find((c) => c.name === "uploads:addDocument")!.args).toMatchObject({ docType: "freight_invoice", fileName: "scan.pdf" });
  });
});
