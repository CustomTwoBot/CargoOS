import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SCENARIO_A, scenarioAAt } from "@/components/case/fixture";
import { ApprovalsInbox } from "./approvals-inbox";
import { approvalItems, questionItems } from "./items";
import { QuestionsInbox } from "./questions-inbox";
import { MAYA, SAM } from "./people";
import { allAsking, CASE_B, caseB, DEMO_REJECTION, inboxCase, scenarioAWithDraft } from "./sample";

const NOW = new Date("2026-10-24T15:55:00-07:00");
const list = (name: string) => screen.getByRole("list", { name });
const items = (name: string) => within(list(name)).getAllByRole("button");

describe("QuestionsInbox", () => {
  afterEach(cleanup);

  it("lists open questions oldest first, with case, lines and how long each has waited", () => {
    render(<QuestionsInbox items={questionItems(allAsking())} onOpen={vi.fn()} onReply={vi.fn()} now={NOW} />);
    expect(screen.getByText("3 waiting")).toBeInTheDocument();
    const rows = items("Waiting for your answer");
    expect(rows.map((r) => r.textContent?.slice(0, 40))).toEqual([
      expect.stringContaining("Bayline 20GP Yantian-Oakland"),
      expect.stringContaining("Bayline 20GP Yantian-Oakland"),
      expect.stringContaining("Bayline 40HC Ningbo-LB"),
    ]);
    expect(within(rows[0]).getByText("Asked yesterday")).toBeInTheDocument();
    expect(within(rows[2]).getByText("Asked 2 hours ago")).toBeInTheDocument();
    expect(within(rows[2]).getByText("Rush handling")).toBeInTheDocument();
    expect(within(rows[2]).getByText("$400")).toBeInTheDocument();
    // The oldest is shown next to the list without a click.
    expect(rows[0]).toHaveAttribute("aria-current", "true");
    expect(within(screen.getByRole("region", { name: "Question" })).getByText(/\$200 port congestion fee/)).toBeInTheDocument();
  });

  it("selecting a question shows it in full with the answer box; Reply sends case, question and text", () => {
    const onReply = vi.fn(), onOpen = vi.fn();
    render(<QuestionsInbox items={questionItems(allAsking())} onOpen={onOpen} onReply={onReply} now={NOW} />);
    fireEvent.click(items("Waiting for your answer")[2]);
    const q = screen.getByRole("region", { name: "Question" });
    expect(within(q).getByText(/Did anyone agree to either charge\?/)).toBeInTheDocument();
    expect(within(q).getByText("Asked today at 1:55 PM. $600 is waiting on this answer.")).toBeInTheDocument();
    expect(screen.getByText(/lines 4 and 6 are rechecked/)).toBeInTheDocument();
    expect(screen.getByText("possible congestion at LB terminal, may be extra")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Reply" }));
    expect(onReply).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Your answer"), { target: { value: "  approved congestion, not rush handling " } });
    fireEvent.click(screen.getByRole("button", { name: "Reply" }));
    expect(onReply).toHaveBeenCalledWith("case_A", "q_1", "approved congestion, not rush handling");

    fireEvent.click(screen.getByRole("button", { name: "Open case" }));
    expect(onOpen).toHaveBeenCalledWith("case_A", "q_1");
  });

  it("answered questions sit in a quiet Answered section with the answer quoted", () => {
    const cases = [inboxCase(SCENARIO_A, scenarioAAt("after")), inboxCase(CASE_B, caseB("one_answered"))];
    render(<QuestionsInbox items={questionItems(cases)} onOpen={vi.fn()} onReply={vi.fn()} now={NOW} />);
    expect(screen.getByText("1 waiting")).toBeInTheDocument();
    const answered = items("Answered");
    expect(answered).toHaveLength(2);
    expect(within(answered[0]).getByText(/“approved the \$200 congestion fee on WhatsApp/)).toBeInTheDocument();

    fireEvent.click(answered[0]);
    const q = screen.getByRole("region", { name: "Question" });
    expect(within(q).getByText("Answered")).toBeInTheDocument();
    expect(within(q).getByText("Answered today at 2:05 PM.")).toBeInTheDocument();
    expect(within(q).queryByLabelText("Your answer")).not.toBeInTheDocument();
    expect(screen.getByText("Where these charges stand now")).toBeInTheDocument();
  });

  it("an item that moves to Answered after Reply stays selected and shows your answer", () => {
    const before = questionItems([inboxCase(SCENARIO_A, scenarioAAt("before"))]);
    const after = questionItems([inboxCase(SCENARIO_A, scenarioAAt("after"))]);
    const { rerender } = render(<QuestionsInbox items={before} onOpen={vi.fn()} onReply={vi.fn()} now={NOW} />);
    fireEvent.change(screen.getByLabelText("Your answer"), { target: { value: "approved congestion" } });
    fireEvent.click(screen.getByRole("button", { name: "Reply" }));
    rerender(<QuestionsInbox items={after} onOpen={vi.fn()} onReply={vi.fn()} now={NOW} />);
    expect(screen.getByText("No questions waiting.")).toBeInTheDocument();
    expect(items("Answered")[0]).toHaveAttribute("aria-current", "true");
    expect(screen.getByText(/“approved the \$200 congestion fee/, { selector: "blockquote" })).toBeInTheDocument();
  });

  it("empty: says why there is nothing to answer", () => {
    render(<QuestionsInbox items={[]} onOpen={vi.fn()} onReply={vi.fn()} now={NOW} />);
    expect(screen.getByText("None waiting")).toBeInTheDocument();
    expect(screen.getByText("No questions waiting.")).toBeInTheDocument();
    expect(screen.getByText("CargoOS asks only when the documents can't settle a charge.")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Question" })).not.toBeInTheDocument();
  });

  it("Maya (no ops lead) sees the question as waiting for Sam, with no answer box", () => {
    render(<QuestionsInbox items={questionItems(allAsking())} onOpen={vi.fn()} onReply={vi.fn()} now={NOW} viewer={MAYA} />);
    const q = screen.getByRole("region", { name: "Question" });
    expect(within(q).getByText("CargoOS asked Sam")).toBeInTheDocument();
    expect(within(q).getByText("Waiting for Sam")).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Waiting for Sam" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Your answer")).not.toBeInTheDocument();
  });

  it("Sam (owner) is asked directly", () => {
    render(<QuestionsInbox items={questionItems(allAsking())} onOpen={vi.fn()} onReply={vi.fn()} now={NOW} viewer={SAM} />);
    expect(screen.getByText("CargoOS asked you")).toBeInTheDocument();
    expect(screen.getByLabelText("Your answer")).toBeInTheDocument();
  });
});

