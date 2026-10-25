// The calmer, responsive case (docs/design.md §0.2): header, money strip, tabs and views, the
// one-column Overview, and the stacked issue tabs below 1024px.
import { useState } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SCENARIO_B } from "@/components/demo/scenario-b/scenario-b";
import type { CaseView } from "./case-tabs";
import { useCaseStore } from "./case-store";
import { CaseScreen } from "./case-screen";
import type { DemoCase } from "./demo-case";
import { SCENARIO_A } from "./fixture";
import { ISSUE_GRID } from "./issue-views";
import { ALL_ROLES } from "./roles";
import { chipOf } from "./row-chip";
import { toRows } from "./view-model";
import { CaseWorkspace } from "./workspace";

const figures = () => screen.getByTestId("money-figures").textContent;
const list = () => screen.getByRole("region", { name: "To decide" });
const headings = () => within(list()).getAllByRole("heading").map((h) => h.textContent);
const rowTexts = () => [...list().querySelectorAll("button")].map((b) => b.textContent);

/** CaseWorkspace on its own, with the shell's `onView` and `view` under the test's control. */
function Workspace({ demo, view, onView }: { demo: DemoCase; view: CaseView; onView: (v: CaseView) => void }) {
  const store = useCaseStore([demo], () => {});
  const [tab, setTab] = useState("overview");
  const x = store.inputs[demo.id];
  return (
    <CaseWorkspace demo={demo} x={x} local={store.state[demo.id]} actions={store.actionsFor(demo)} roles={ALL_ROLES}
      view={view} onView={onView} now={null} tab={tab} onTab={setTab} inbox={{ demo, x, forwarder: "Pacific Crest Logistics" }} />
  );
}

afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("case header", () => {
  it("is one title with one status pill, the invoice line, and Draft dispute plus a menu", () => {
    render(<CaseScreen cases={[SCENARIO_A]} />);
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(within(h1).getAllByTestId("case-pill")).toHaveLength(1);
    expect(within(h1).getByTestId("case-pill")).toHaveTextContent("Waiting for your answer");
    expect(screen.getByTestId("case-facts")).toHaveTextContent(
      "Invoice PCL-INV-1012 · Pacific Crest Logistics · Replay · Synthetic data. Nothing is sent or paid automatically.");
    expect(screen.queryByText(/checked against/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Draft dispute" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add evidence" })).not.toBeInTheDocument();
  });

  it("keeps Add evidence and the theme in the ⋯ menu; Add evidence opens its panel", async () => {
    render(<CaseScreen cases={[SCENARIO_A]} />);
    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    const item = await screen.findByRole("menuitem", { name: "Add evidence" });
    expect(screen.getByRole("menuitemradio", { name: "Light" })).toHaveAttribute("aria-checked", "true");
    fireEvent.click(item);
    expect(await screen.findByRole("complementary", { name: "Add evidence" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("complementary", { name: "Add evidence" })).not.toBeInTheDocument();
  });

  it("switches the theme from the menu", async () => {
    render(<CaseScreen cases={[SCENARIO_A]} />);
    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    fireEvent.click(await screen.findByRole("menuitemradio", { name: "Dark" }));
    expect(document.documentElement).toHaveClass("dark");
    expect(localStorage.getItem("cargoos.theme")).toBe("dark");
    document.documentElement.classList.remove("dark");
  });

  it("hides Add evidence from a screen that only answers", async () => {
    render(<CaseScreen cases={[SCENARIO_A]} roles={["ops_lead"]} />);
    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    await screen.findByRole("menuitemradio", { name: "Dark" });
    expect(screen.queryByRole("menuitem", { name: "Add evidence" })).not.toBeInTheDocument();
  });
});

describe("money strip", () => {
  it("Scenario A before and after the answer: one line of figures, the recheck label while rechecking", () => {
    vi.useFakeTimers();
    render(<CaseScreen cases={[SCENARIO_A]} />);
    expect(screen.getByTestId("at-stake")).toHaveTextContent("$300");
    expect(figures()).toBe("Matches $6,600 · At stake $300 · Waiting $600 · Invoice $7,500");
    expect(screen.getByRole("button", { name: "What is At stake?" })).toBeInTheDocument();
    expect(screen.queryByText("Checked before you pay.")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: /Your answer/ }));
    fireEvent.change(screen.getByLabelText("Your answer"), { target: { value: "approved congestion, not rush handling" } });
    fireEvent.click(screen.getByRole("button", { name: "Reply" }));
    act(() => { vi.advanceTimersByTime(0); });
    expect(figures()).toBe("Rechecking 8 charges with your answer…");
    act(() => { vi.advanceTimersByTime(5000); });
    expect(screen.getByTestId("at-stake")).toHaveTextContent("$700");
    expect(figures()).toBe("Matches $6,800 · At stake $700 · Waiting $0 · Invoice $7,500");
  });

  it("Scenario B: leaves the CNY line out of the USD figures and says so", () => {
    render(<CaseScreen cases={[SCENARIO_B]} />);
    expect(screen.getByTestId("at-stake")).toHaveTextContent("$3,340");
    expect(figures()).toBe("Matches $16,470 · At stake $3,340 · Waiting $7,515 · Invoice $27,325 · CNY 4,200 not converted");
  });

  it("stays above Documents and History", () => {
    render(<CaseScreen cases={[SCENARIO_A]} />);
    fireEvent.click(screen.getByRole("tab", { name: "Documents" }));
    expect(screen.getByTestId("at-stake")).toHaveTextContent("$300");
    fireEvent.click(screen.getByRole("tab", { name: "History" }));
    expect(screen.getByRole("region", { name: "Case totals" })).toBeInTheDocument();
  });
});

