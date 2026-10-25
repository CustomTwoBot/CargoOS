// The inboxes' view of the seeded people (lib/people.ts, SPEC §5.5): who a person id is, how to call
// them on screen, and who CargoOS asks. Each screen is set to one Person (docs/design.md §0.3).
import { PEOPLE, personById } from "@/lib/people";
import type { Person } from "@/lib/types";

export type { Person };

export const SAM: Person = personById("sam")!;
export const MAYA: Person = personById("maya")!;
export const LEO: Person = personById("leo")!;

/** "Sam" from "Sam — owner". */
export const firstName = (p: Person) => p.name.split(" — ")[0];

/** Old one-operator id; case-store wrote it before drafts carried the viewer's id. Read as the viewer. */
const LEGACY_SELF = "you";

/** "you" for the viewer, else the person's first name ("someone" when unknown). */
export const who = (id: string | undefined, viewer: Person) => {
  if (id && (id === viewer.id || id === LEGACY_SELF)) return "you";
  const p = id ? personById(id) : undefined;
  return p ? firstName(p) : "someone";
};

/** The seeded person with this id; the old one-operator id reads as Sam (who held every role). */
export const personOf = (id: string | undefined): Person | undefined =>
  id === LEGACY_SELF ? SAM : id ? personById(id) : undefined;

/** Who CargoOS asks: the seeded person holding ops_lead (Sam). */
export const ASKED: Person = PEOPLE.find((p) => p.roles.includes("ops_lead"))!;

/** Who decides approvals: the seeded person holding controller (Sam). */
export const DECIDER: Person = PEOPLE.find((p) => p.roles.includes("controller"))!;

/**
 * @deprecated The screen's person comes from Settings now; pass `viewer` instead. Kept as Sam (the
 * default person, every role) so callers that haven't switched yet still compile.
 */
export const OPERATOR: Person = SAM;

/**
 * @deprecated Fields the replay store wrote before lib/types Draft had requestedBy / approvedBy /
 * rejectedBy / rejectionReason / editedBody. `acceptedBy` reads as `approvedBy`; `rejectedAt` as the
 * draft_rejected event's time.
 */
export type DraftDecision = { acceptedBy?: string; rejectedAt?: string };
