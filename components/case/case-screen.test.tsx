import { Profiler } from "react";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setDevicePerson } from "@/components/shell/person";
import { CaseScreen } from "./case-screen";
import { SCENARIO_A } from "./fixture";

// The amount counts up to its new value; its label is the value it lands on.
const atStake = () => screen.getByTestId("at-stake").getAttribute("aria-label");

// The demo journey on the new layout (docs/design.md §0.4): invoice on the left, CargoOS on the right.
describe("CaseScreen: the demo journey", () => {
  afterEach(() => { cleanup(); vi.useRealTimers(); act(() => setDevicePerson("sam")); });

  const thread = () => screen.getByRole("complementary", { name: "CargoOS" });
  const answer = (text: string) => {
    fireEvent.change(within(thread()).getByLabelText("Your answer"), { target: { value: text } });
    fireEvent.click(within(thread()).getByRole("button", { name: "Send answer" }));
  };
  /** Sam answers and the recorded recheck plays out. */
  const answered = () => {
    vi.useFakeTimers();
    render(<CaseScreen cases={[SCENARIO_A]} />);
    answer("approved the $200 congestion fee on WhatsApp, nobody agreed to $400 rush handling");
    act(() => { vi.advanceTimersByTime(6000); });
  };

  it("opens on the verdict, the marked-up invoice and Sam's question", () => {
    render(<CaseScreen cases={[SCENARIO_A]} />);
    expect(atStake()).toBe("$300");
    expect(screen.getByTestId("verdict-sentence")).toHaveTextContent("$300 is more than agreed, and $600 waits for your answer.");
    const lines = screen.getByRole("region", { name: "Invoice lines" });
    expect(within(lines).getByText("$300 over")).toBeInTheDocument();
    expect(within(lines).getAllByText("Asked you")).toHaveLength(2);
    expect(within(thread()).getByText("Question for you")).toBeInTheDocument();
    expect(within(thread()).getByLabelText("Your answer")).toBeInTheDocument();
  });

  it("Sam's answer rechecks the case: $700, was $300, and the thread says what changed", () => {
    answered();
    expect(atStake()).toBe("$700");
    expect(screen.getByTestId("was")).toHaveTextContent("was $300");
    expect(within(thread()).getByText(/Your answer changed 2 charges/)).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Invoice lines" })).getByText("$400 over")).toBeInTheDocument();
  });

  it("Maya asks Sam to approve; Sam accepts and the message to the seller opens, nothing sent", () => {
    answered();
    act(() => setDevicePerson("maya"));
    fireEvent.click(within(thread()).getByRole("button", { name: "Ask Sam to approve" }));
    expect(screen.getByText("Approval requested from Sam. Nothing was sent.")).toBeInTheDocument();
    expect(within(thread()).queryByRole("button", { name: "Accept" })).not.toBeInTheDocument();

    act(() => setDevicePerson("sam"));
    fireEvent.click(within(thread()).getByRole("button", { name: "Accept" }));
    fireEvent.click(within(thread()).getByRole("button", { name: "Open the message" }));
    const msg = screen.getByRole("region", { name: "Message to the seller" });
    expect(within(msg).getByText("CargoOS never sends this. You send it yourself.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^send$/i })).not.toBeInTheDocument();
  });

  it("Sam can't reject without a reason, and a rejection goes back to Maya with it", () => {
    answered();
    act(() => setDevicePerson("maya"));
    fireEvent.click(within(thread()).getByRole("button", { name: "Ask Sam to approve" }));
    act(() => setDevicePerson("sam"));
    fireEvent.click(within(thread()).getByRole("button", { name: "Reject" }));
    const form = within(thread()).getByRole("form", { name: "Reject the dispute" });
    fireEvent.click(within(form).getByRole("button", { name: "Reject" }));
    expect(within(thread()).getByRole("form", { name: "Reject the dispute" })).toBeInTheDocument();
    fireEvent.change(within(form).getByLabelText("Why are you rejecting it?"), { target: { value: "They really did expedite it. Pay it this time." } });
    fireEvent.click(within(form).getByRole("button", { name: "Reject" }));
    act(() => setDevicePerson("maya"));
    expect(within(thread()).getAllByText(/They really did expedite it\. Pay it this time\./).length).toBeGreaterThan(0);
  });

  it("Not an issue clears line 1 and lowers At stake", () => {
    render(<CaseScreen cases={[SCENARIO_A]} />);
    fireEvent.click(within(screen.getByRole("region", { name: "Invoice lines" })).getByText(/^Ocean freight 40HC/));
    fireEvent.click(screen.getByRole("button", { name: "Not an issue" }));
    expect(atStake()).toBe("$0");
  });
});

describe("sidebar", () => {
  afterEach(cleanup);

  it("names the case by forwarder and invoice, with its status word, and collapses to the icon rail", () => {
    localStorage.removeItem("cargoos.sidebar");
    render(<CaseScreen cases={[SCENARIO_A]} />);
    const nav = screen.getByRole("navigation", { name: "Sections" });
    expect(within(nav).getByText("Pacific Crest · PCL-INV-1012")).toBeInTheDocument();
    expect(within(nav).getByText("Answer 1 question")).toBeInTheDocument();
    fireEvent.click(within(nav).getByRole("button", { name: "Collapse sidebar" }));
    expect(screen.getByRole("button", { name: "Expand sidebar" })).toBeInTheDocument();
    expect(localStorage.getItem("cargoos.sidebar")).toBe("collapsed");
    fireEvent.click(screen.getByRole("button", { name: "Expand sidebar" }));
    expect(screen.getByRole("button", { name: "Collapse sidebar" })).toBeInTheDocument();
  });
});

describe("several cases", () => {
  afterEach(cleanup);

  it("settles after mounting two cases instead of re-rendering forever", async () => {
    let renders = 0;
    render(<Profiler id="app" onRender={() => { renders++; }}><CaseScreen /></Profiler>);
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    const settled = renders;
    await act(async () => { await new Promise((r) => setTimeout(r, 100)); });
    expect(renders).toBe(settled);
    expect(screen.getAllByText("Kestrel Bay · KBL-INV-2291").length).toBeGreaterThan(0);
  });
});
