import { describe, expect, it } from "vitest";
import type { CaseEvent } from "@/lib/types";
import type { CaseInput } from "@/components/case/view-model";
import { draftWriteFailed } from "./draft-status";

const event = (type: CaseEvent["type"], at: string, payload: Record<string, unknown>): CaseEvent =>
  ({ _id: `${type}@${at}`, caseId: "c1", at, actor: "system", type, payload });

const caseWith = (events: CaseEvent[]) => ({ events }) as unknown as CaseInput;

const APPROVED = event("approved", "2026-10-24T21:40:00Z", { draftId: "d1", personId: "sam" });

describe("draftWriteFailed", () => {
  it("is true once drafting failed after the approval", () => {
    expect(draftWriteFailed(caseWith([APPROVED, event("extraction_failed", "2026-10-24T21:40:05Z", { stage: "draftDispute", error: "timeout" })]), "d1")).toBe(true);
  });

  it("ignores other failures, failures before the approval, and other drafts", () => {
    expect(draftWriteFailed(caseWith([APPROVED]), "d1")).toBe(false);
    expect(draftWriteFailed(caseWith([APPROVED, event("extraction_failed", "2026-10-24T21:40:05Z", { stage: "planQuestion" })]), "d1")).toBe(false);
    expect(draftWriteFailed(caseWith([event("extraction_failed", "2026-10-24T21:30:00Z", { stage: "draftDispute" }), APPROVED]), "d1")).toBe(false);
    expect(draftWriteFailed(caseWith([APPROVED, event("extraction_failed", "2026-10-24T21:40:05Z", { stage: "draftDispute" })]), "d2")).toBe(false);
  });
});
