// Settings when the live backend was never seeded: it says so and offers to set up the demo.
// Only useBills is stubbed here; settings-page.test.tsx covers the page under the real provider.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { personById } from "@/lib/people";
import type { BillsValue } from "@/components/app/bills-provider";
import { SettingsPage } from "./settings-page";

const h = vi.hoisted(() => ({ value: {} as Partial<BillsValue> }));
vi.mock("@/components/app/bills-provider", () => ({ useBills: () => h.value }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const demo = () => screen.getByRole("region", { name: "Demo data" });

function show(v: Partial<BillsValue>) {
  h.value = { person: personById("sam")!, toast: vi.fn(), resetAll: vi.fn(), ...v };
  render(<SettingsPage />);
}

afterEach(cleanup);

describe("demo data when live", () => {
  it("with no demo case: says so, and Set up the demo seeds it", () => {
    const setupDemo = vi.fn();
    show({ mode: "live", demoMissing: true, setupDemo });
    expect(demo()).toHaveTextContent("Live backend has no demo case yet");
    expect(demo()).not.toHaveTextContent("Live — connected to the backend");
    fireEvent.click(within(demo()).getByRole("button", { name: "Set up the demo" }));
    expect(setupDemo).toHaveBeenCalledTimes(1);
  });

  it("with the demo case: plain Live, no set-up button", () => {
    show({ mode: "live", demoMissing: false, setupDemo: vi.fn() });
    expect(demo()).toHaveTextContent("Live — connected to the backend");
    expect(within(demo()).queryByRole("button", { name: "Set up the demo" })).not.toBeInTheDocument();
    expect(demo()).toHaveTextContent("?replay=0 turns it off");
  });
});
