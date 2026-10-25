// Types from SPEC.md 5.3 that lib/types.ts doesn't define yet.
// TODO(team): move into lib/types.ts after a team message; they are the 5.3 contracts.
import type { Case, Charge, Fact, Finding, Question, SourceDoc } from "../types";

export type NewFact = Omit<Fact, "_id" | "caseId" | "supersedes">;
export type NewCharge = Omit<Charge, "_id" | "caseId">;
// Code fills _id, caseId, status ("open") and createdAt when saving.
export type NewQuestion = Omit<Question, "_id" | "caseId" | "status" | "createdAt">;

export interface CaseState {
  case: Case;
  documents: SourceDoc[];
  facts: Fact[];
  charges: Charge[];
  findings: Finding[];
  questions: Question[];
}
