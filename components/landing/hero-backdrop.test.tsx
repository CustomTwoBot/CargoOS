import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HeroBackdrop } from "./hero-backdrop";
import { Landing } from "./landing";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

// Paint on the next "frame" right away.
beforeEach(() => vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => { cb(0); return 1; }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const move = (clientX: number, clientY: number, pointerType = "mouse") =>
  act(() => { window.dispatchEvent(Object.assign(new MouseEvent("pointermove", { clientX, clientY }), { pointerType })); });

describe("landing background", () => {
  it("is decoration only: hidden from assistive tech, takes no clicks, fixed behind the page", () => {
    render(<HeroBackdrop />);
    const layer = screen.getByTestId("hero-backdrop");
    expect(layer).toHaveAttribute("aria-hidden", "true");
    expect(layer).toHaveClass("pointer-events-none", "fixed", "inset-0", "-z-10", "overflow-hidden");
  });

  it("the lime diamond follows the mouse, ignores touch, and fades when the mouse leaves", () => {
    render(<HeroBackdrop />);
    const glow = screen.getByTestId("grid-glow");
    expect(glow).toHaveClass("opacity-0");

    move(240, 180, "touch");
    expect(glow.style.getPropertyValue("--x")).toBe("");

    move(240, 180);
    expect(glow.style.getPropertyValue("--x")).toBe("240px");
    expect(glow.style.getPropertyValue("--y")).toBe("180px");
    expect(glow.style.opacity).toBe("1");

    act(() => { document.documentElement.dispatchEvent(new MouseEvent("pointerleave")); });
    expect(glow.style.opacity).toBe("0");
  });

  it("stays fixed behind the whole landing page as it scrolls", () => {
    render(<Landing />);
    const layer = screen.getByTestId("hero-backdrop");
    expect(layer.parentElement).toHaveClass("relative", "isolate");
    expect(layer.parentElement).toContainElement(screen.getByRole("contentinfo"));
  });
});
