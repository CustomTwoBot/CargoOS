// The owner never asks themselves for approval: after the answer, Sam's bill page waits for Maya's request.
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BillsProvider } from "@/components/app/bills-provider";
import { SCENARIO_A } from "@/components/case/fixture";
import { setDevicePerson } from "@/components/shell/person";
import { BillPage } from "./bill-page";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/bills",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useParams: () => ({}),
}));

const tick = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });

beforeEach(() => { vi.useFakeTimers(); localStorage.clear(); setDevicePerson("sam"); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("the owner's screen once money is on hold", () => {
  it("shows no ask-yourself button, says Maya asks, and points one-screen demos to Settings", () => {
    render(<BillsProvider><BillPage id={SCENARIO_A.id} /></BillsProvider>);
    fireEvent.click(screen.getByRole("button", { name: "Answer" }));
    tick(1200);
    fireEvent.click(screen.getByRole("button", { name: "Yes, recheck the bill" }));
    tick(5000);

    expect(screen.queryByRole("button", { name: "Ask Sam to approve" })).not.toBeInTheDocument();
    expect(screen.getByText(/Maya reviews these lines and asks you to approve the dispute/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Using one screen? Set it to Maya in Settings to ask" })).toHaveAttribute("href", "/settings");
  });
});
