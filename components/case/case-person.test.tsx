// The case per device person (docs/design.md §0.3): owner, bookkeeper, uploader; plus the outline
// result glyph in the evidence chain.
import { useState } from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { Person } from "@/lib/types";
import { personById } from "@/lib/people";
import type { CaseView } from "./case-tabs";
import { useCaseStore } from "./case-store";
import type { DemoCase } from "./demo-case";
import { SCENARIO_A } from "./fixture";
import { CaseWorkspace } from "./workspace";

const SAM = personById("sam")!, MAYA = personById("maya")!, LEO = personById("leo")!;

/** CaseWorkspace with its own store and view, as the shell would hold them, for one person. */
function Case({ demo = SCENARIO_A, viewer, start = "case" }: { demo?: DemoCase; viewer: Person; start?: CaseView }) {
  const store = useCaseStore([demo], () => {});
  const [tab, setTab] = useState("overview");
  const [view, setView] = useState<CaseView>(start);
  const x = store.inputs[demo.id];
  return (
    <CaseWorkspace demo={demo} x={x} local={store.state[demo.id]} actions={store.actionsFor(demo)} viewer={viewer}
      view={view} onView={setView} now={null} tab={tab} onTab={setTab} inbox={{ demo, x, forwarder: "Pacific Crest Logistics" }} />
  );
}

const viewNames = () => within(screen.getByRole("tablist", { name: "Case views" })).getAllByRole("tab").map((t) => t.textContent);

afterEach(cleanup);

describe("evidence chain result", () => {
  it("is the outlined status glyph in the status colour, never a filled circle with a pictogram", () => {
    render(<Case viewer={SAM} />);
    fireEvent.click(screen.getByRole("tab", { name: /Ocean freight/ }));
    const glyph = screen.getByTestId("chain-result-glyph");
    expect(glyph).toHaveClass("text-dispute", "size-7");
    expect(glyph.className).not.toMatch(/\bbg-(dispute|cleared|waiting-tint)\b/);
    expect(glyph.querySelector("circle")).toHaveAttribute("fill", "none");
    const evidence = screen.getByRole("region", { name: "Evidence" });
    expect(evidence.querySelector('[class*="bg-dispute"], [class*="bg-cleared"]')).toBeNull();
    expect(screen.getByTestId("decision-status")).toHaveTextContent("To dispute");
    expect(screen.getByTestId("decision-status").className).not.toMatch(/\bbg-dispute\b/);
  });
});

describe("owner (Sam)", () => {
  it("reviews, drafts and decides, with the three views", () => {
    render(<Case viewer={SAM} />);
    expect(viewNames()).toEqual(["Review", "Documents4", "History9"]);
    expect(screen.getByTestId("at-stake")).toHaveTextContent("$300");
    expect(screen.getByRole("button", { name: "Draft dispute" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Request approval" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "After answers" }));
    fireEvent.click(screen.getByRole("button", { name: "Draft dispute" }));
    expect(screen.getByRole("button", { name: "Accept" })).toBeInTheDocument();
  });
});

describe("bookkeeper (Maya)", () => {
  it("sees findings and decides lines, but asks Sam instead of answering", () => {
    render(<Case viewer={MAYA} />);
    expect(screen.getByTestId("case-pill")).toHaveTextContent("Waiting for Sam");
    const list = screen.getByRole("region", { name: "To decide" });
    expect(within(list).getByRole("button", { name: /2 charges wait for Sam's answer/ })).toHaveTextContent("Open");
    expect(within(list).getAllByRole("heading").map((h) => h.textContent)).toContain("Questions for Sam · 1");
    fireEvent.click(screen.getByRole("tab", { name: /Sam's answer/ }));
    expect(screen.queryByLabelText("Your answer")).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Question" })).toHaveTextContent(/CargoOS asked Sam.*Waiting for Sam/);
    fireEvent.click(screen.getByRole("tab", { name: /Ocean freight/ }));
    expect(screen.getByRole("button", { name: "Agree" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Not an issue" })).toBeInTheDocument();
  });

  it("requests approval instead of drafting, and can't accept", () => {
    render(<Case viewer={MAYA} />);
    expect(screen.queryByRole("button", { name: "Draft dispute" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "After answers" }));
    fireEvent.click(screen.getByRole("button", { name: "Request approval" }));
    expect(screen.getByRole("tab", { name: /Dispute/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByRole("button", { name: "Accept" })).not.toBeInTheDocument();
    expect(screen.getByText("Waiting for Sam to decide.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Request approval" })).toHaveAttribute("title", "Approval is already requested.");
  });

  it("sees the owner's reason after a reject and can request again", () => {
    const { rerender } = render(<Case viewer={MAYA} />);
    fireEvent.click(screen.getByRole("button", { name: "After answers" }));
    fireEvent.click(screen.getByRole("button", { name: "Request approval" }));
    rerender(<Case viewer={SAM} />);
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    fireEvent.change(screen.getByLabelText("Why are you rejecting it?"), { target: { value: "They did expedite it." } });
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    rerender(<Case viewer={MAYA} />);
    expect(screen.getByText("“They did expedite it.”")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Request approval" })).not.toHaveAttribute("aria-disabled");
  });

  it("adds evidence from the ⋯ menu", async () => {
    render(<Case viewer={MAYA} />);
    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    expect(await screen.findByRole("menuitem", { name: "Add evidence" })).toBeInTheDocument();
  });
});

describe("uploader (Leo)", () => {
  it("opens on Documents with Add evidence, and sees no money, findings or Review", () => {
    render(<Case viewer={LEO} />);
    expect(viewNames()).toEqual(["Documents4", "History8"]);
    expect(screen.getByRole("tab", { name: /^Documents/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("list", { name: "Documents" })).toBeInTheDocument();
    expect(screen.queryByText("What CargoOS read")).not.toBeInTheDocument();
    expect(screen.queryByTestId("at-stake")).not.toBeInTheDocument();
    expect(screen.queryByTestId("case-pill")).not.toBeInTheDocument();
    expect(screen.queryByRole("tablist", { name: "Case tabs" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Draft dispute|Request approval/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add evidence" }));
    expect(screen.getByRole("complementary", { name: "Add evidence" })).toBeInTheDocument();
  });

  it("sees History of documents only, without amounts or quotes", () => {
    render(<Case viewer={LEO} start="history" />);
    const events = screen.getByRole("table", { name: "Events" });
    const rows = within(events).getAllByTestId("history-entry");
    expect(rows.length).toBe(8);
    expect(rows.map((r) => r.textContent).every((t) => /Added|Read|Uploaded|Couldn.t read/.test(t ?? ""))).toBe(true);
    expect(events.textContent).not.toMatch(/\$|dispute|draft/i);
    expect(screen.queryByTestId("history-round")).not.toBeInTheDocument();
  });
});
