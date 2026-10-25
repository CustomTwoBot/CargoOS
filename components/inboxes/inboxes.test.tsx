import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SCENARIO_A, scenarioAAt } from "@/components/case/fixture";
import { ApprovalsInbox } from "./approvals-inbox";
import { approvalItems, questionItems } from "./items";
import { QuestionsInbox } from "./questions-inbox";
import { allAsking, CASE_B, caseB, inboxCase, scenarioAWithDraft } from "./sample";

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

  it("a screen without ops lead reads the question but gets no answer box", () => {
    render(<QuestionsInbox items={questionItems(allAsking())} onOpen={vi.fn()} onReply={vi.fn()} now={NOW} roles={["clerk"]} />);
    expect(screen.getByRole("region", { name: "Question" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Your answer")).not.toBeInTheDocument();
  });
});

describe("ApprovalsInbox", () => {
  afterEach(cleanup);
  const drafted = () => approvalItems([inboxCase(SCENARIO_A, scenarioAWithDraft()), inboxCase(CASE_B, caseB("drafted"))]);

  it("lists drafts waiting for approval with forwarder, total, lines and when drafted", () => {
    render(<ApprovalsInbox items={drafted()} onOpen={vi.fn()} onApprove={vi.fn()} now={NOW} />);
    expect(screen.getByText("2 waiting")).toBeInTheDocument();
    const rows = items("Waiting for approval");
    expect(within(rows[0]).getByText("Bayline 20GP Yantian-Oakland")).toBeInTheDocument();
    expect(within(rows[0]).getByText("$400")).toBeInTheDocument();
    expect(within(rows[0]).getByText("Pacific Crest Logistics · 1 line")).toBeInTheDocument();
    expect(within(rows[1]).getByText("Pacific Crest Logistics · 2 lines")).toBeInTheDocument();
    expect(within(rows[1]).getByText("Drafted 1 hour ago")).toBeInTheDocument();
  });

  it("selecting one shows the email; Approve sends case and draft", () => {
    const onApprove = vi.fn(), onOpen = vi.fn();
    render(<ApprovalsInbox items={drafted()} onOpen={onOpen} onApprove={onApprove} now={NOW} />);
    fireEvent.click(items("Waiting for approval")[1]);
    const email = screen.getByRole("region", { name: "Dispute email" });
    expect(within(email).getByText("Invoice PCL-INV-1012: 2 disputed lines ($700)")).toBeInTheDocument();
    expect(within(email).getByText("Line 1 +$300, Line 6 +$400")).toBeInTheDocument();
    expect(within(screen.getByRole("complementary", { name: "Approval" })).getByText("$700")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    expect(onApprove).toHaveBeenCalledWith("case_A", "draft_1");
    fireEvent.click(screen.getByRole("button", { name: "Open case" }));
    expect(onOpen).toHaveBeenCalledWith("case_A", "draft_1");
  });

  it("approved ones say nothing was sent and offer no Approve", () => {
    const cases = [inboxCase(SCENARIO_A, scenarioAWithDraft(true)), inboxCase(CASE_B, caseB("drafted"))];
    render(<ApprovalsInbox items={approvalItems(cases)} onOpen={vi.fn()} onApprove={vi.fn()} now={NOW} />);
    expect(screen.getByText("1 waiting")).toBeInTheDocument();
    const done = items("Approved");
    expect(within(done[0]).getByText(/Approved today at 2:10 PM\. Nothing was sent\./)).toBeInTheDocument();
    fireEvent.click(done[0]);
    expect(screen.getByText("Approved. Nothing was sent.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
  });

  it("empty: says how a dispute gets here", () => {
    render(<ApprovalsInbox items={[]} onOpen={vi.fn()} onApprove={vi.fn()} now={NOW} />);
    expect(screen.getByText("No disputes waiting for approval.")).toBeInTheDocument();
    expect(screen.getByText(/once you draft it in a case/)).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Dispute email" })).not.toBeInTheDocument();
  });

  it("a screen without controller sees the email but no Approve", () => {
    render(<ApprovalsInbox items={drafted()} onOpen={vi.fn()} onApprove={vi.fn()} now={NOW} roles={["clerk", "ops_lead"]} />);
    expect(screen.getByRole("region", { name: "Dispute email" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
  });
});
