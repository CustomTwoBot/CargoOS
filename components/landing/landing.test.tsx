import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { saveSetup } from "@/components/app/setup";
import { Landing } from "./landing";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }) }));

beforeEach(() => { localStorage.clear(); push.mockClear(); });
afterEach(cleanup);

describe("landing page", () => {
  it("says what CargoOS does and shows Scenario A's safe-to-pay preview", () => {
    render(<Landing />);
    expect(screen.getByRole("heading", { level: 1, name: "Checked before you pay." })).toBeInTheDocument();
    expect(screen.getByText(/asks when it can’t tell, and tells you how much is safe to pay/)).toBeInTheDocument();
    const preview = screen.getByRole("figure");
    expect(preview).toHaveTextContent("You can safely pay $6,600 of $7,500.");
    expect(within(preview).getByRole("img", { name: "Pay $6,600, hold $300, ask $600" })).toBeInTheDocument();
    expect(preview).toHaveTextContent("Ocean freight");
    expect(preview).toHaveTextContent("agreed $4,500 → billed $4,800");
    expect(preview).toHaveTextContent("+$300");
    expect(preview).toHaveTextContent("Port congestion fee");
    expect(preview).toHaveTextContent("mentioned, no amount");
  });

  it("explains how it works in three steps and who uses it", () => {
    render(<Landing />);
    const how = screen.getByRole("region", { name: "Three steps, one number." });
    expect(how).toHaveAttribute("id", "how");
    expect(within(how).getAllByRole("listitem")).toHaveLength(3);
    expect(how).toHaveTextContent("Nothing is sent or paid.");
    const who = screen.getByRole("region", { name: "One workspace, three screens." });
    expect(within(who).getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      expect.stringContaining("Maya · Bookkeeper"), expect.stringContaining("Sam · Owner"), expect.stringContaining("Leo · Uploader"),
    ]);
    expect(screen.getByText("Synthetic data. Nothing is sent or paid automatically.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "See how it works" })).toHaveAttribute("href", "#how");
  });

  it("Get started sets up a new screen on /start", () => {
    render(<Landing />);
    fireEvent.click(screen.getAllByRole("button", { name: "Get started" })[0]);
    expect(push).toHaveBeenCalledWith("/start");
  });

  it("Get started and Open the demo go straight to the bills once the screen is set up", () => {
    saveSetup("maya", "Bayline Home Goods");
    render(<Landing />);
    fireEvent.click(screen.getAllByRole("button", { name: "Get started" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Open the demo" }));
    expect(push).toHaveBeenNthCalledWith(1, "/bills");
    expect(push).toHaveBeenNthCalledWith(2, "/bills");
  });
});
