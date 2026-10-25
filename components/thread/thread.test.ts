import { describe, expect, it } from "vitest";
import { SCENARIO_A } from "@/components/case/fixture";
import { SCENARIO_B } from "@/components/demo/scenario-b/scenario-b";
import { LEO, MAYA, SAM } from "@/components/inboxes/people";
import { withDraft } from "./sample";
import { answerBlocked, dockOf, itemText, pendingFor, threadOf, type ThreadItem } from "./thread";

const PC = "Pacific Crest Logistics";
const texts = (items: ThreadItem[]) => items.map(itemText);
const kinds = (items: ThreadItem[]) => items.map((i) => i.kind);
const idle = { replaying: false };

describe("threadOf, Scenario A before the answer", () => {
  const x = SCENARIO_A.at("before");

  it("Sam: documents, the check, and the question to him with its citation and what waits on it", () => {
    const items = threadOf(x, SAM, null, PC);
    expect(kinds(items)).toEqual(["system", "agent", "agent", "question"]);
    expect(texts(items)).toEqual([
      "4 documents added · Oct 24, 1:50 PM",
      "I read the quote, the email, the WhatsApp chat and the invoice, and checked all 8 charges.",
      "5 charges match what was agreed.\nLine 1, Ocean freight 40HC Ningbo-Long Beach: $300 over. Billed $4,800. Agreed $4,500 (email, Sep 5, if booked by Sep 10; booked Sep 8). Over by $300.",
      expect.stringMatching(/^Question for you\nInvoice line 4 bills a \$200 congestion fee/),
    ]);
    const q = items[3] as Extract<ThreadItem, { kind: "question" }>;
    expect(q.cites).toEqual([{ docId: "doc_chat", source: "WhatsApp, Sep 28", quote: "possible congestion at LB terminal, may be extra" }]);
    expect(q.foot).toBe("Lines 4 and 6 · $600 wait for your answer");
    // Line 1 is a link to the line on the canvas, and its result a coloured word.
    const result = items[2] as Extract<ThreadItem, { kind: "agent" }>;
    expect(result.paras[1].slice(0, 3)).toEqual([
      { t: "line", key: "chg_1", text: "Line 1" }, { t: "text", text: ", Ocean freight 40HC Ningbo-Long Beach: " }, { t: "word", text: "$300 over", tone: "dispute" },
    ]);
  });

  it("Maya: the same question, for Sam", () => {
    const q = threadOf(x, MAYA, null, PC).find((i) => i.kind === "question") as Extract<ThreadItem, { kind: "question" }>;
    expect(q.title).toBe("Question for Sam");
    expect(q.foot).toBe("Lines 4 and 6 · $600 wait for Sam’s answer");
  });

  it("Leo: only the documents, no amounts or findings", () => {
    expect(texts(threadOf(x, LEO, null, PC))).toEqual(["4 documents added · Oct 24, 1:50 PM"]);
  });
});

describe("threadOf, Scenario A after the answer", () => {
  const x = SCENARIO_A.at("after");

  it("Maya: Sam's answer as a bubble, then what it changed and what is at stake now", () => {
    const items = threadOf(x, MAYA, null, PC);
    expect(kinds(items).slice(3)).toEqual(["question", "reply", "agent"]);
    expect(texts(items).slice(3)).toEqual([
      expect.stringMatching(/^Question for Sam · answered\n/),
      "approved the $200 congestion fee on WhatsApp, nobody agreed to $400 rush handling — Sam · 2:05 PM",
      "Sam’s answer changed 2 charges:\n· Line 4, Port congestion fee $200 → Matches. Approved by Sam.\n· Line 6, Rush handling $400 → $400 over. Sam said it was never agreed.\nAt stake is now $700.",
    ]);
    expect((items[3] as Extract<ThreadItem, { kind: "question" }>).foot).toBeUndefined();
  });

  it("Sam: his own answer, said as yours", () => {
    expect(texts(threadOf(x, SAM, null, PC)).slice(4)).toEqual([
      "approved the $200 congestion fee on WhatsApp, nobody agreed to $400 rush handling — You · 2:05 PM",
      "Your answer changed 2 charges:\n· Line 4, Port congestion fee $200 → Matches. Approved by you.\n· Line 6, Rush handling $400 → $400 over. You said it was never agreed.\nAt stake is now $700.",
    ]);
  });
});

