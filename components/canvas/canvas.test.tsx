// The invoice canvas (docs/design.md §0.4) per person and per stage: Scenario A before and after the
// answer, Scenario B, the focused document and message, and the uploader.
import { useState } from "react";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { personById } from "@/lib/people";
import type { Person } from "@/lib/types";
import { useCaseStore } from "@/components/case/case-store";
import type { DemoCase } from "@/components/case/demo-case";
import { SCENARIO_A } from "@/components/case/fixture";
import { INVOICE, type Focus } from "@/components/case/panes";
import { CaseCanvas } from "./case-canvas";
import { DROP_LABEL } from "./uploader";

const SAM = personById("sam")!, MAYA = personById("maya")!, LEO = personById("leo")!;

/** The canvas with its own store and focus, as the workspace would hold them. Exposes the actions to drive the replay. */
function Canvas({ demo = SCENARIO_A, viewer, start = INVOICE, onReady }: {
  demo?: DemoCase; viewer: Person; start?: Focus; onReady?: (a: ReturnType<ReturnType<typeof useCaseStore>["actionsFor"]>) => void;
}) {
  const store = useCaseStore([demo], () => {});
  const [focus, setFocus] = useState<Focus>(start);
  const actions = store.actionsFor(demo);
  onReady?.(actions);
  return (
    <CaseCanvas demo={demo} x={store.inputs[demo.id]} local={store.state[demo.id]} actions={actions} viewer={viewer}
      now={null} forwarder="Pacific Crest Logistics" focus={focus} onFocus={setFocus} />
  );
}

/** Renders, then jumps the replay to `stage` (e.g. "after"). */
function at(stage: string, viewer: Person, start?: Focus) {
  let go: ((s: string) => void) | undefined;
  const r = render(<Canvas viewer={viewer} start={start} onReady={(a) => { go = a.reset; }} />);
  act(() => go!(stage));
  return r;
}

/** A cell's text as a wide screen shows it (without the copy that only narrow panes show). */
const cellText = (d: Element) => { const c = d.cloneNode(true) as Element; c.querySelectorAll("[data-narrow]").forEach((e) => e.remove()); return c.textContent; };
const sentence = () => screen.getByTestId("verdict-sentence").textContent;
const rowsText = () => within(screen.getByRole("region", { name: "Invoice lines" })).getAllByRole("row").slice(1)
  .map((r) => [...r.querySelectorAll("td")].map(cellText).join(" | "));
const filters = () => within(screen.getByRole("group", { name: "Show lines" })).getAllByRole("button").map((b) => b.textContent);

afterEach(cleanup);

