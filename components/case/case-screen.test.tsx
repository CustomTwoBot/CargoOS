import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CaseScreen } from "./case-screen";

const atStake = () => screen.getByTestId("at-stake").textContent;
const group = (g: string) => screen.getByTestId(`group-${g}`);

describe("CaseScreen (replay mode)", () => {
  afterEach(cleanup);

  it("revision 1: $300 at stake, 1 / 2 / 5, question waiting for the operator", () => {
    render(<CaseScreen />);
    expect(atStake()).toBe("$300");
    expect(screen.getByText("1 to dispute · 2 waiting on answers · 5 cleared")).toBeInTheDocument();
    expect(within(group("waiting")).getByText("2 lines")).toBeInTheDocument();
    expect(screen.getByText("CargoOS asked you")).toBeInTheDocument();
    expect(screen.getByText(/checked against Quote Q-PCL-0902, email, chat\./)).toBeInTheDocument();
    expect(screen.getByText("Checked before you pay.")).toBeInTheDocument();
  });

  it("has no role switcher", () => {
    render(<CaseScreen />);
    expect(screen.queryByText("Ops lead")).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: /role/i })).not.toBeInTheDocument();
  });

  it("Not an issue moves line 1 to Cleared, marked Dismissed by clerk, and lowers At stake", () => {
    render(<CaseScreen />);
    fireEvent.click(within(screen.getByTestId("row-1")).getByRole("button", { name: /Not an issue/ }));
    expect(atStake()).toBe("$0");
    expect(within(screen.getByTestId("row-1")).getByText("Dismissed by clerk")).toBeInTheDocument();
    expect(within(group("cleared")).getByText("6 lines")).toBeInTheDocument();
  });

  it("answering replays the recorded run: recheck, line 4 moves, line 6 moves, then What changed", () => {
    vi.useFakeTimers();
    render(<CaseScreen />);
    fireEvent.change(screen.getByLabelText("Your answer"), { target: { value: "approved congestion, not rush handling" } });
    fireEvent.click(screen.getByRole("button", { name: "Reply" }));
    expect(screen.getByText("Rechecking charges with your answer…")).toBeInTheDocument();
    expect(atStake()).toBe("$300");
    act(() => { vi.advanceTimersByTime(1600); });
    expect(screen.getByText("1 to dispute · 1 waiting on answers · 6 cleared")).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(2600); });
    vi.useRealTimers();
    expect(atStake()).toBe("$700");
    expect(screen.getByText("2 to dispute · 0 waiting on answers · 6 cleared")).toBeInTheDocument();
    expect(screen.getByText("What changed after your answer")).toBeInTheDocument();
    expect(screen.getByText("At stake $300 → $700. Waiting for answers $600 → $0.")).toBeInTheDocument();
  });

  it("one operator drafts and approves; nothing is sent", () => {
    render(<CaseScreen />);
    fireEvent.click(screen.getByRole("button", { name: "After answer" }));
    expect(screen.getByText("Replay")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Draft dispute" }));
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    expect(screen.getByText("Approved. Nothing was sent.")).toBeInTheDocument();
    expect(screen.queryByText("Requires controller")).not.toBeInTheDocument();
  });

  it("line 1's evidence chain opens the email with the quote highlighted", () => {
    render(<CaseScreen />);
    fireEvent.click(screen.getByTestId("row-1"));
    expect(screen.getByText("What the forwarder promised")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Ocean freight reduced to $4,500 if booked by Sep 10" }));
    expect(screen.getByRole("button", { name: "Back to evidence" })).toBeInTheDocument();
    expect(document.querySelector("mark")?.textContent).toBe("Ocean freight reduced to $4,500 if booked by Sep 10");
  });

  it("a screen holding only ops lead can answer but sees no dispute, verdict or approve controls", () => {
    render(<CaseScreen roles={["ops_lead"]} />);
    expect(screen.getByLabelText("Your answer")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Not an issue/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Agree/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Draft dispute" })).not.toBeInTheDocument();
  });
});
