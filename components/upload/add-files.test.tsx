// Adding files to an existing bill from this computer (Documents tab): Leo can, a replay adds text files as
// evidence and lists the rest, and live files go through the same upload calls as /bills/new.
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { FunctionReference } from "convex/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BillsProvider, useBills, type Bill } from "@/components/app/bills-provider";
import { SCENARIO_A } from "@/components/case/fixture";
import { setDevicePerson } from "@/components/shell/person";
import { DocumentsTab } from "@/components/bill/documents-tab";
import { AddFiles } from "./add-files";

const h = vi.hoisted(() => ({ calls: [] as { name: string; args: unknown }[], results: {} as Record<string, unknown> }));
vi.mock("convex/react", async () => {
  const { getFunctionName } = await import("convex/server");
  return {
    useQuery: () => undefined,
    useMutation: (ref: FunctionReference<"mutation">) => async (args: unknown) => {
      const name = getFunctionName(ref);
      h.calls.push({ name, args });
      return h.results[name];
    },
  };
});
// No Convex provider: CI sets NEXT_PUBLIC_CONVEX_URL, and the real provider would need the real convex/react.
vi.mock("@/components/convex-provider", () => ({ useHasConvex: () => false }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(), usePathname: () => "/bills", useRouter: () => ({ push: vi.fn() }) }));

const CHAT = "9/28/26, 10:02 AM - Derek PCL: heads up, possible congestion at LB terminal, may be extra";
const choose = async (files: File[]) => {
  await act(async () => { fireEvent.change(screen.getByLabelText("Files to add to this bill"), { target: { files } }); });
};
const rows = () => within(screen.getByRole("list", { name: "Added documents" })).getAllByRole("listitem");

/** Renders `ui(bill)` with Scenario A's bill from the provider. */
function WithBill({ ui }: { ui: (b: Bill) => React.ReactNode }) {
  const b = useBills().bill(SCENARIO_A.id)!;
  return <>{ui(b)}</>;
}

beforeEach(() => { h.calls = []; h.results = {}; localStorage.clear(); setDevicePerson("leo"); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("Add files from this computer", () => {
  it("Leo sees it on the Documents tab, next to Add from a phone", () => {
    render(<BillsProvider><WithBill ui={(b) => <DocumentsTab bill={b} />} /></BillsProvider>);
    expect(screen.getByRole("heading", { name: "Add files from this computer" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Choose files" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Add from a phone" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Paste evidence" })).not.toBeInTheDocument();
  });

  it("replay: a chat export is added to the bill; a PDF is listed but not read", async () => {
    let docs = 0;
    render(<BillsProvider><WithBill ui={(b) => { docs = b.x.documents.length; return <AddFiles bill={b} />; }} /></BillsProvider>);
    const before = docs;
    await choose([new File([CHAT], "WhatsApp Chat with Derek PCL.txt", { type: "text/plain" }), new File(["%PDF-1.4"], "BL-7730.pdf", { type: "application/pdf" })]);
    expect(docs).toBe(before + 1);
    expect(rows()[0]).toHaveTextContent("Read");
    expect(rows()[1]).toHaveTextContent("Not read");
    expect(screen.getByText(/PDFs and photos are listed but not read/)).toBeInTheDocument();
  });

  it("drag-over turns the card into a drop target", () => {
    render(<BillsProvider><WithBill ui={(b) => <AddFiles bill={b} />} /></BillsProvider>);
    const card = screen.getByRole("region", { name: "Add files from this computer" });
    fireEvent.dragEnter(card, { dataTransfer: { types: ["Files"], files: [] } });
    expect(card).toHaveAttribute("data-over");
    expect(screen.getByRole("heading", { name: "Drop to add to this bill" })).toBeInTheDocument();
  });

  it("live: a file goes up into this bill's case as Leo", async () => {
    h.results = { "uploads:generateUploadUrl": "https://upload.test/1", "uploads:addDocument": "doc_new" };
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ storageId: "st_1" }), { status: 200 })));
    render(<BillsProvider><WithBill ui={(b) => <AddFiles bill={{ ...b, live: true }} />} /></BillsProvider>);
    await choose([new File(["%PDF-1.4"], "Q-PCL-0902.pdf", { type: "application/pdf" })]);
    const add = h.calls.find((c) => c.name === "uploads:addDocument");
    expect(add?.args).toEqual({ caseId: SCENARIO_A.at("before").case._id, personId: "leo", storageId: "st_1", fileName: "Q-PCL-0902.pdf", docType: "quote" });
    expect(rows()[0]).toHaveTextContent("Reading");
  });
});