describe("ApprovalsInbox", () => {
  afterEach(cleanup);
  const requested = () => approvalItems([inboxCase(SCENARIO_A, scenarioAWithDraft()), inboxCase(CASE_B, caseB("drafted"))]);
  const props = { onOpen: vi.fn(), onAccept: vi.fn(), onReject: vi.fn(), now: NOW };

  it("lists requests to decide with forwarder, total, lines and who requested them", () => {
    render(<ApprovalsInbox items={requested()} {...props} viewer={SAM} />);
    expect(screen.getByText("2 to decide")).toBeInTheDocument();
    const rows = items("Waiting for a decision");
    expect(within(rows[0]).getByText("Bayline 20GP Yantian-Oakland")).toBeInTheDocument();
    expect(within(rows[0]).getByText("$400")).toBeInTheDocument();
    expect(within(rows[0]).getByText("Pacific Crest Logistics · 1 line")).toBeInTheDocument();
    expect(within(rows[1]).getByText("Requested by Maya, 1 hour ago")).toBeInTheDocument();
  });

  it("the owner sees chips with the numbers, then Accept sends case and draft", () => {
    const onAccept = vi.fn(), onOpen = vi.fn();
    render(<ApprovalsInbox items={requested()} {...props} onAccept={onAccept} onOpen={onOpen} viewer={SAM} />);
    fireEvent.click(items("Waiting for a decision")[1]);
    const lines = screen.getByRole("region", { name: "Lines to dispute" });
    expect(within(lines).getByText("Agreed $4,500 → Billed $4,800 (+$300)")).toBeInTheDocument();
    expect(within(lines).getByText("You said it was never agreed · $400")).toBeInTheDocument();
    const decision = screen.getByRole("complementary", { name: "Decision" });
    expect(within(decision).getByText("$700")).toBeInTheDocument();
    expect(within(decision).getByText("Requested by Maya, 2:07 PM.")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Message to the seller" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    expect(onAccept).toHaveBeenCalledWith("case_A", "draft_1");
    fireEvent.click(screen.getByRole("button", { name: "Open case" }));
    expect(onOpen).toHaveBeenCalledWith("case_A", "draft_1");
  });

  it("Reject needs a reason, then sends it; Cancel goes back", () => {
    const onReject = vi.fn();
    render(<ApprovalsInbox items={requested()} {...props} onReject={onReject} viewer={SAM} />);
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    expect(screen.getByText(/A reason is required\. It goes back to Maya\. Nothing goes to the seller\./)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    expect(onReject).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Why are you rejecting it?"), { target: { value: ` ${DEMO_REJECTION} ` } });
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    expect(onReject).toHaveBeenCalledWith("case_B", "draft_B", DEMO_REJECTION);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("button", { name: "Accept" })).toBeInTheDocument();
  });

  it("whoever requested it can't accept it", () => {
    const onAccept = vi.fn();
    const mine = approvalItems([inboxCase(SCENARIO_A, scenarioAWithDraft("requested", "sam"))]);
    render(<ApprovalsInbox items={mine} {...props} onAccept={onAccept} viewer={SAM} />);
    const accept = screen.getByRole("button", { name: "Accept" });
    expect(accept).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByText("You requested this, so you can't approve it.")).toBeInTheDocument();
    expect(screen.getByText("Requested by you, 2:07 PM.")).toBeInTheDocument();
    fireEvent.click(accept);
    expect(onAccept).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Reject" })).not.toBeInTheDocument();
  });

  it("Maya (no controller) sees the request waiting for Sam, with no Accept or Reject", () => {
    render(<ApprovalsInbox items={requested()} {...props} viewer={MAYA} />);
    expect(screen.getByText("Waiting for Sam to decide.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Accept" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reject" })).not.toBeInTheDocument();
    expect(within(items("Waiting for a decision")[0]).getByText(/Requested by you/)).toBeInTheDocument();
  });

  it("accepted: the message to the seller with locked numbers, Export PDF and Copy text, nothing sent", async () => {
    const print = vi.fn();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const cases = [inboxCase(SCENARIO_A, scenarioAWithDraft("accepted")), inboxCase(CASE_B, caseB("drafted"))];
    render(<ApprovalsInbox items={approvalItems(cases)} {...props} viewer={SAM} print={print} />);
    expect(screen.getByText("1 to decide")).toBeInTheDocument();
    const done = items("Decided");
    expect(within(done[0]).getByText("Accepted by you, 2:10 PM")).toBeInTheDocument();
    fireEvent.click(done[0]);
    expect(screen.getByText("Accepted by you, 2:10 PM. Nothing was sent.")).toBeInTheDocument();
    const msg = screen.getByRole("region", { name: "Message to the seller" });
    expect(within(msg).getByRole("textbox", { name: "Message" })).toHaveAttribute("contenteditable", "true");
    const locked = [...msg.querySelectorAll("[data-locked]")].map((c) => c.textContent);
    expect(locked).toEqual(expect.arrayContaining(["$700", "Line 1", "$4,800", "$300", "Line 6", "$400"]));
    msg.querySelectorAll("[data-locked]").forEach((c) => expect(c).toHaveAttribute("contenteditable", "false"));
    expect(within(msg).getByText("CargoOS never sends this. You send it yourself.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /send/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Export PDF" }));
    expect(print.mock.calls[0][0]).toContain("Invoice PCL-INV-1012: 2 disputed lines ($700)");
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Copy text" })); });
    expect(writeText.mock.calls[0][0]).toMatch(/^Subject: Invoice PCL-INV-1012: 2 disputed lines \(\$700\)\n\nHi Derek,/);
    expect(screen.getByText("Copied.")).toBeInTheDocument();
  });

  it("rejected: the reason, and that it went back to Maya", () => {
    render(<ApprovalsInbox items={approvalItems([inboxCase(SCENARIO_A, scenarioAWithDraft("rejected"))])} {...props} viewer={MAYA} />);
    expect(screen.getByText("No requests waiting.")).toBeInTheDocument();
    fireEvent.click(items("Decided")[0]);
    expect(screen.getByText("Rejected by Sam:")).toBeInTheDocument();
    expect(screen.getByText(`“${DEMO_REJECTION}”`)).toBeInTheDocument();
    expect(screen.getByText("It went back to you. Nothing went to the seller.")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Message to the seller" })).not.toBeInTheDocument();
  });

  it("empty: says how a request gets here", () => {
    render(<ApprovalsInbox items={[]} {...props} />);
    expect(screen.getByText("No requests waiting.")).toBeInTheDocument();
    expect(screen.getByText(/when someone requests approval/)).toBeInTheDocument();
    expect(screen.queryByRole("complementary", { name: "Decision" })).not.toBeInTheDocument();
  });
});
