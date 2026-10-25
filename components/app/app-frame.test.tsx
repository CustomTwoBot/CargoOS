import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { personById } from "@/lib/people";
import { AppFrame } from "./app-frame";

vi.mock("./bills-provider", () => ({ useBills: () => ({ person: personById("maya")!, mode: "live" }) }));
vi.mock("next/navigation", () => ({ usePathname: () => "/bills" }));

afterEach(cleanup);

describe("app frame", () => {
  it("the logo goes to the landing page and shows a focus ring", () => {
    render(<AppFrame><p>content</p></AppFrame>);
    const home = screen.getByRole("link", { name: "CargoOS home" });
    expect(home).toHaveAttribute("href", "/");
    expect(home.className).toMatch(/focus-visible:outline/);
  });
});
