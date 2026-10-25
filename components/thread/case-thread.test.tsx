import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SCENARIO_B } from "@/components/demo/scenario-b/scenario-b";
import { LEO, MAYA, SAM } from "@/components/inboxes/people";
import { CaseThread } from "./case-thread";
import { ctxFor, draftLocal } from "./sample";

const thread = () => screen.getByRole("list", { name: "What CargoOS did" });

describe("CaseThread", () => {
  afterEach(cleanup);

  it("says what CargoOS is, then the work in order; Line 1 and the quote open them on the canvas", () => {
    const onFocus = vi.fn();
    render(<CaseThread {...ctxFor(SAM, "before")} onFocus={onFocus} />);
    expect(screen.getByText("Checks every line. Asks when it can’t tell. Never pays or sends.")).toBeInTheDocument();
    expect(within(thread()).getByText("4 documents added · Oct 24, 1:50 PM")).toBeInTheDocument();
    expect(within(thread()).getByText("$300 over")).toHaveClass("text-dispute");
    fireEvent.click(within(thread()).getByRole("button", { name: "Line 1" }));
    expect(onFocus).toHaveBeenCalledWith({ kind: "line", key: "chg_1" });
    const q = within(thread()).getByRole("listitem", { name: "Question for you" });
    expect(within(q).getByText("Lines 4 and 6 · $600 wait for your answer")).toBeInTheDocument();
    fireEvent.click(within(q).getByRole("button", { name: "possible congestion at LB terminal, may be extra" }));
    expect(onFocus).toHaveBeenCalledWith({ kind: "doc", docId: "doc_chat", quote: "possible congestion at LB terminal, may be extra" });
  });

  it("an open question to you: the answer box sends on Enter, not when empty", () => {
    const reply = vi.fn();
    render(<CaseThread {...ctxFor(SAM, "before", undefined, { reply })} onFocus={vi.fn()} />);
    const box = screen.getByRole("textbox", { name: "Your answer" });
    expect(box).toHaveAttribute("placeholder", "Answer CargoOS… e.g. “approved on WhatsApp”");
    expect(screen.getByText("Your answer becomes evidence. CargoOS rechecks the lines; nothing is sent.")).toBeInTheDocument();
    expect(screen.getByText("In this replay CargoOS reads the recorded answer.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Send answer" }));
    expect(reply).not.toHaveBeenCalled();
    fireEvent.change(box, { target: { value: "approved congestion, not rush" } });
    fireEvent.keyDown(box, { key: "Enter" });
    expect(reply).toHaveBeenCalledWith("q_1", "approved congestion, not rush");
    // Until the answer comes back, the box closes and says CargoOS is rechecking.
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Rechecking with your answer…");
  });

  it("two open questions: the box says which one it answers", () => {
    render(<CaseThread {...ctxFor(SAM, "before", SCENARIO_B)} onFocus={vi.fn()} />);
    expect(screen.getByText("Answering Question 1")).toBeInTheDocument();
  });

  it("Maya can't answer: a quiet line instead of the box", () => {
    render(<CaseThread {...ctxFor(MAYA, "before")} onFocus={vi.fn()} />);
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Waiting for Sam’s answer.");
    expect(within(thread()).getByRole("listitem", { name: "Question for Sam" })).toBeInTheDocument();
  });

  it("after the answer, Maya asks Sam to approve the dispute", () => {
    const draftDispute = vi.fn(), onFocus = vi.fn();
    render(<CaseThread {...ctxFor(MAYA, "after", undefined, { draftDispute })} onFocus={onFocus} />);
    expect(within(thread()).getByText(/approved the \$200 congestion fee/).textContent).toContain("Sam · 2:05 PM");
    const card = screen.getByRole("region", { name: "Next step" });
    expect(card).toHaveTextContent("Dispute $700 with Pacific Crest Logistics: lines 1 and 6.");
    fireEvent.click(within(card).getByRole("button", { name: "Ask Sam to approve" }));
    expect(draftDispute).toHaveBeenCalled();
    fireEvent.click(within(card).getByRole("button", { name: "Review lines" }));
    expect(onFocus).toHaveBeenCalledWith({ kind: "invoice" });
  });

  it("Sam on Maya's request: Accept, or Reject with a required reason", () => {
    const accept = vi.fn(), reject = vi.fn();
    render(<CaseThread {...ctxFor(SAM, draftLocal("pending_approval", "maya"), undefined, { accept, reject })} onFocus={vi.fn()} />);
    expect(within(thread()).getByText("Maya asked you to approve a dispute: $700 with Pacific Crest Logistics, lines 1 and 6.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    expect(accept).toHaveBeenCalledWith("draft_1");
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    expect(screen.getByText(/A reason is required\./)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    expect(reject).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Why are you rejecting it?"), { target: { value: " They expedited it. " } });
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    expect(reject).toHaveBeenCalledWith("draft_1", "They expedited it.");
  });

  it("Sam on his own request: another owner decides, no buttons", () => {
    render(<CaseThread {...ctxFor(SAM, draftLocal("pending_approval", "sam"))} onFocus={vi.fn()} />);
    expect(screen.getByRole("status")).toHaveTextContent("You requested this. Another owner decides.");
    expect(screen.queryByRole("button", { name: "Accept" })).not.toBeInTheDocument();
  });

  it("after Accept: the message is ready and opens on the canvas", () => {
    const onFocus = vi.fn();
    render(<CaseThread {...ctxFor(MAYA, draftLocal("approved", "maya", { approvedBy: "sam" }))} onFocus={onFocus} />);
    expect(within(thread()).getByText("Sam accepted the dispute.")).toBeInTheDocument();
    const card = screen.getByRole("region", { name: "Next step" });
    expect(card).toHaveTextContent("The message to Pacific Crest Logistics is ready.");
    fireEvent.click(within(card).getByRole("button", { name: "Open the message" }));
    expect(onFocus).toHaveBeenCalledWith({ kind: "message", draftId: "draft_1" });
  });

  it("Leo: only what happened to documents, no amounts, no next step", () => {
    render(<CaseThread {...ctxFor(LEO, "before")} onFocus={vi.fn()} />);
    expect(within(thread()).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["4 documents added · Oct 24, 1:50 PM"]);
    expect(screen.queryByText(/\$\d/)).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("stays at its end when the list gets shorter (smaller window, taller dock), not after the person scrolled up", () => {
    let resized = () => {};
    const observe = vi.fn();
    vi.stubGlobal("ResizeObserver", class { constructor(cb: () => void) { resized = cb; } observe = observe; disconnect() {} });
    const height = vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(900);
    const client = vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(400);
    render(<CaseThread {...ctxFor(SAM, "after")} onFocus={vi.fn()} />);
    const el = thread();
    expect(observe).toHaveBeenCalledWith(el);
    // At the end (900 - 500 - 400 = 0); the window gets shorter, so the end moves: follow it.
    el.scrollTop = 500; fireEvent.scroll(el);
    client.mockReturnValue(260); el.scrollTop = 500;
    resized();
    expect(el.scrollTop).toBe(900);
    // Scrolled up to read: a resize leaves it where it is.
    el.scrollTop = 100; fireEvent.scroll(el);
    client.mockReturnValue(200);
    resized();
    expect(el.scrollTop).toBe(100);
    height.mockRestore(); client.mockRestore(); vi.unstubAllGlobals();
  });

  it("keeps the newest item in view", () => {
    const height = vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(900);
    render(<CaseThread {...ctxFor(SAM, "after")} onFocus={vi.fn()} />);
    expect(thread().scrollTop).toBe(900);
    height.mockRestore();
  });
});
