import { describe, expect, it } from "vitest";
import { personById } from "@/lib/people";
import { nextStep } from "@/components/app/next-step";
import { trackOf } from "@/components/bill/models";
import { SCENARIO_A } from "./fixture";
import { openQuestions } from "./issues";
import { casePill, isWaitingQuestion, type CaseInput } from "./view-model";

const SAM = personById("sam")!;
const MAYA = personById("maya")!;

// Scenario A before the answer: one open question about lines 4 and 6, both waiting.
const start = SCENARIO_A.at(SCENARIO_A.start);
const question = start.questions.find((q) => q.status === "open")!;

/** The same bill after a document (not a reply) settled the question's lines: still no answer on record. */
function settledByDocument(x: CaseInput): CaseInput {
  return {
    ...x,
    findings: x.findings.map((f) => (question.findingKeys.includes(f.key) && f.revision === x.case.revision
      ? { ...f, status: "supported" as const, ruleId: "R8_APPROVED" as const, expectedCents: f.billedCents }
      : f)),
  };
}

describe("an open question waits only while one of its lines does", () => {
  it("waits while its lines wait", () => {
    expect(isWaitingQuestion(start, question)).toBe(true);
    expect(openQuestions(start)).toEqual([question]);
    expect(nextStep(start, SAM).kind).toBe("answer");
    expect(casePill(start).label).toBe("Waiting for your answer");
  });

  it("a document that settles every line leaves nothing to answer, so the bookkeeper can ask for approval", () => {
    const x = settledByDocument(start);
    expect(question.status).toBe("open");
    expect(isWaitingQuestion(x, question)).toBe(false);
    expect(openQuestions(x)).toEqual([]);
    expect(nextStep(x, MAYA).kind).toBe("request");
    expect(nextStep(x, SAM).kind).toBe("waitRequest");
    expect(casePill(x).label).not.toBe("Waiting for your answer");
  });

  it("the track says a document settled it, not that the owner answered", () => {
    const x = settledByDocument(start);
    const answer = trackOf(x, nextStep(x, MAYA), "Pacific Crest Logistics").find((s) => s.key === "answer");
    expect(answer).toMatchObject({ title: "Settled by a document", state: "done" });
  });

  it("an answered question never waits", () => {
    expect(isWaitingQuestion(start, { ...question, status: "answered" })).toBe(false);
  });
});
