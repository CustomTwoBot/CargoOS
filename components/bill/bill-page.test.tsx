import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BillsProvider } from "@/components/app/bills-provider";
import { SCENARIO_A } from "@/components/case/fixture";
import { setDevicePerson } from "@/components/shell/person";
import { BillsPage } from "@/components/bills/bills-page";
import { BillPage } from "./bill-page";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/bills",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useParams: () => ({}),
}));

const ID = SCENARIO_A.id;
const hero = () => screen.getByRole("heading", { level: 1 });
const as = (id: string) => act(() => setDevicePerson(id));
const tick = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  setDevicePerson("sam");
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function renderBill() {
  return render(<BillsProvider><BillPage id={ID} /></BillsProvider>);
}

/** Sam answers CargoOS, confirms the reading, and the replay finishes rechecking. */
function answerAsSam() {
  fireEvent.click(screen.getByRole("button", { name: "Answer" }));
  expect(screen.getByText("Reading your answer…")).toBeInTheDocument();
  tick(1200);
  fireEvent.click(screen.getByRole("button", { name: "Yes, recheck the bill" }));
  tick(5000);
}

describe("bill page, Scenario A replay", () => {
  it("opens on what is safe to pay and the question for Sam", () => {
    renderBill();
    expect(hero()).toHaveTextContent("You can safely pay $6,600 of $7,500.");
    expect(screen.getByText(/CargoOS asks you · 2 lines/)).toBeInTheDocument();
    expect(screen.getByRole("region", { name: /To dispute/ })).toHaveTextContent("Ocean freight");
  });

  it("M3: shows how it read the answer before the recheck, then the lines move", () => {
    renderBill();
    fireEvent.click(screen.getByRole("button", { name: "Answer" }));
    tick(1200);
    expect(screen.getByText("Is this what you meant?")).toBeInTheDocument();
    const items = screen.getAllByRole("listitem").filter((li) => /Line [46] ·/.test(li.textContent ?? ""));
    expect(items[0]).toHaveTextContent("Agreed $200");
    expect(items[1]).toHaveTextContent("Not agreed");
    fireEvent.click(screen.getByRole("button", { name: "Yes, recheck the bill" }));
    tick(5000);
    expect(hero()).toHaveTextContent("You can safely pay $6,800 of $7,500.");
    expect(screen.getByRole("region", { name: /To dispute/ })).toHaveTextContent("Rush handling");
    expect(screen.getByText(/How CargoOS read your answer/)).toBeInTheDocument();
  });

  it("“No, let me rephrase” goes back to the answer box without rechecking", () => {
    renderBill();
    fireEvent.click(screen.getByRole("button", { name: "Answer" }));
    tick(1200);
    fireEvent.click(screen.getByRole("button", { name: "No, let me rephrase" }));
    expect(screen.getByRole("textbox", { name: "Your answer" })).toBeInTheDocument();
    expect(hero()).toHaveTextContent("$6,600");
  });

  it("Maya asks, Sam must give a reason to reject, and Maya sees it", () => {
    renderBill();
    answerAsSam();
    as("maya");
    fireEvent.click(screen.getByRole("button", { name: "Ask Sam to approve" }));
    expect(screen.getByText(/You asked Sam to approve a \$700 dispute/)).toBeInTheDocument();

    as("sam");
    expect(screen.getByText("Maya asks you to approve")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    fireEvent.click(screen.getByRole("button", { name: "Reject and send back" }));
    expect(screen.getByText("A reason is required to reject.")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: /Why are you rejecting it/ }), { target: { value: "They really did expedite it." } });
    fireEvent.click(screen.getByRole("button", { name: "Reject and send back" }));

    as("maya");
    expect(screen.getByText("Sam rejected the $700 dispute.")).toBeInTheDocument();
    expect(screen.getByText("“They really did expedite it.”")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ask Sam again" })).toBeInTheDocument();
  });

  it("Sam accepts Maya's request and is sent to write the letter", () => {
    renderBill();
    answerAsSam();
    as("maya");
    fireEvent.click(screen.getByRole("button", { name: "Ask Sam to approve" }));
    as("sam");
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    expect(screen.getByRole("link", { name: "Write to Pacific" })).toHaveAttribute("href", `/bills/${ID}/message`);
    const track = screen.getByRole("region", { name: "Who does what on this bill" });
    expect(within(track).getByText("Accepted")).toBeInTheDocument();
  });

  it("a line opens to its evidence and the bookkeeper's buttons", () => {
    as("maya");
    renderBill();
    fireEvent.click(screen.getByRole("button", { name: /Ocean freight/ }));
    expect(screen.getByRole("button", { name: "Keep in dispute" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Not an issue" })).toBeInTheDocument();
    expect(screen.getAllByText(/4,500/).length).toBeGreaterThan(0);
  });

  it("Leo sees documents only, no amounts", () => {
    as("leo");
    renderBill();
    expect(screen.queryByRole("heading", { level: 1 })).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Documents/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByRole("tab", { name: /History/ })).not.toBeInTheDocument();
    expect(screen.queryByText("$6,600")).not.toBeInTheDocument();
  });
});

describe("bills list", () => {
  it("greets the person, totals every bill and opens the one that needs them", () => {
    render(<BillsProvider><BillsPage /></BillsProvider>);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/Good (morning|afternoon|evening), Sam\./);
    expect(screen.getByText("Safe to pay").parentElement).toHaveTextContent("$");
    const link = screen.getAllByRole("link", { name: "Answer" })[0];
    expect(link).toHaveAttribute("href", `/bills/${ID}`);
  });

  it("Leo's list shows no money", () => {
    as("leo");
    render(<BillsProvider><BillsPage /></BillsProvider>);
    expect(screen.queryByText("Safe to pay")).not.toBeInTheDocument();
    expect(screen.queryByText(/\$\d/)).not.toBeInTheDocument();
  });
});