describe("tabs and views", () => {
  it("Documents and History tabs call onView, and an issue tab goes back to the case", () => {
    const onView = vi.fn();
    const { rerender } = render(<Workspace demo={SCENARIO_A} view="case" onView={onView} />);
    fireEvent.click(screen.getByRole("tab", { name: "Documents" }));
    expect(onView).toHaveBeenLastCalledWith("documents");
    fireEvent.click(screen.getByRole("tab", { name: "History" }));
    expect(onView).toHaveBeenLastCalledWith("history");
    rerender(<Workspace demo={SCENARIO_A} view="history" onView={onView} />);
    expect(screen.getByRole("tab", { name: "History" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Overview" })).toHaveAttribute("aria-selected", "false");
    expect(screen.getByRole("table", { name: "Events" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: /Ocean freight/ }));
    expect(onView).toHaveBeenLastCalledWith("case");
  });

  it("Documents shows what the invoice was checked against, under the same header", () => {
    render(<Workspace demo={SCENARIO_A} view="documents" onView={() => {}} />);
    expect(screen.getByText("Invoice PCL-INV-1012, checked against Quote Q-PCL-0902, email, chat.")).toBeInTheDocument();
    expect(within(screen.getByRole("list", { name: "Documents" })).getByText("Invoice PCL-INV-1012")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Bayline 40HC Ningbo-LB");
  });

  it("scrolls the tab strip sideways instead of wrapping", () => {
    render(<CaseScreen cases={[SCENARIO_B]} />);
    expect(screen.getByRole("tablist", { name: "Case tabs" })).toHaveClass("overflow-x-auto");
  });
});

describe("Overview, one column", () => {
  it("Scenario A: sections with status and subtotal, one chip per row, no status words in rows", () => {
    render(<CaseScreen cases={[SCENARIO_A]} />);
    expect(headings()).toEqual(["To dispute · 1 · +$300", "Questions for you · 1"]);
    expect(rowTexts()).toEqual([
      "Ocean freight 40HC Ningbo-Long BeachAgreed $4,500 → Billed $4,800+$300›",
      "2 charges need your answer$600Answer",
      "Cleared · 5 · $2,100⌄",
    ]);
    expect(screen.queryByRole("region", { name: "What was agreed" })).not.toBeInTheDocument();
    for (const word of ["To dispute", "Waiting on answers", "Cleared"]) {
      expect(rowTexts().slice(0, 2).some((t) => t?.includes(word))).toBe(false);
    }
  });

  it("Scenario A after the answer: the change strip, then the new dispute row", async () => {
    render(<CaseScreen cases={[SCENARIO_A]} />);
    fireEvent.click(screen.getByRole("button", { name: "After answers" }));
    await waitFor(() => expect(headings()).toEqual(["To dispute · 2 · +$700"]));
    expect(rowTexts()).toContain("Rush handlingNewNo agreement+$400›");
    expect(rowTexts().at(-1)).toBe("Cleared · 6 · $2,300⌄");
    expect(screen.getByText("Your answer changed 2 charges")).toBeInTheDocument();
  });

  it("Scenario B: four sections, chips for the duplicate, the cap, the conflict and the CNY line", () => {
    render(<CaseScreen cases={[SCENARIO_B]} />);
    expect(headings()).toEqual(["To dispute · 4 · +$3,340", "Questions for you · 2", "Waiting · 1"]);
    expect(rowTexts()).toEqual([
      "Ocean freight 3x40HC Shanghai-OaklandAgreed $11,100 → Billed $12,300+$1,200›",
      "Low sulphur surcharge (LSS)Cap $450 → Billed $600+$150›",
      "Customs entryAgreed $185 → Billed $225+$40›",
      "Destination THC OaklandBilled twice+$1,950›",
      "Question 1: 4 charges need your answer$1,665Answer",
      "Question 2: 1 charge needs your answerSources disagree$5,850Answer",
      "Origin trucking Kunshan-Shanghai portNo agreed rateCNY 4,200›",
      "Cleared · 5 · $4,735⌄",
    ]);
  });

  it("folds Cleared into one row that opens every invoice line", () => {
    render(<CaseScreen cases={[SCENARIO_A]} />);
    const cleared = within(list()).getByRole("button", { name: /^Cleared/ });
    expect(cleared).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(cleared);
    expect(screen.getByText(/^All 8 invoice lines\./)).toBeInTheDocument();
  });

  it("a question row opens its tab", () => {
    render(<CaseScreen cases={[SCENARIO_A]} />);
    fireEvent.click(within(list()).getByRole("button", { name: /2 charges need your answer/ }));
    expect(screen.getByLabelText("Your answer")).toBeInTheDocument();
  });
});

describe("row chip", () => {
  it("names the numbers or the kind of problem", () => {
    const after = SCENARIO_B.at(SCENARIO_B.end);
    const chip = (line: number) => chipOf(toRows(after).find((r) => r.lineNo === line)!);
    expect(chip(13)).toBe("Approved $300 → Billed $450");
    expect(chip(14)).toBe("No agreement");
    expect(chip(4)).toBe("Allowed by the quote");
  });
});

describe("below 1024px", () => {
  it("the line and question tabs stack (evidence or question first) and go two-column from lg", () => {
    expect(ISSUE_GRID.split(" ")).toEqual(expect.arrayContaining(["grid-cols-1", "lg:grid-cols-[minmax(0,1fr)_360px]"]));
    render(<CaseScreen cases={[SCENARIO_A]} />);
    fireEvent.click(screen.getByRole("tab", { name: /Ocean freight/ }));
    let grid = screen.getByTestId("issue-grid");
    expect(grid).toHaveClass("grid-cols-1");
    expect([...grid.children].map((c) => c.getAttribute("aria-label"))).toEqual(["Evidence", "Decision"]);
    fireEvent.click(screen.getByRole("tab", { name: /Your answer/ }));
    grid = screen.getByTestId("issue-grid");
    expect([...grid.children].map((c) => c.getAttribute("aria-label"))).toEqual(["Question", "What it's about"]);
  });

  it("the dispute tab stacks the message above the decision", () => {
    render(<CaseScreen cases={[SCENARIO_A]} />);
    fireEvent.click(screen.getByRole("button", { name: "After answers" }));
    fireEvent.click(screen.getByRole("button", { name: "Draft dispute" }));
    const stack = screen.getByTestId("dispute-stack");
    expect(stack).toHaveClass("max-lg:[&>div>.grid]:grid-cols-1");
    const grid = stack.querySelector(":scope > div > .grid")!;
    expect(grid.lastElementChild).toHaveAttribute("aria-label", "Decision");
  });
});
