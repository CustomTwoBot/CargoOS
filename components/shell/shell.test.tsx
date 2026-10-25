import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CaseScreen } from "@/components/case/case-screen";
import { SCENARIO_A } from "@/components/case/fixture";

/** Pretends the window is `w` pixels wide for the shell's (min-width: …) queries. */
function atWidth(w: number) {
  window.matchMedia = ((query: string) => ({
    matches: w >= Number(/min-width:\s*(\d+)px/.exec(query)?.[1] ?? 0),
    media: query, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

const nav = () => screen.getByRole("navigation", { name: "Sections" });
const BAYLINE = "Bayline 40HC Ningbo-LB";

beforeEach(() => { localStorage.removeItem("cargoos.sidebar"); localStorage.removeItem("cargoos.person"); });
afterEach(() => { cleanup(); Reflect.deleteProperty(window, "matchMedia"); });

describe("sidebar: places shared by every case", () => {
  it("groups Waiting on you and Cases, with counts and a status for each case", () => {
    render(<CaseScreen cases={[SCENARIO_A]} />);
    const waiting = within(nav()).getByRole("region", { name: "Waiting on you" });
    expect(within(waiting).getByRole("button", { name: "Questions, 1 waiting" })).toBeInTheDocument();
    expect(within(waiting).getByRole("button", { name: "Approvals" })).toBeInTheDocument();

    const cases = within(nav()).getByRole("region", { name: /Cases/ });
    const open = within(cases).getByRole("button", { name: `${BAYLINE}, $300 at stake, Waiting on you` });
    expect(open).toHaveAttribute("aria-current", "page");
    expect(within(cases).getByRole("button", { name: "All cases" })).toBeInTheDocument();
    expect(within(cases).getByRole("button", { name: "New case" })).toBeInTheDocument();
    expect(within(nav()).getByText(/^Replay of a recorded run\./)).toBeInTheDocument();
  });

  it("follows the case: ready to dispute after the answers, an approval waiting once drafted, nothing to do after accepting", () => {
    render(<CaseScreen cases={[SCENARIO_A]} />);
    fireEvent.click(screen.getByRole("button", { name: "After answers" }));
    expect(within(nav()).getByRole("button", { name: "Questions" })).toBeInTheDocument();
    expect(within(nav()).getByRole("button", { name: `${BAYLINE}, $700 at stake, Ready to dispute` })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Draft dispute" }));
    expect(within(nav()).getByRole("button", { name: "Approvals, 1 waiting" })).toBeInTheDocument();
    expect(within(nav()).getByRole("button", { name: `${BAYLINE}, $700 at stake, Waiting on you` })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    expect(within(nav()).getByRole("button", { name: "Approvals" })).toBeInTheDocument();
    expect(within(nav()).getByRole("button", { name: `${BAYLINE}, $700 at stake, Nothing to do` })).toBeInTheDocument();
  });

  it("holds nothing from the open case: no Overview, Open question, Documents, History or repeated title", () => {
    render(<CaseScreen cases={[SCENARIO_A]} />);
    for (const name of [/^Overview/, /^Open question/, /^Documents/, /^History/]) {
      expect(within(nav()).queryByRole("button", { name })).not.toBeInTheDocument();
    }
    expect(within(nav()).getAllByText(BAYLINE)).toHaveLength(1);
  });

  it("goes to the places it names and marks where you are", () => {
    render(<CaseScreen cases={[SCENARIO_A]} />);
    fireEvent.click(within(nav()).getByRole("button", { name: "All cases" }));
    expect(screen.getByRole("heading", { name: /^Cases/, level: 1 })).toBeInTheDocument();
    expect(within(nav()).getByRole("button", { name: "All cases" })).toHaveAttribute("aria-current", "page");
    expect(within(nav()).getByRole("button", { name: /^Bayline/ })).not.toHaveAttribute("aria-current");
    fireEvent.click(within(nav()).getByRole("button", { name: "Questions, 1 waiting" }));
    expect(within(nav()).getByRole("button", { name: "Questions, 1 waiting" })).toHaveAttribute("aria-current", "page");
    fireEvent.click(within(nav()).getByRole("button", { name: /^Bayline/ }));
    expect(screen.getByTestId("at-stake")).toHaveTextContent("$300");
  });
});

describe("sidebar by window width", () => {
  it("is expanded at 1440 and collapses to the rail when asked, remembering it", () => {
    atWidth(1440);
    render(<CaseScreen cases={[SCENARIO_A]} />);
    fireEvent.click(within(nav()).getByRole("button", { name: "Collapse sidebar" }));
    expect(localStorage.getItem("cargoos.sidebar")).toBe("collapsed");
    expect(within(nav()).getByRole("button", { name: "Expand sidebar" })).toBeInTheDocument();
    expect(within(nav()).queryByText(BAYLINE)).not.toBeInTheDocument();
  });

  it("is a rail of icons and case initials by default at 1180, and the operator's choice to expand wins", () => {
    atWidth(1180);
    render(<CaseScreen />);
    expect(within(nav()).queryByRole("button", { name: "Collapse sidebar" })).not.toBeInTheDocument();
    expect(within(nav()).getByText("BN")).toBeInTheDocument();
    expect(within(nav()).getByText("JP")).toBeInTheDocument();
    expect(within(nav()).getByRole("button", { name: /^Bayline 40HC Ningbo-LB, \$300 at stake/ })).toHaveAttribute("aria-current", "page");
    expect(within(nav()).getByRole("button", { name: /^Questions, \d+ waiting$/ })).toBeInTheDocument();
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
    expect(screen.getByRole("banner", { name: "CargoOS" })).toHaveTextContent(BAYLINE);
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

    fireEvent.click(within(drawer).getByRole("button", { name: "Questions, 1 waiting" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("banner", { name: "CargoOS" })).toHaveTextContent("Questions");
  });
});
