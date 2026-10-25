import { useEffect } from "react";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BillsProvider, useBills, type BillsValue } from "@/components/app/bills-provider";
import { SCENARIO_A } from "@/components/case/fixture";
import { setDevicePerson } from "@/components/shell/person";
import { HistoryTab } from "./history-tab";

const held: { api?: BillsValue } = {};
function Tab() {
  const v = useBills();
  useEffect(() => { held.api = v; });
  const bill = v.bill(SCENARIO_A.id);
  return bill ? <HistoryTab bill={bill} /> : null;
}
const bill = () => held.api!.bill(SCENARIO_A.id)!;

/** After the answer: Maya asks Sam to approve, tries to accept it herself (blocked), then Sam accepts. */
function story() {
  render(<BillsProvider><Tab /></BillsProvider>);
  act(() => bill().actions.reset("after"));
  act(() => setDevicePerson("maya"));
  let id = "";
  act(() => { id = bill().actions.draftDispute()!._id; });
  act(() => bill().actions.accept(id));
  act(() => setDevicePerson("sam"));
  act(() => bill().actions.accept(id));
}

const rows = () => within(screen.getByRole("list", { name: "History" })).getAllByRole("listitem");
const search = (q: string) => fireEvent.change(screen.getByLabelText("Search history"), { target: { value: q } });

describe("HistoryTab", () => {
  beforeEach(() => { localStorage.clear(); setDevicePerson("sam"); });
  afterEach(() => { cleanup(); localStorage.clear(); });

  it("lists every step newest first, under the header that says steps can't be edited", () => {
    story();
    expect(screen.getByText("Every step is saved and can't be edited")).toBeInTheDocument();
    const all = rows();
    expect(all[0]).toHaveTextContent("Approved the dispute. Nothing was sent.");
    expect(all[0]).toHaveTextContent("Sam · controller");
    expect(all[1]).toHaveTextContent("Approval blocked: only the controller can approve");
    expect(all[2]).toHaveTextContent("Asked for approval");
    expect(all[2]).toHaveTextContent("Maya · clerk");
    expect(all.at(-1)).toHaveTextContent("Added Quote Q-PCL-0902");
    expect(all.at(-1)).toHaveTextContent("CargoOS");
    // Times are in mono, newest first.
    const times = all.map((li) => li.querySelector("time")!.getAttribute("datetime")!);
    expect([...times].sort((a, b) => Date.parse(b) - Date.parse(a))).toEqual(times);
    expect(all[0].querySelector("time")).toHaveTextContent(/^\d{1,2}:\d{2} [AP]M$/);
  });

  it("a blocked approval reads in hold red, says it was blocked, and names who tried", () => {
    story();
    const blocked = rows().find((li) => li.hasAttribute("data-blocked"))!;
    expect(within(blocked).getByText(/Approval blocked/).closest("span")).toHaveClass("text-hold");
    expect(blocked).toHaveTextContent("Blocked: Approval blocked");
    expect(blocked).toHaveTextContent("Maya");
    expect(blocked).not.toHaveTextContent("Maya · controller");
    expect(rows().filter((li) => li.hasAttribute("data-blocked"))).toHaveLength(1);
  });

  it("shows the words that caused a step in italics, highlighted", () => {
    story();
    const answered = rows().find((li) => li.textContent?.includes("Answered the question"))!;
    const quote = answered.querySelector("q")!;
    expect(quote).toHaveClass("italic");
    expect(quote.querySelector("mark")).toBeInTheDocument();
  });

  it("search filters the steps: by line, by words in quotes, and says when nothing matches", () => {
    story();
    const total = rows().length;
    search("line 6");
    expect(rows().length).toBeLessThan(total);
    expect(rows().some((li) => li.textContent?.includes("Asked you about lines 4 and 6"))).toBe(true);
    expect(rows().some((li) => li.textContent?.includes("Added Quote Q-PCL-0902"))).toBe(false);
    search("rush handling");
    expect(rows().length).toBeGreaterThan(0);
    for (const li of rows()) expect(li.textContent?.toLowerCase()).toContain("rush handling");
    search("zzz-not-there");
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
    expect(screen.getByText("No step matches “zzz-not-there”.")).toBeInTheDocument();
    search("");
    expect(rows()).toHaveLength(total);
  });

  it("when nothing matches, says so and Clear search brings every step back", () => {
    story();
    const total = rows().length;
    search("zzz-not-there");
    expect(screen.getByText("No step matches “zzz-not-there”.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    expect(screen.getByLabelText("Search history")).toHaveValue("");
    expect(screen.getByLabelText("Search history")).toHaveFocus();
    expect(rows()).toHaveLength(total);
    expect(screen.queryByText(/No step matches/)).not.toBeInTheDocument();
  });

  it("groups steps under their day and puts an icon beside each sentence, never instead of it", () => {
    story();
    const first = rows()[0];
    expect(first).toHaveTextContent(/^Oct \d{1,2}/);
    // Only the first step of a day carries the day.
    expect(rows().filter((li) => /^[A-Z][a-z]{2} \d{1,2}/.test(li.textContent ?? ""))).toHaveLength(new Set(rows().map((li) => li.querySelector("time")!.title.split(",")[0])).size);
    for (const li of rows()) {
      const icon = li.querySelector("svg");
      expect(icon).toHaveAttribute("aria-hidden", "true");
      expect(icon?.nextElementSibling?.textContent?.length).toBeGreaterThan(0);
    }
  });

  it("an uploader sees only document steps, with no quotes", () => {
    story();
    act(() => setDevicePerson("leo"));
    expect(rows().length).toBeGreaterThan(0);
    for (const li of rows()) expect(li.textContent).toMatch(/^.*(Added|Read|Uploaded|Couldn't read)/);
    expect(screen.getByRole("list", { name: "History" }).querySelector("q")).toBeNull();
  });
});