describe("threadOf, Scenario B", () => {
  it("before: two questions, numbered, the conflict citing both sources", () => {
    const qs = threadOf(SCENARIO_B.at("before"), SAM, null).filter((i) => i.kind === "question") as Extract<ThreadItem, { kind: "question" }>[];
    expect(qs.map((q) => [q.title, q.foot])).toEqual([
      ["Question 1 for you", "Lines 10, 13, 14 and 15 · $1,665 wait for your answer"],
      ["Question 2 for you", "Line 9 · $5,850 waits for your answer"],
    ]);
    expect(qs[1].cites.map((c) => c.source)).toEqual(["Email, Sep 9", "Proforma, Sep 9"]);
  });

  it("after the vague answer: says it didn't settle, then the follow-up with the earlier answer", () => {
    const t = texts(threadOf(SCENARIO_B.at("after-q2"), SAM, null)).slice(-3);
    expect(t[0]).toBe("Lena and I went over drayage on a call last month. I'd have to check my notes. — You · 2:31 PM");
    expect(t[1]).toBe("Your answer didn’t settle it, so I asked one follow-up.");
    expect(t[2]).toMatch(/^Follow-up for you\nYour earlier answer: “Lena and I went over drayage on a call last month\. I'd have to check my notes\.”\nThanks\. To recheck line 9/);
  });

  it("after: Maya reads the last answer's change in Sam's name", () => {
    expect(texts(threadOf(SCENARIO_B.at("after"), MAYA, null)).at(-1)).toBe(
      "Sam’s answer changed 1 charge:\n· Line 9, Drayage Oakland -> Reno NV 3x40HC $5,850 → $300 over. More than Sam approved.\nAt stake is now $4,165.");
  });
});

describe("threadOf, the dispute", () => {
  it("Maya's request, from both sides", () => {
    const x = withDraft("pending_approval", "maya");
    expect(texts(threadOf(x, SAM, null, PC)).at(-1)).toBe("Maya asked you to approve a dispute: $700 with Pacific Crest Logistics, lines 1 and 6.");
    expect(texts(threadOf(x, MAYA, null, PC)).at(-1)).toBe("You asked Sam to approve a dispute: $700 with Pacific Crest Logistics, lines 1 and 6.");
  });

  it("accepted: the decision, then the message is ready", () => {
    const items = threadOf(withDraft("approved", "maya", { approvedBy: "sam" }), MAYA, null, PC);
    expect(texts(items).slice(-2)).toEqual([
      "Sam accepted the dispute.",
      "I drafted the message to Pacific Crest Logistics with the numbers from the check. Nothing is sent: you send it yourself.",
    ]);
  });

  it("rejected: the decision with its reason", () => {
    const x = withDraft("rejected", "maya", { rejectedBy: "sam", rejectionReason: "They really did expedite it." });
    expect(texts(threadOf(x, MAYA, null, PC)).at(-1)).toBe("Sam rejected the dispute. “They really did expedite it.”");
  });
});

describe("dockOf and pendingFor", () => {
  it("an open question to this person: the answer box, in the recorded order", () => {
    expect(dockOf(SCENARIO_A, SCENARIO_A.at("before"), idle, SAM)).toEqual(
      { kind: "answer", questionId: "q_1", label: undefined, replay: "In this replay CargoOS reads the recorded answer." });
    const b = SCENARIO_B.at("before");
    expect(dockOf(SCENARIO_B, b, idle, SAM)).toMatchObject({ kind: "answer", questionId: "b_q_1", label: "Answering Question 1" });
    expect(answerBlocked(SCENARIO_B, b, "b_q_2")).toBe("Answer Question 1 first. In this replay the answers play in the order they were recorded.");
    expect(pendingFor(SCENARIO_A.at("before"), SAM)).toBe(1);
    expect(pendingFor(b, SAM)).toBe(2);
  });

  it("while the answer is being read: rechecking", () => {
    expect(dockOf(SCENARIO_A, SCENARIO_A.at("answered"), { replaying: true }, SAM)).toEqual({ kind: "rechecking", text: "Rechecking with your answer…" });
  });

  it("live case: no recorded order or replay note; rechecking from the answer until the server's recheck", () => {
    const live = { ...SCENARIO_A, live: true, answers: {} };
    expect(dockOf(live, SCENARIO_A.at("before"), idle, SAM)).toEqual({ kind: "answer", questionId: "q_1", label: undefined, replay: undefined });
    expect(dockOf(live, SCENARIO_A.at("before"), idle, SAM, PC, "q_1")).toMatchObject({ kind: "rechecking" });
    expect(dockOf(live, SCENARIO_A.at("answered"), idle, SAM)).toMatchObject({ kind: "rechecking" });
    expect(dockOf(live, SCENARIO_A.at("after"), idle, SAM, PC, "q_1")).toMatchObject({ kind: "request" });
    // A replay stays on its own clock: a question still open is answerable, whatever its events say.
    expect(dockOf(SCENARIO_A, SCENARIO_A.at("before"), idle, SAM)).toMatchObject({ kind: "answer" });
  });

  it("someone else's question: a quiet line, nothing pending", () => {
    expect(dockOf(SCENARIO_A, SCENARIO_A.at("before"), idle, MAYA)).toEqual({ kind: "quiet", text: "Waiting for Sam’s answer." });
    expect(pendingFor(SCENARIO_A.at("before"), MAYA)).toBe(0);
  });

  it("a dispute ready: Maya asks Sam; Sam drafts it himself", () => {
    const x = SCENARIO_A.at("after");
    expect(dockOf(SCENARIO_A, x, idle, MAYA, PC)).toEqual({ kind: "request", button: "Ask Sam to approve",
      text: "Dispute $700 with Pacific Crest Logistics: lines 1 and 6. Sam decides; nothing goes to the seller until then." });
    expect(dockOf(SCENARIO_A, x, idle, SAM, PC)).toEqual({ kind: "request", button: "Draft dispute", text: "Dispute $700 with Pacific Crest Logistics: lines 1 and 6." });
    expect(pendingFor(x, MAYA)).toBe(1);
  });

  it("a request: Sam decides Maya's, not his own; Maya waits", () => {
    const mayas = withDraft("pending_approval", "maya");
    expect(dockOf(SCENARIO_A, mayas, idle, SAM, PC)).toEqual({ kind: "decide", draftId: "draft_1", text: "Dispute $700 with Pacific Crest Logistics: lines 1 and 6." });
    expect(dockOf(SCENARIO_A, mayas, idle, MAYA, PC)).toEqual({ kind: "quiet", text: "Waiting for Sam to accept or reject the dispute." });
    expect(pendingFor(mayas, SAM)).toBe(1);
    const own = withDraft("pending_approval", "sam");
    expect(dockOf(SCENARIO_A, own, idle, SAM, PC)).toEqual({ kind: "quiet", text: "You requested this. Another owner decides." });
    expect(pendingFor(own, SAM)).toBe(0);
  });

  it("accepted: the message is ready; rejected: the reason", () => {
    expect(dockOf(SCENARIO_A, withDraft("approved", "maya", { approvedBy: "sam" }), idle, MAYA, PC))
      .toEqual({ kind: "message", draftId: "draft_1", text: "The message to Pacific Crest Logistics is ready." });
    expect(dockOf(SCENARIO_A, withDraft("rejected", "maya", { rejectedBy: "sam", rejectionReason: "Pay it this time." }), idle, MAYA, PC))
      .toEqual({ kind: "quiet", text: "Sam rejected the dispute: “Pay it this time.”" });
  });

  it("Leo: no next step and nothing pending", () => {
    expect(dockOf(SCENARIO_A, SCENARIO_A.at("before"), idle, LEO)).toEqual({ kind: "none" });
    expect(pendingFor(SCENARIO_A.at("before"), LEO)).toBe(0);
  });
});
