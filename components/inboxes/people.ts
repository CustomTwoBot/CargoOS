// TEMPORARY local model of SPEC §5.5 (pending type changes, not in lib/types.ts yet): the seeded
// people and the draft fields the approval flow needs. Replace with lib/people.ts and the real
// Draft fields once that PR merges. "uploader" is left out: Role doesn't have it yet.
import type { Draft, Role } from "@/lib/types";
import { ALL_ROLES } from "@/components/case/roles";

export type Person = { id: string; name: string; title: string; roles: readonly Role[] };

export const SAM: Person = { id: "sam", name: "Sam", title: "owner", roles: ["clerk", "ops_lead", "controller"] };
export const MAYA: Person = { id: "maya", name: "Maya", title: "bookkeeper", roles: ["clerk"] };
export const LEO: Person = { id: "leo", name: "Leo", title: "uploader", roles: [] };
export const PEOPLE: readonly Person[] = [SAM, MAYA, LEO];

/** The product default: one person holding every role (docs/design.md §0). */
export const OPERATOR: Person = { id: "you", name: "You", title: "", roles: ALL_ROLES };

export const personName = (id?: string) => PEOPLE.find((p) => p.id === id)?.name ?? (id === OPERATOR.id ? "you" : id);

/** Who CargoOS asks: the seeded person holding ops_lead. */
export const ASKED = PEOPLE.find((p) => p.roles.includes("ops_lead"))!;

/** Fields SPEC §5.5 adds to Draft (person ids). Read off a Draft that may carry them. */
export type DraftDecision = {
  requestedBy?: string; acceptedBy?: string; rejectedBy?: string; rejectedAt?: string;
  rejectionReason?: string; editedBody?: string;
};

export const decisionOf = (d: Draft): DraftDecision => d as Draft & DraftDecision;
