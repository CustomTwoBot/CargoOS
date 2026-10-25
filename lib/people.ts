// The fixed list of seeded people (SPEC.md 5.5). Each screen is set to one of them; there is no login
// and no people table. Shared contract: change only after a team message.
import type { Person, Role } from "./types";

export const PEOPLE: readonly Person[] = [
  { id: "maya", name: "Maya — bookkeeper", roles: ["clerk", "uploader"] },
  { id: "sam", name: "Sam — owner", roles: ["clerk", "ops_lead", "controller", "uploader"] },
  { id: "leo", name: "Leo — uploader", roles: ["uploader"] },
];

export const personById = (id: string): Person | undefined => PEOPLE.find((p) => p.id === id);

export const holdsRole = (personId: string, role: Role): boolean => personById(personId)?.roles.includes(role) ?? false;
