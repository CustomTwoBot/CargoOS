import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BillsProvider } from "@/components/app/bills-provider";
import { setDevicePerson } from "@/components/shell/person";
import { BillsPage } from "./bills-page";

vi.mock("next/navigation", () => ({ usePathname: () => "/bills", useRouter: () => ({ push: vi.fn() }) }));

const box = () => screen.getByRole("searchbox", { name: "Search bills" });
const type = (text: string) => fireEvent.change(box(), { target: { value: text } });
const tabs = () => within(screen.getByRole("tablist", { name: "Bills" })).getAllByRole("tab");
const panel = () => screen.getByRole("tabpanel");

/** Every bill the list shows, across all three tabs, by forwarder. */
function shownForwarders(): string[] {
  const out: string[] = [];
  for (const t of tabs()) {
    fireEvent.click(t);
    for (const li of within(panel()).queryAllByRole("listitem")) {
      out.push(li.textContent?.includes("Kestrel Bay") ? "Kestrel Bay Logistics" : li.textContent?.includes("Pacific Crest") ? "Pacific Crest Logistics" : "?");
    }
  }
  return out.sort();
}
const total = () => tabs().reduce((n, t) => n + Number(/(\d+)$/.exec(t.textContent ?? "")?.[1] ?? 0), 0);

beforeEach(() => { localStorage.clear(); setDevicePerson("sam"); });
afterEach(cleanup);

describe("bills list search", () => {
  it("filters by forwarder; the tab counts follow", () => {
    render(<BillsProvider><BillsPage /></BillsProvider>);
    expect(shownForwarders()).toEqual(["Kestrel Bay Logistics", "Pacific Crest Logistics"]);
    type("kestrel");
    expect(shownForwarders()).toEqual(["Kestrel Bay Logistics"]);
    expect(total()).toBe(1);
  });

  it("matches the invoice ref too, ignoring case", () => {
    render(<BillsProvider><BillsPage /></BillsProvider>);
    type("pcl-inv-1012");
    expect(shownForwarders()).toEqual(["Pacific Crest Logistics"]);
  });

  it("says when nothing matches, and Clear search, the ×, or Escape bring the list back", () => {
    render(<BillsProvider><BillsPage /></BillsProvider>);
    type("zzz");
    expect(total()).toBe(0);
    expect(within(panel()).getByText("No bills match “zzz”")).toBeInTheDocument();
    fireEvent.click(within(panel()).getByRole("button", { name: "Clear search" }));
    expect(box()).toHaveValue("");
    expect(total()).toBe(2);

    type("zzz");
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(total()).toBe(2);

    type("zzz");
    fireEvent.keyDown(box(), { key: "Escape" });
    expect(box()).toHaveValue("");
    expect(total()).toBe(2);
  });

  it("is on Leo's screen too, and still shows no amounts", () => {
    setDevicePerson("leo");
    render(<BillsProvider><BillsPage /></BillsProvider>);
    type("kestrel");
    expect(shownForwarders()).toEqual(["Kestrel Bay Logistics"]);
    expect(screen.queryByText(/\$\d/)).not.toBeInTheDocument();
  });
});