describe("Scenario A before the answer (Sam)", () => {
  it("says what may not be owed in one number and one sentence, with the sources", () => {
    render(<Canvas viewer={SAM} />);
    expect(screen.getByTestId("at-stake")).toHaveTextContent("$300");
    expect(screen.getByText("may not be owed")).toBeInTheDocument();
    expect(screen.queryByTestId("was")).not.toBeInTheDocument();
    expect(sentence()).toBe("Pacific Crest billed $7,500. $6,600 matches what was agreed, $300 is more than agreed, and $600 waits for your answer.");
    const verdict = screen.getByRole("region", { name: "Verdict" });
    expect(within(verdict).getAllByRole("button").map((b) => b.textContent)).toEqual(["Quote · Sep 2", "Email · Sep 5", "WhatsApp · Sep 8–28", "Invoice · Oct 12"]);
  });

  it("lists the invoice lines in order with Agreed and a coloured Result word, no status icons", () => {
    render(<Canvas viewer={SAM} />);
    expect(filters()).toEqual(["All 8", "To dispute 1", "Waiting 2", "Cleared 5"]);
    expect(rowsText()).toEqual([
      "1 | Ocean freight 40HC Ningbo-Long Beach | $4,800 | $4,500 | $300 over",
      "2 | PSS peak season surcharge | $400 | per quote terms | Matches",
      "3 | Destination THC | $650 | $650 | Matches",
      "4 | Port congestion fee | $200 | not agreed yet | Asked you",
      "5 | Drayage Long Beach → Ontario CA | $850 | $850 | Matches",
      "6 | Rush handling | $400 | not agreed yet | Asked you",
      "7 | Customs entry | $125 | $125 | Matches",
      "8 | Documentation fee | $75 | $75 | Matches",
    ]);
    const table = screen.getByRole("region", { name: "Invoice lines" });
    expect(table.querySelector("svg")).toBeNull();
    expect(within(table).getByText("$300 over")).toHaveClass("text-dispute");
    expect(within(table).getAllByText("Asked you")[0]).toHaveClass("text-waiting");
    expect(within(table).getAllByText("Matches")[0]).toHaveClass("text-cleared");
  });

  it("folds Agreed under the charge name in a pane narrower than 512px", () => {
    render(<Canvas viewer={SAM} />);
    const table = screen.getByRole("region", { name: "Invoice lines" });
    expect(table).toHaveClass("@container");
    expect(within(table).getByRole("columnheader", { name: "Agreed" })).toHaveClass("hidden", "@lg:table-cell");
    expect(table.querySelector("[data-narrow]")).toHaveTextContent("Agreed $4,500");
  });

  it("filters the lines without losing the open one", () => {
    render(<Canvas viewer={SAM} />);
    fireEvent.click(screen.getByRole("button", { name: "Waiting 2" }));
    expect(rowsText().map((r) => r.split(" | ")[0])).toEqual(["4", "6"]);
    fireEvent.click(screen.getByRole("button", { name: "All 8" }));
    expect(rowsText()).toHaveLength(8);
  });

  it("opens the proof under a line: quotes with sources, the engine's why line, and the clerk's buttons", () => {
    render(<Canvas viewer={SAM} />);
    fireEvent.click(screen.getByRole("button", { name: "Ocean freight 40HC Ningbo-Long Beach" }));
    const proof = screen.getByTestId("proof");
    expect(proof).toHaveTextContent("Email, Sep 5: Ocean freight reduced to $4,500 if booked by Sep 10");
    expect(proof).toHaveTextContent("Chat, Sep 8: Booking confirmed for your 40HC, booked today Sep 8");
    expect(within(proof).getByTestId("why")).toHaveTextContent(/Over by \$300/);
    expect(within(proof).getByRole("button", { name: "Keep in dispute" })).toBeInTheDocument();
    expect(within(proof).getByRole("button", { name: "Not an issue" })).toBeInTheDocument();
    expect(within(proof).getByRole("button", { name: "Edit line" })).toBeInTheDocument();
  });

  it("Not an issue moves the line to Matches-or-muted and lowers what may not be owed", () => {
    render(<Canvas viewer={SAM} />);
    fireEvent.click(screen.getByRole("button", { name: "Ocean freight 40HC Ningbo-Long Beach" }));
    fireEvent.click(screen.getByRole("button", { name: "Not an issue" }));
    expect(screen.getByTestId("at-stake")).toHaveAccessibleName("$0");
    expect(rowsText()[0]).toMatch(/\| Not an issue$/);
    expect(sentence()).toMatch(/\$300 was marked not an issue/);
  });

  it("a quote opens its document with the quote marked; ← Invoice goes back", () => {
    render(<Canvas viewer={SAM} />);
    fireEvent.click(screen.getByRole("button", { name: "Ocean freight 40HC Ningbo-Long Beach" }));
    fireEvent.click(screen.getByRole("button", { name: "Ocean freight reduced to $4,500 if booked by Sep 10" }));
    expect(screen.queryByRole("region", { name: "Invoice lines" })).not.toBeInTheDocument();
    const marked = document.querySelector("mark[data-selected]");
    expect(marked?.textContent).toBe("Ocean freight reduced to $4,500 if booked by Sep 10");
    fireEvent.click(screen.getByRole("button", { name: "← Invoice" }));
    expect(screen.getByRole("region", { name: "Invoice lines" })).toBeInTheDocument();
  });

  it("a source chip opens the whole document", () => {
    render(<Canvas viewer={SAM} />);
    fireEvent.click(screen.getByRole("button", { name: "WhatsApp · Sep 8–28" }));
    expect(screen.getByRole("article")).toHaveTextContent(/WhatsApp/);
    expect(screen.getByRole("button", { name: "← Invoice" })).toBeInTheDocument();
  });
});

