import { act, cleanup, fireEvent, render, renderHook, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CaseScreen } from "@/components/case/case-screen";
import { SCENARIO_A } from "@/components/case/fixture";
import { setDevicePerson, useDevicePerson } from "@/components/shell/person";

const nav = () => screen.getByRole("navigation", { name: "Sections" });
const settings = () => within(nav()).getByRole("button", { name: /^Settings\. This device: / });
const pick = (name: string) => fireEvent.click(screen.getByRole("radio", { name: new RegExp(`^${name}`) }));

beforeEach(() => { localStorage.removeItem("cargoos.person"); localStorage.removeItem("cargoos.theme"); });
afterEach(() => { cleanup(); document.documentElement.classList.remove("dark"); Reflect.deleteProperty(window, "matchMedia"); });

describe("the person on this device", () => {
  it("is Sam until another is chosen, remembers the choice, and ignores ids nobody has", () => {
    const { result } = renderHook(() => useDevicePerson());
    expect(result.current.id).toBe("sam");
    act(() => setDevicePerson("maya"));
    expect(result.current.id).toBe("maya");
    expect(localStorage.getItem("cargoos.person")).toBe("maya");
    act(() => setDevicePerson("nobody"));
    expect(result.current.id).toBe("maya");
  });

  it("falls back to Sam when storage can't be read", () => {
    const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    const { result } = renderHook(() => useDevicePerson());
    expect(result.current.id).toBe("sam");
    spy.mockRestore();
  });
});

describe("Settings", () => {
  it("opens from the account block, which names this device's person and workspace", () => {
    render(<CaseScreen cases={[SCENARIO_A]} />);
    expect(settings()).toHaveAccessibleName("Settings. This device: Sam · Owner");
    expect(within(nav()).getByText("Bayline Trading")).toBeInTheDocument();
    fireEvent.click(settings());
    expect(screen.getByRole("heading", { name: "Settings", level: 1 })).toBeInTheDocument();
    expect(screen.getByRole("radiogroup", { name: "Person on this device" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /^Sam · Owner/ })).toBeChecked();
    expect(screen.getByText("Can't accept a dispute they requested")).toBeInTheDocument();
  });

  it("marks only the account block as where you are, coming from Approvals, in the sidebar and the rail", () => {
    render(<CaseScreen cases={[SCENARIO_A]} />);
    const solid = (el: HTMLElement) => el.className.split(" ").includes("bg-sunken");
    const check = () => {
      const current = within(nav()).getAllByRole("button").filter((b) => b.getAttribute("aria-current") === "page");
      expect(current).toEqual([settings()]);
      for (const name of [/^Approvals/, /^Questions/]) {
        const item = within(nav()).getByRole("button", { name });
        expect(item).not.toHaveAttribute("aria-current");
        expect(solid(item)).toBe(false);
      }
      expect(solid(settings())).toBe(true);
    };
    fireEvent.click(within(nav()).getByRole("button", { name: /^Approvals/ }));
    fireEvent.click(settings());
    check();
    fireEvent.click(within(nav()).getByRole("button", { name: "Collapse sidebar" }));
    check();
    localStorage.removeItem("cargoos.sidebar");
  });

  it("switching to Maya changes the sidebar: the case waits for Sam and nothing waits on the bookkeeper", () => {
    render(<CaseScreen cases={[SCENARIO_A]} />);
    fireEvent.click(settings());
    pick("Maya · Bookkeeper");
    expect(settings()).toHaveAccessibleName("Settings. This device: Maya · Bookkeeper");
    expect(within(nav()).getByRole("button", { name: "Questions" })).toBeInTheDocument();
    expect(within(nav()).getByRole("button", { name: "Bayline 40HC Ningbo-LB, $300 at stake, Waiting for Sam" })).toBeInTheDocument();
  });

  it("an uploader sees only the cases, with no amounts or statuses, and New case", () => {
    render(<CaseScreen cases={[SCENARIO_A]} />);
    fireEvent.click(settings());
    pick("Leo · Uploader");
    expect(within(nav()).queryByRole("region", { name: "Waiting on you" })).not.toBeInTheDocument();
    expect(within(nav()).queryByText("$300")).not.toBeInTheDocument();
    expect(within(nav()).getByRole("button", { name: "Bayline 40HC Ningbo-LB" })).toBeInTheDocument();
    expect(within(nav()).getByRole("button", { name: "New case" })).toBeInTheDocument();
    fireEvent.click(within(nav()).getByRole("button", { name: "All cases" }));
    const list = screen.getByRole("region", { name: "Cases" });
    expect(within(list).queryByText("$300")).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Show cases" })).not.toBeInTheDocument();
  });

  it("lists the workspace's members with their roles; Invite says why it is off", () => {
    render(<CaseScreen cases={[SCENARIO_A]} />);
    fireEvent.click(settings());
    fireEvent.click(screen.getByRole("button", { name: "Workspace" }));
    const members = screen.getByRole("list", { name: "Members" });
    expect(within(members).getAllByRole("listitem")).toHaveLength(3);
    expect(within(members).getByText("Controller")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Invite" })).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("button", { name: "Invite" })).toHaveAccessibleDescription("Demo workspace");
  });

  it("Appearance sets light, dark or the system theme and remembers it", () => {
    window.matchMedia = ((q: string) => ({ matches: q.includes("dark") || q.includes("min-width"), media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
    render(<CaseScreen cases={[SCENARIO_A]} />);
    fireEvent.click(settings());
    fireEvent.click(screen.getByRole("button", { name: "Appearance" }));
    expect(screen.getByRole("radio", { name: /^Light/ })).toBeChecked();
    pick("Dark");
    expect(document.documentElement).toHaveClass("dark");
    expect(localStorage.getItem("cargoos.theme")).toBe("dark");
    pick("Light");
    expect(document.documentElement).not.toHaveClass("dark");
    pick("System");
    expect(localStorage.getItem("cargoos.theme")).toBe("system");
    expect(document.documentElement).toHaveClass("dark");
  });

  it("Billing has no payment buttons, and Demo data resets every case", () => {
    render(<CaseScreen cases={[SCENARIO_A]} />);
    fireEvent.click(screen.getByRole("button", { name: "After answers" }));
    expect(within(nav()).getByRole("button", { name: /\$700 at stake/ })).toBeInTheDocument();
    fireEvent.click(settings());
    fireEvent.click(screen.getByRole("button", { name: "Billing" }));
    expect(within(screen.getByRole("region", { name: "Billing" })).queryAllByRole("button")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Demo data" }));
    fireEvent.click(screen.getByRole("button", { name: "Reset demo" }));
    expect(within(nav()).getByRole("button", { name: /\$300 at stake/ })).toBeInTheDocument();
    expect(screen.getByText("Demo reset. Every case is back to before the answers.")).toBeInTheDocument();
  });
});
