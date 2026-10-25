import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BillsProvider } from "@/components/app/bills-provider";
import { SCENARIO_A } from "@/components/case/fixture";
import { setDevicePerson } from "@/components/shell/person";
import { BillsPage } from "./bills-page";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/bills",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useParams: () => ({}),
}));

const renderList = () => render(<BillsProvider><BillsPage /></BillsProvider>);

beforeEach(() => { localStorage.clear(); setDevicePerson("sam"); });
afterEach(cleanup);

describe("bills list polish", () => {
  it("totals land on the engine's numbers (no motion in tests) and each row says its status in words", () => {
    renderList();
    const totals = screen.getByRole("region", { name: "Across all bills" });
    expect(within(totals).getByText("Safe to pay").parentElement).toHaveTextContent(/\$\d/);
    const panel = screen.getByRole("tabpanel", { name: "To check" });
    const row = within(panel).getAllByRole("listitem")[0];
    expect(row).toHaveTextContent("Answer 1 question");
    expect(row).toHaveTextContent("4 documents");
    // Icons sit next to the words and are hidden from screen readers.
    row.querySelectorAll("svg").forEach((svg) => expect(svg).toHaveAttribute("aria-hidden", "true"));
    expect(within(row).getByRole("link", { name: "Answer" })).toHaveAttribute("href", `/bills/${SCENARIO_A.id}`);
  });

  it("an empty tab explains itself", () => {
    renderList();
    fireEvent.click(screen.getByRole("tab", { name: /Waiting/ }));
    expect(screen.getByRole("tab", { name: /Waiting/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveTextContent("Nobody else has anything open.");
    fireEvent.click(screen.getByRole("tab", { name: /Done/ }));
    expect(screen.getByRole("tabpanel")).toHaveTextContent("No finished bills yet.");
  });

  it("Leo sees document counts and Add documents, never money", () => {
    act(() => setDevicePerson("leo"));
    renderList();
    const panel = screen.getByRole("tabpanel", { name: "To check" });
    expect(within(panel).getAllByRole("listitem")[0]).toHaveTextContent("4 documents");
    expect(within(panel).getAllByRole("link", { name: /Add/ })[0]).toHaveTextContent("Add documents");
    expect(screen.queryByText(/\$\d/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Leo can add documents/)).not.toBeInTheDocument();
  });
});
