import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SCENARIO_A, scenarioAAt } from "@/components/case/fixture";
import { SCENARIO_B } from "@/components/demo/scenario-b/scenario-b";
import { ApprovalsInbox } from "./approvals-inbox";
import { approvalItems, questionItems } from "./items";
import { QuestionsInbox } from "./questions-inbox";
import { MAYA, SAM } from "./people";
import { allAsking, CASE_B, caseB, DEMO_REJECTION, inboxCase, scenarioAWithDraft } from "./sample";

const NOW = new Date("2026-10-24T15:55:00-07:00");
const list = (name: string) => screen.getByRole("list", { name });
const items = (name: string) => within(list(name)).getAllByRole("button");
const unfold = (name: RegExp) => fireEvent.click(screen.getByRole("button", { name }));

/** Below 1024px: the screen shows the list or the detail, not both. */
function narrow() {
  const query = { matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() };
  Object.defineProperty(window, "matchMedia", { value: vi.fn(() => query), configurable: true, writable: true });
}
afterEach(() => { Reflect.deleteProperty(window, "matchMedia"); });

describe("QuestionsInbox", () => {
  afterEach(cleanup);

  it("lists open questions oldest first, light: case, charges and amount, how long each has waited, no question text", () => {
    const all = questionItems(allAsking());
    render(<QuestionsInbox items={all} onOpen={vi.fn()} onReply={vi.fn()} now={NOW} />);
    expect(screen.getByText("3 waiting")).toBeInTheDocument();
    const rows = items("Waiting for your answer");
    expect(rows.map((r) => r.textContent)).toEqual([
      "Unanswered: Bayline 20GP Yantian-Oakland1 charge · $200 · yesterday",
      "Unanswered: Bayline 20GP Yantian-Oakland1 charge · $400 · 7 hours ago",
      "Unanswered: Bayline 40HC Ningbo-LB2 charges · $600 · 2 hours ago",
    ]);
    for (const q of all) expect(list("Waiting for your answer")).not.toHaveTextContent(q.text);
    // The oldest is shown next to the list without a click, with its question in full.
    expect(rows[0]).toHaveAttribute("aria-current", "true");
    expect(within(screen.getByRole("region", { name: "Question" })).getByText(/\$200 port congestion fee/)).toBeInTheDocument();
  });

  it("selecting a question shows it in full with the answer box; Reply sends case, question and text", () => {
    const onReply = vi.fn(), onOpen = vi.fn();
    render(<QuestionsInbox items={questionItems(allAsking())} onOpen={onOpen} onReply={onReply} now={NOW} />);
    fireEvent.click(items("Waiting for your answer")[2]);
    const q = screen.getByRole("region", { name: "Question" });
    expect(within(q).getByText(/Did anyone agree to either charge\?/)).toBeInTheDocument();
    expect(screen.getByText("Asked today at 1:55 PM · $600 is waiting on this answer")).toBeInTheDocument();
    const lines = within(q).getByRole("list", { name: "Charges it covers" });
    expect([...lines.querySelectorAll("li")].map((l) => l.textContent)).toEqual(["4Port congestion feeNo agreement$200", "6Rush handlingNo agreement$400"]);
    expect(within(q).getByText(/Your answer becomes evidence and lines 4 and 6 are rechecked\. Nothing is paid or sent\./)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Reply" }));
    expect(onReply).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Your answer"), { target: { value: "  approved congestion, not rush handling " } });
    fireEvent.click(screen.getByRole("button", { name: "Reply" }));
    expect(onReply).toHaveBeenCalledWith("case_A", "q_1", "approved congestion, not rush handling");

    fireEvent.click(screen.getByRole("button", { name: "Open case" }));
    expect(onOpen).toHaveBeenCalledWith("case_A", "q_1");
  });

  it("answered questions fold into Answered (n) at the bottom; one opens with the answer quoted and where its lines stand", () => {
    const cases = [inboxCase(SCENARIO_A, scenarioAAt("after")), inboxCase(CASE_B, caseB("one_answered"))];
    render(<QuestionsInbox items={questionItems(cases)} onOpen={vi.fn()} onReply={vi.fn()} now={NOW} />);
    expect(screen.getByText("1 waiting")).toBeInTheDocument();
    const fold = screen.getByRole("button", { name: /^Answered \(2\)$/ });
    expect(fold).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("list", { name: "Answered" })).not.toBeInTheDocument();
    fireEvent.click(fold);
    const answered = items("Answered");
    expect(answered.map((r) => r.textContent)).toEqual([
      "Bayline 40HC Ningbo-LB2 charges · $600 · answered 1 hour ago",
      "Bayline 20GP Yantian-Oakland1 charge · $200 · answered 5 hours ago",
    ]);

    fireEvent.click(answered[0]);
    const q = screen.getByRole("region", { name: "Question" });
    expect(within(q).getByText("Answered")).toBeInTheDocument();
    expect(within(q).getByText("“approved the $200 congestion fee on WhatsApp, nobody agreed to $400 rush handling”")).toBeInTheDocument();
    expect(within(q).getByText("Answered today at 2:05 PM.")).toBeInTheDocument();
    expect(within(q).queryByLabelText("Your answer")).not.toBeInTheDocument();
    const stand = within(q).getByRole("list", { name: "Where these charges stand now" });
    expect([...stand.querySelectorAll("li")].map((l) => l.textContent)).toEqual([
      "4Port congestion feeApproved by you$200", "6Rush handlingYou said it was never agreed$400",
    ]);
    fireEvent.click(screen.getByRole("button", { name: /^Answered \(2\)$/ }));
    expect(screen.queryByRole("list", { name: "Answered" })).not.toBeInTheDocument();
  });

  it("what the chat said stays folded until asked for", () => {
    render(<QuestionsInbox items={questionItems([inboxCase(SCENARIO_A, scenarioAAt("before"))])} onOpen={vi.fn()} onReply={vi.fn()} now={NOW} />);
    const show = screen.getByRole("button", { name: "Show what the chat said" });
    expect(show).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("possible congestion at LB terminal, may be extra")).not.toBeInTheDocument();
    fireEvent.click(show);
    expect(screen.getByText("possible congestion at LB terminal, may be extra")).toBeInTheDocument();
    expect(screen.getByText("The closest mention, not an agreement to pay.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Hide what the chat said" }));
    expect(screen.queryByText("possible congestion at LB terminal, may be extra")).not.toBeInTheDocument();
  });

  it("when the sources disagree: one chip per line says so, and each source shows behind one link", () => {
    render(<QuestionsInbox items={questionItems([inboxCase(SCENARIO_B, SCENARIO_B.at("before"))])} onOpen={vi.fn()} onReply={vi.fn()} now={NOW} />);
    fireEvent.click(items("Waiting for your answer")[1]);
    const q = screen.getByRole("region", { name: "Question" });
    expect(within(q).getByText("Sources disagree")).toBeInTheDocument();
    fireEvent.click(within(q).getByRole("button", { name: "Show what each source says" }));
    expect(within(q).getByText("Email: RE: Q-KBL-0903 revised rates")).toBeInTheDocument();
    expect(within(q).getByText("Proforma PF-KBL-0909")).toBeInTheDocument();
    expect(within(q).getByText("They disagree, so CargoOS asks you instead of picking one.")).toBeInTheDocument();
    expect(within(q).queryByText(/not an agreement to pay/)).not.toBeInTheDocument();
  });

  it("a follow-up shows the earlier answer it follows up on, in one quoted line", () => {
    const all = questionItems([inboxCase(SCENARIO_B, SCENARIO_B.at("after-q2"))]);
    render(<QuestionsInbox items={all} onOpen={vi.fn()} onReply={vi.fn()} now={NOW} />);
    const [row] = items("Waiting for your answer");
    expect(row).toHaveTextContent(/^Unanswered: Juniper Peak .*Follow-up · 1 charge · \$5,850 · /);
    const q = screen.getByRole("region", { name: "Question" });
    expect(within(q).getByText("CargoOS asked you a follow-up")).toBeInTheDocument();
    expect(within(q).getByText("Your earlier answer: “Lena and I went over drayage on a call last month. I'd have to check my notes.”"))
      .toHaveClass("truncate");
  });

  it("in replay, says the recorded answer is read, and keeps the recorded order", () => {
    render(<QuestionsInbox items={questionItems([inboxCase(SCENARIO_B, SCENARIO_B.at("before"))])} onOpen={vi.fn()} onReply={vi.fn()} now={NOW} />);
    expect(screen.getByText(/Replay of a recorded run: CargoOS reads the recorded answer\./)).toBeInTheDocument();
    fireEvent.click(items("Waiting for your answer")[1]);
    expect(screen.getByText("Answer Question 1 in this case first. In this replay the answers play in the order they were recorded.")).toBeInTheDocument();
    expect(screen.queryByLabelText("Your answer")).not.toBeInTheDocument();
  });

  it("narrow: the list alone, a question full width with a way back, then the list again", () => {
    narrow();
    render(<QuestionsInbox items={questionItems(allAsking())} onOpen={vi.fn()} onReply={vi.fn()} now={NOW} />);
    expect(screen.queryByRole("region", { name: "Question" })).not.toBeInTheDocument();
    fireEvent.click(items("Waiting for your answer")[2]);
    expect(screen.queryByRole("list", { name: "Waiting for your answer" })).not.toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Question" })).getByText(/Did anyone agree to either charge\?/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Back to questions" }));
    expect(screen.queryByRole("region", { name: "Question" })).not.toBeInTheDocument();
    expect(items("Waiting for your answer")[2]).toHaveAttribute("aria-current", "true");
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
    expect(within(q).queryByText("Waiting for your answer")).not.toBeInTheDocument();
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

  it("lists requests to decide in the same light shape: case, total and lines, when it was requested", () => {
    render(<ApprovalsInbox items={requested()} {...props} viewer={SAM} />);
    expect(screen.getByText("2 to decide")).toBeInTheDocument();
    expect(items("Waiting for a decision").map((r) => r.textContent)).toEqual([
      "To decide: Bayline 20GP Yantian-Oakland$400 · 1 line · requested 4 hours ago",
      "To decide: Bayline 40HC Ningbo-LB$700 · 2 lines · requested 1 hour ago",
    ]);
    expect(screen.getByText("$400 · 1 line · Pacific Crest Logistics")).toBeInTheDocument();
  });

  it("narrow: the list alone, a request full width with a way back", () => {
    narrow();
    render(<ApprovalsInbox items={requested()} {...props} viewer={SAM} />);
    expect(screen.queryByRole("complementary", { name: "Decision" })).not.toBeInTheDocument();
    fireEvent.click(items("Waiting for a decision")[1]);
    expect(within(screen.getByRole("complementary", { name: "Decision" })).getByText("$700")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Back to approvals" }));
    expect(items("Waiting for a decision")).toHaveLength(2);
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

  it("a request that moves to Decided after Accept stays selected, with Decided unfolded", () => {
    const { rerender } = render(<ApprovalsInbox items={approvalItems([inboxCase(SCENARIO_A, scenarioAWithDraft())])} {...props} viewer={SAM} />);
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    rerender(<ApprovalsInbox items={approvalItems([inboxCase(SCENARIO_A, scenarioAWithDraft("accepted"))])} {...props} viewer={SAM} />);
    expect(screen.getByRole("button", { name: /^Decided \(1\)$/ })).toHaveAttribute("aria-expanded", "true");
    expect(items("Decided")[0]).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("region", { name: "Message to the seller" })).toBeInTheDocument();
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
    expect(screen.getByText("Requested by you, 11:40 AM.")).toBeInTheDocument();
  });

  it("accepted: the message to the seller with locked numbers, Export PDF and Copy text, nothing sent", async () => {
    const print = vi.fn();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const cases = [inboxCase(SCENARIO_A, scenarioAWithDraft("accepted")), inboxCase(CASE_B, caseB("drafted"))];
    render(<ApprovalsInbox items={approvalItems(cases)} {...props} viewer={SAM} print={print} />);
    expect(screen.getByText("1 to decide")).toBeInTheDocument();
    unfold(/^Decided \(1\)$/);
    const done = items("Decided");
    expect(done[0]).toHaveTextContent("Bayline 40HC Ningbo-LB$700 · 2 lines · accepted 2:10 PM");
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
    unfold(/^Decided \(1\)$/);
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