describe("Scenario A after the answer (Maya)", () => {
  it("counts to $700, shows what it was, and names Sam's answer", () => {
    at(SCENARIO_A.end, MAYA);
    expect(screen.getByTestId("at-stake")).toHaveAccessibleName("$700");
    expect(screen.getByTestId("was")).toHaveTextContent("was $300");
    expect(sentence()).toBe("Pacific Crest billed $7,500. $6,800 matches what was agreed and $700 is more than agreed. Nothing is waiting.");
    expect(screen.getByRole("button", { name: "Sam's answer · Oct 24" })).toBeInTheDocument();
  });

  it("marks the two lines the answer changed as New, with Sam's words in Agreed", () => {
    at(SCENARIO_A.end, MAYA);
    expect(filters()).toEqual(["All 8", "To dispute 2", "Cleared 6"]);
    expect(rowsText()[3]).toBe("4 | Port congestion feeNew | $200 | Sam approved it | Matches");
    expect(rowsText()[5]).toBe("6 | Rush handlingNew | $400 | nobody agreed | $400 over");
  });

  it("the proof says Sam's answer, not yours", () => {
    at(SCENARIO_A.end, MAYA, { kind: "line", key: "chg_6" });
    const proof = screen.getByTestId("proof");
    expect(proof).toHaveTextContent(/Sam's answer, Oct 24: nobody agreed to \$400 rush handling/);
    expect(proof.textContent).not.toMatch(/Your answer/);
  });
});

describe("message to the seller", () => {
  it("opens on the canvas after Accept, editable for the owner, read-only for Maya", () => {
    render(<MessageHarness viewer={SAM} />);
    expect(screen.getByRole("region", { name: "Message to the seller" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Message" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "← Invoice" })).toBeInTheDocument();
    cleanup();
    render(<MessageHarness viewer={MAYA} />);
    expect(screen.queryByRole("textbox", { name: "Message" })).not.toBeInTheDocument();
  });

  it("before Accept, says the message comes after the owner accepts", () => {
    render(<Canvas viewer={SAM} start={{ kind: "message", draftId: "none" }} />);
    expect(screen.getByText(/written once the owner accepts the dispute/)).toBeInTheDocument();
  });
});

/** Drafts and accepts in the same store, then focuses the message. */
function MessageHarness({ viewer }: { viewer: Person }) {
  const store = useCaseStore([SCENARIO_A], () => {});
  const actions = store.actionsFor(SCENARIO_A);
  const [step, setStep] = useState(0);
  const [focus, setFocus] = useState<Focus>(INVOICE);
  const x = store.inputs[SCENARIO_A.id];
  if (step === 0) { setStep(1); actions.reset(SCENARIO_A.end); }
  if (step === 1 && store.state[SCENARIO_A.id].stage === SCENARIO_A.end) { setStep(2); actions.draftDispute(); }
  const d = x.drafts.at(-1);
  if (step === 2 && d && d.status !== "approved") { setStep(3); actions.accept(d._id); }
  if (step === 3 && d?.status === "approved" && focus.kind !== "message") setFocus({ kind: "message", draftId: d._id });
  return <CaseCanvas demo={SCENARIO_A} x={x} local={store.state[SCENARIO_A.id]} actions={actions} viewer={viewer}
    now={null} forwarder="Pacific Crest Logistics" focus={focus} onFocus={setFocus} />;
}

describe("uploader (Leo)", () => {
  it("sees documents and a big drop zone, never money or findings", () => {
    render(<Canvas viewer={LEO} />);
    expect(screen.getByText(DROP_LABEL)).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Documents" })).toHaveTextContent("Documents in this case · 4");
    expect(screen.queryByTestId("at-stake")).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Invoice lines" })).not.toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/may not be owed|over|Matches/);
  });

  it("opens a document without CargoOS's marks, and can paste text as evidence", () => {
    render(<Canvas viewer={LEO} />);
    fireEvent.click(screen.getByRole("button", { name: /Quote Q-PCL-0902/ }));
    expect(document.querySelectorAll("mark")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "← Invoice" }));
    fireEvent.click(screen.getByRole("button", { name: "Paste text" }));
    expect(screen.getByRole("region", { name: "Paste text" })).toBeInTheDocument();
  });
});
