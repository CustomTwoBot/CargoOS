import { describe, expect, it } from "vitest";
import { personById } from "@/lib/people";
import { SCENARIO_A } from "@/components/case/fixture";
import { groupOf, nextStep, statusOf } from "./next-step";

const SAM = personById("sam")!;
const MAYA = personById("maya")!;

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
