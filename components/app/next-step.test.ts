import { describe, expect, it } from "vitest";
import { personById } from "@/lib/people";
import { SCENARIO_A } from "@/components/case/fixture";
import { groupOf, nextStep, statusOf } from "./next-step";

const SAM = personById("sam")!;
const MAYA = personById("maya")!;

describe("reading, and a bill with no invoice lines", () => {
  const start = SCENARIO_A.at(SCENARIO_A.start);

  it("every document read but no charges: says what's missing instead of reading forever", () => {
    const x = { ...start, charges: [], findings: [] };
    const step = nextStep(x, SAM);
    expect(step.kind).toBe("noLines");
    expect(groupOf(step, SAM)).toBe("check");
    expect(statusOf(x, step)).toMatchObject({ label: "No invoice lines yet", sub: "Add the invoice, or check it's marked as Invoice" });
  });

  it("keeps the spinner while a document is still reading, or while the first check of the charges lands", () => {
    const reading = { ...start, charges: [], findings: [], documents: [{ ...start.documents[0], readStatus: "reading" as const }, ...start.documents.slice(1)] };
    expect(nextStep(reading, SAM)).toMatchObject({ kind: "reading", total: start.documents.length, read: start.documents.length - 1 });
    expect(nextStep({ ...start, findings: [] }, SAM).kind).toBe("reading");
  });
});

describe("who asks for approval (CLAUDE.md rule 8)", () => {
  // Scenario A after the answer: $700 on hold, no question open, nothing requested yet.
  const after = SCENARIO_A.at(SCENARIO_A.end);

  it("the bookkeeper asks", () => {
    expect(nextStep(after, MAYA).kind).toBe("request");
  });

  it("the owner waits for the bookkeeper instead of asking themselves", () => {
    const step = nextStep(after, SAM);
    expect(step.kind).toBe("waitRequest");
    expect(groupOf(step, SAM)).toBe("waiting");
    expect(statusOf(after, step)).toMatchObject({ label: "Waiting for Maya to ask", sub: "$700 on hold" });
  });
});
