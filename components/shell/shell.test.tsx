import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CaseScreen } from "@/components/case/case-screen";
import { SCENARIO_A } from "@/components/case/fixture";
import { setDevicePerson } from "./person";

/** Pretends the window is `w` pixels wide for the shell's (min-width: …) queries. */
function atWidth(w: number) {
  window.matchMedia = ((query: string) => ({
    matches: w >= Number(/min-width:\s*(\d+)px/.exec(query)?.[1] ?? 0),
    media: query, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

const nav = () => screen.getByRole("navigation", { name: "Sections" });
const group = (name: string) => within(nav()).getByRole("region", { name });
const PCL = "Pacific Crest · PCL-INV-1012";
const KBL = "Kestrel Bay · KBL-INV-2291";

beforeEach(() => { localStorage.removeItem("cargoos.sidebar"); localStorage.removeItem("cargoos.person"); });
afterEach(() => { cleanup(); Reflect.deleteProperty(window, "matchMedia"); });

describe("sidebar like ChatGPT (§0.4 п.1)", () => {
  it("has New case, the cases under Needs you and Earlier with their status words, and the account; no Questions or Approvals", () => {
    render(<CaseScreen />);
    expect(within(nav()).getByRole("button", { name: "New case" })).toBeInTheDocument();
    const needs = group("Needs you");
    expect(within(needs).getByRole("button", { name: `${PCL}. Answer 1 question` })).toHaveAttribute("aria-current", "page");
    expect(within(needs).getByRole("button", { name: new RegExp(`^${KBL}\\. Answer \\d+ questions$`) })).toBeInTheDocument();
    expect(within(nav()).queryByRole("region", { name: "Earlier" })).not.toBeInTheDocument();
    expect(within(nav()).getByRole("button", { name: "Settings. This device: Sam · Owner" })).toBeInTheDocument();
    for (const name of [/^Questions/, /^Approvals/, /^All cases/]) expect(within(nav()).queryByRole("button", { name })).not.toBeInTheDocument();
  });

  it("Reset demo in the demo bar puts every case back to before the answers, not just the open one", () => {
    render(<CaseScreen />);
    fireEvent.click(screen.getByRole("button", { name: "After answers" }));
    fireEvent.click(within(nav()).getByRole("button", { name: new RegExp(`^${KBL}`) }));
    fireEvent.click(screen.getByRole("button", { name: "Reset demo" }));
    expect(within(group("Needs you")).getByRole("button", { name: `${PCL}. Answer 1 question` })).toBeInTheDocument();
    expect(screen.getByText("Demo reset. Every case is back to before the answers.")).toBeInTheDocument();
    fireEvent.click(within(nav()).getByRole("button", { name: new RegExp(`^${PCL}`) }));
    expect(screen.getByRole("button", { name: "Before answers" })).toHaveAttribute("aria-pressed", "true");
  });

  it("an uploader's demo bar has only Reset demo", () => {
    act(() => setDevicePerson("leo"));
    render(<CaseScreen cases={[SCENARIO_A]} />);
    const bar = screen.getByRole("group", { name: "Demo controls" });
    expect(within(bar).getAllByRole("button").map((b) => b.textContent)).toEqual(["Reset demo"]);
  });

  it("follows the case: after the answers it is ready to dispute $700, and Reset demo brings the question back", () => {
    render(<CaseScreen cases={[SCENARIO_A]} />);
    fireEvent.click(screen.getByRole("button", { name: "After answers" }));
    expect(within(group("Needs you")).getByRole("button", { name: `${PCL}. Ready to dispute $700` })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reset demo" }));
    expect(within(group("Needs you")).getByRole("button", { name: `${PCL}. Answer 1 question` })).toBeInTheDocument();
  });

  it("on the bookkeeper's screen the question waits for Sam, so the case is under Earlier", () => {
    act(() => setDevicePerson("maya"));
    render(<CaseScreen cases={[SCENARIO_A]} />);
    expect(within(group("Needs you")).getByText("Nothing waits on you.")).toBeInTheDocument();
    expect(within(group("Earlier")).getByRole("button", { name: `${PCL}. Waiting for Sam` })).toBeInTheDocument();
  });

  it("goes to New case, Settings and back to a case, marking only where you are", () => {
    render(<CaseScreen cases={[SCENARIO_A]} />);
    const current = () => within(nav()).getAllByRole("button").filter((b) => b.getAttribute("aria-current") === "page").map((b) => b.getAttribute("aria-label") ?? b.textContent);
    fireEvent.click(within(nav()).getByRole("button", { name: "New case" }));
    expect(screen.getByRole("heading", { name: "New case", level: 1 })).toBeInTheDocument();
    expect(current()).toEqual(["New case"]);
    fireEvent.click(within(nav()).getByRole("button", { name: /^Settings\. This device/ }));
    expect(screen.getByRole("heading", { name: "Settings", level: 1 })).toBeInTheDocument();
    expect(current()).toEqual(["Settings. This device: Sam · Owner"]);
    fireEvent.click(within(nav()).getByRole("button", { name: new RegExp(`^${PCL}`) }));
    expect(screen.getByRole("heading", { name: "Invoice PCL-INV-1012 from Pacific Crest Logistics", level: 1 })).toBeInTheDocument();
    expect(current()).toEqual([`${PCL}. Answer 1 question`]);
  });

  it("an uploader sees one plain list of cases, without amounts or anything to act on", () => {
    act(() => setDevicePerson("leo"));
    render(<CaseScreen cases={[SCENARIO_A]} />);
    expect(within(nav()).queryByRole("region", { name: "Needs you" })).not.toBeInTheDocument();
    expect(within(group("Cases")).getByRole("button", { name: `${PCL}. 4 documents` })).toBeInTheDocument();
    expect(within(nav()).queryByText(/\$/)).not.toBeInTheDocument();
  });
});

describe("the open case (§0.4 п.2, п.7)", () => {
  it("heads the case with the invoice, what was shipped and the trust line; Replay and ⋯ on the right", () => {
    render(<CaseScreen cases={[SCENARIO_A]} />);
    expect(screen.getByRole("heading", { name: "Invoice PCL-INV-1012 from Pacific Crest Logistics", level: 1 })).toBeInTheDocument();
    expect(screen.getByText("40HC Ningbo → Long Beach · Oct 12 · Synthetic data. Nothing is sent or paid automatically.")).toBeInTheDocument();
    expect(screen.getByText("Replay")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "More actions" })).toBeInTheDocument();
  });

  it("puts the invoice on the left and CargoOS on the right; the demo controls float over the invoice, never the thread", () => {
    render(<CaseScreen cases={[SCENARIO_A]} />);
    const invoice = screen.getByRole("region", { name: "Invoice" });
    const thread = screen.getByRole("complementary", { name: "CargoOS" });
    expect(invoice.compareDocumentPosition(thread) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const demo = screen.getByRole("group", { name: "Demo controls" });
    expect(demo.parentElement).toContainElement(invoice);
    expect(demo.parentElement).not.toContainElement(thread);
  });

  it("below 1024 shows one pane; it opens on CargoOS when a question waits for this person, with the count", () => {
    atWidth(900);
    render(<CaseScreen cases={[SCENARIO_A]} />);
    const show = screen.getByRole("group", { name: "Show" });
    expect(within(show).getByRole("button", { name: "CargoOS1" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(within(show).getByRole("button", { name: "Invoice" }));
    expect(within(show).getByRole("button", { name: "Invoice" })).toHaveAttribute("aria-pressed", "true");
  });

  it("follows what waits on this person until they pick a pane (the case may load after the first render)", () => {
    act(() => setDevicePerson("maya"));
    atWidth(900);
    render(<CaseScreen cases={[SCENARIO_A]} />);
    const pressed = () => within(screen.getByRole("group", { name: "Show" })).getAllByRole("button").find((b) => b.getAttribute("aria-pressed") === "true")?.textContent;
    expect(pressed()).toBe("Invoice");
    act(() => setDevicePerson("sam"));
    expect(pressed()).toBe("CargoOS1");
    fireEvent.click(within(screen.getByRole("group", { name: "Show" })).getByRole("button", { name: "Invoice" }));
    act(() => setDevicePerson("maya"));
    act(() => setDevicePerson("sam"));
    expect(pressed()).toBe("Invoice");
  });

  it("keeps toasts off the thread's header below 1024: under it when CargoOS is shown, at the bottom over the invoice", () => {
    atWidth(900);
    render(<CaseScreen cases={[SCENARIO_A]} />);
    const region = () => screen.getByRole("region", { name: "Notifications" });
    expect(region().className).toContain("max-lg:top-[92px]");
    fireEvent.click(within(screen.getByRole("group", { name: "Show" })).getByRole("button", { name: "Invoice" }));
    expect(region().className).not.toContain("max-lg:top-[92px]");
    expect(region().className).toContain("bottom-14");
  });

  it("opens on the invoice for someone nothing waits on", () => {
    act(() => setDevicePerson("maya"));
    atWidth(900);
    render(<CaseScreen cases={[SCENARIO_A]} />);
    expect(within(screen.getByRole("group", { name: "Show" })).getByRole("button", { name: "Invoice" })).toHaveAttribute("aria-pressed", "true");
  });
});

describe("sidebar by window width", () => {
  it("is expanded at 1440 and collapses to the rail when asked, remembering it", () => {
    atWidth(1440);
    render(<CaseScreen cases={[SCENARIO_A]} />);
    fireEvent.click(within(nav()).getByRole("button", { name: "Collapse sidebar" }));
    expect(localStorage.getItem("cargoos.sidebar")).toBe("collapsed");
    expect(within(nav()).getByRole("button", { name: "Expand sidebar" })).toBeInTheDocument();
    expect(within(nav()).queryByText(PCL)).not.toBeInTheDocument();
  });

  it("is a rail of New case, case initials and the account by default at 1180, and the operator's choice to expand wins", () => {
    atWidth(1180);
    render(<CaseScreen />);
    expect(within(nav()).queryByRole("button", { name: "Collapse sidebar" })).not.toBeInTheDocument();
    expect(within(nav()).getByText("PC")).toBeInTheDocument();
    expect(within(nav()).getByText("KB")).toBeInTheDocument();
    expect(within(nav()).getByRole("button", { name: `${PCL}. Answer 1 question` })).toHaveAttribute("aria-current", "page");
    expect(within(nav()).getByRole("button", { name: "New case" })).toBeInTheDocument();
    expect(within(nav()).getByRole("button", { name: /^Settings\. This device/ })).toBeInTheDocument();
    fireEvent.click(within(nav()).getByRole("button", { name: "Expand sidebar" }));
    expect(localStorage.getItem("cargoos.sidebar")).toBe("expanded");
    expect(within(nav()).getByRole("button", { name: "Collapse sidebar" })).toBeInTheDocument();
  });

  it("stays collapsed at 1440 when the operator collapsed it before", () => {
    localStorage.setItem("cargoos.sidebar", "collapsed");
    atWidth(1440);
    render(<CaseScreen cases={[SCENARIO_A]} />);
    expect(within(nav()).getByRole("button", { name: "Expand sidebar" })).toBeInTheDocument();
  });
});

describe("below 1024px: a menu button and a drawer", () => {
  it("hides the sidebar behind the menu; Escape closes the drawer and focus returns to the menu button", () => {
    atWidth(900);
    render(<CaseScreen cases={[SCENARIO_A]} />);
    expect(screen.queryByRole("navigation", { name: "Sections" })).not.toBeInTheDocument();
    const menu = screen.getByRole("button", { name: "Open menu" });
    expect(screen.getByRole("banner", { name: "CargoOS" })).toHaveTextContent(PCL);
    menu.focus();
    fireEvent.click(menu);
    const drawer = screen.getByRole("dialog", { name: "Menu" });
    expect(within(drawer).getByRole("navigation", { name: "Sections" })).toBeInTheDocument();
    expect(within(drawer).getByRole("button", { name: "Close menu" })).toHaveFocus();
    expect(screen.getByRole("main").parentElement).toHaveAttribute("inert");
    fireEvent.keyDown(drawer, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(menu).toHaveFocus();
  });

  it("closes on a click outside, keeps Tab inside, and closes after going somewhere", () => {
    atWidth(900);
    render(<CaseScreen cases={[SCENARIO_A]} />);
    fireEvent.click(screen.getByRole("button", { name: "Open menu" }));
    fireEvent.click(screen.getByTestId("drawer-scrim"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Open menu" }));
    const drawer = screen.getByRole("dialog", { name: "Menu" });
    const buttons = within(drawer).getAllByRole("button");
    act(() => buttons.at(-1)!.focus());
    fireEvent.keyDown(drawer, { key: "Tab" });
    expect(buttons[0]).toHaveFocus();
    fireEvent.keyDown(drawer, { key: "Tab", shiftKey: true });
    expect(buttons.at(-1)).toHaveFocus();

    fireEvent.click(within(drawer).getByRole("button", { name: "New case" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("banner", { name: "CargoOS" })).toHaveTextContent("New case");
  });
});
