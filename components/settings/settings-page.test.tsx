import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BillsProvider } from "@/components/app/bills-provider";
import { readSetup, saveSetup } from "@/components/app/setup";
import { SettingsPage } from "./settings-page";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }), usePathname: () => "/settings" }));

const renderSettings = () => render(<BillsProvider><SettingsPage /></BillsProvider>);
const section = (name: string) => screen.getByRole("region", { name });

beforeEach(() => { localStorage.clear(); push.mockClear(); document.documentElement.classList.remove("dark"); });
afterEach(() => { cleanup(); document.documentElement.classList.remove("dark"); });

describe("settings", () => {
  it("changes the person this screen is set to and says so", () => {
    renderSettings();
    expect(screen.getByText("This screen is set to Sam · Owner.")).toBeInTheDocument();
    const device = section("This device");
    expect(within(device).getByRole("radio", { name: "Sam · Owner" })).toBeChecked();
    fireEvent.click(within(device).getByRole("radio", { name: "Maya · Bookkeeper" }));
    expect(localStorage.getItem("cargoos.person")).toBe("maya");
    expect(within(device).getByRole("radio", { name: "Maya · Bookkeeper" })).toBeChecked();
    expect(screen.getByText("This screen is now set to Maya · Bookkeeper")).toBeInTheDocument();
    expect(screen.getByText("This screen is set to Maya · Bookkeeper.")).toBeInTheDocument();
  });

  it("switches the theme and remembers it", () => {
    renderSettings();
    const look = section("Appearance");
    expect(within(look).getByRole("radio", { name: "Light" })).toBeChecked();
    fireEvent.click(within(look).getByRole("radio", { name: "Dark" }));
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(localStorage.getItem("cargoos.theme")).toBe("dark");
    fireEvent.click(within(look).getByRole("radio", { name: "Light" }));
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(localStorage.getItem("cargoos.theme")).toBe("light");
  });

  it("reads the stored theme on mount", () => {
    localStorage.setItem("cargoos.theme", "dark");
    renderSettings();
    expect(within(section("Appearance")).getByRole("radio", { name: "Dark" })).toBeChecked();
  });

  it("renames the workspace and lists its members with their roles; Invite is off in the demo", () => {
    saveSetup("sam", "Bayline Home Goods");
    renderSettings();
    const ws = section("Workspace");
    const name = within(ws).getByLabelText("Workspace name");
    expect(name).toHaveValue("Bayline Home Goods");
    fireEvent.change(name, { target: { value: "Harbor Goods" } });
    fireEvent.click(within(ws).getByRole("button", { name: "Save name" }));
    expect(readSetup()?.workspace).toBe("Harbor Goods");
    expect(within(ws).getByText("Saved")).toBeInTheDocument();
    expect(within(ws).getAllByRole("listitem")).toHaveLength(3);
    expect(within(ws).getByLabelText("Roles: Clerk, Ops lead, Controller, Uploader")).toBeInTheDocument();
    expect(within(ws).getByLabelText("Roles: Uploader")).toBeInTheDocument();
    const invite = within(ws).getByRole("button", { name: "Invite" });
    expect(invite).toHaveAttribute("aria-disabled", "true");
    expect(invite).toHaveAccessibleDescription("Demo workspace");
  });

  it("shows replay mode without a backend and resets the demo after a confirm", () => {
    renderSettings();
    const demo = section("Demo data");
    expect(demo).toHaveTextContent("Replay — answers play the recorded run");
    expect(demo).toHaveTextContent("?replay=1 forces replay");
    fireEvent.click(within(demo).getByRole("button", { name: "Reset demo" }));
    const confirm = within(demo).getByRole("group", { name: "Confirm reset" });
    expect(confirm).toHaveTextContent("Reset every demo bill?");
    expect(within(confirm).getByRole("button", { name: "Cancel" })).toHaveFocus();
    expect(screen.queryByText("Demo reset. Every bill is back to before the answers.")).not.toBeInTheDocument();
    fireEvent.click(within(confirm).getByRole("button", { name: "Yes, reset" }));
    expect(screen.getByText("Demo reset. Every bill is back to before the answers.")).toBeInTheDocument();
    expect(within(demo).getByRole("button", { name: "Reset demo" })).toBeInTheDocument();
  });

  it("Cancel and Escape leave the demo as it is", () => {
    renderSettings();
    const demo = section("Demo data");
    fireEvent.click(within(demo).getByRole("button", { name: "Reset demo" }));
    fireEvent.click(within(demo).getByRole("button", { name: "Cancel" }));
    expect(within(demo).queryByRole("group", { name: "Confirm reset" })).not.toBeInTheDocument();
    fireEvent.click(within(demo).getByRole("button", { name: "Reset demo" }));
    fireEvent.keyDown(within(demo).getByRole("button", { name: "Cancel" }), { key: "Escape" });
    expect(within(demo).queryByRole("group", { name: "Confirm reset" })).not.toBeInTheDocument();
    expect(screen.queryByText("Demo reset. Every bill is back to before the answers.")).not.toBeInTheDocument();
  });

  it("Start over forgets the setup and goes back to the landing page", () => {
    saveSetup("maya", "Harbor Goods");
    renderSettings();
    fireEvent.click(screen.getByRole("button", { name: "Start over" }));
    expect(readSetup()).toBeNull();
    expect(push).toHaveBeenCalledWith("/");
  });
});
