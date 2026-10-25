import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_WORKSPACE, readSetup, saveSetup } from "@/components/app/setup";
import { StartScreen } from "./start-screen";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }) }));

beforeEach(() => { localStorage.clear(); push.mockClear(); });
afterEach(cleanup);

describe("/start: set up this screen", () => {
  it("defaults to Sam and the demo workspace, with what each person can and can't do", () => {
    render(<StartScreen />);
    expect(screen.getByRole("heading", { level: 1, name: "Set up this screen" })).toBeInTheDocument();
    expect(screen.getByText(/No account needed\. This demo workspace has three people/)).toBeInTheDocument();
    expect(screen.getByLabelText("Workspace name")).toHaveValue(DEFAULT_WORKSPACE);
    const group = screen.getByRole("group", { name: "Who uses this screen" });
    expect(group).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Sam · Owner" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Maya · Bookkeeper" })).not.toBeChecked();
    expect(screen.getByRole("radio", { name: "Leo · Uploader" })).toHaveAccessibleDescription(/Doesn't see amounts, findings or disputes/);
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "← Back" })).toHaveAttribute("href", "/");
  });

  it("Continue saves the workspace and the person, then opens the bills", () => {
    render(<StartScreen />);
    fireEvent.change(screen.getByLabelText("Workspace name"), { target: { value: "Harbor Goods" } });
    fireEvent.click(screen.getByRole("radio", { name: "Maya · Bookkeeper" }));
    expect(screen.getByRole("radio", { name: "Maya · Bookkeeper" })).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(readSetup()?.workspace).toBe("Harbor Goods");
    expect(localStorage.getItem("cargoos.person")).toBe("maya");
    expect(push).toHaveBeenCalledWith("/bills");
  });

  it("starts on the person the screen is already set to, so Continue keeps them", () => {
    saveSetup("maya", "Harbor Goods");
    render(<StartScreen />);
    expect(screen.getByRole("radio", { name: "Maya · Bookkeeper" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Sam · Owner" })).not.toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(localStorage.getItem("cargoos.person")).toBe("maya");
  });

  it("says who the screen is already set to and offers to continue as them", () => {
    saveSetup("leo", "Harbor Goods");
    render(<StartScreen />);
    expect(screen.getByRole("note")).toHaveTextContent("This screen is set to Leo · Uploader.");
    expect(screen.getByRole("link", { name: "Continue as Leo" })).toHaveAttribute("href", "/bills");
  });
});
