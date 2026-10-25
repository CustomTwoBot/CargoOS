// The person this device is set to (docs/design.md §0.3). Picked in Settings, never on the main
// screen; remembered in localStorage ("cargoos.person"), read in try/catch like the theme. The
// server renders Sam, who holds every role, so the first paint is the old one-operator screen.
import { useSyncExternalStore } from "react";
import type { Person } from "@/lib/types";
import { PEOPLE, personById } from "@/lib/people";

const KEY = "cargoos.person";
export const DEFAULT_PERSON_ID = "sam";
export const DEFAULT_PERSON: Person = personById(DEFAULT_PERSON_ID)!;

/** What the UI calls each seeded person, and what they can and can't do on this screen. */
export const PERSON_COPY: Record<string, { first: string; title: string; can: string[]; cant: string[] }> = {
  sam: {
    first: "Sam", title: "Owner",
    can: ["Answers CargoOS's questions", "Drafts disputes", "Accepts or rejects disputes"],
    cant: ["Can't accept a dispute they requested"],
  },
  maya: {
    first: "Maya", title: "Bookkeeper",
    can: ["Reviews charges and edits lines", "Adds evidence", "Requests approval for a dispute"],
    cant: ["Can't accept or reject disputes", "Can't answer CargoOS's questions"],
  },
  leo: {
    first: "Leo", title: "Uploader",
    can: ["Uploads invoices, quotes, emails and chats"],
    cant: ["Doesn't see amounts, findings or disputes"],
  },
};

/** The order people are shown in: owner, bookkeeper, uploader. */
export const PEOPLE_IN_ORDER: readonly Person[] = ["sam", "maya", "leo"].map((id) => personById(id)).filter((p): p is Person => !!p);

export const WORKSPACE = { name: "Bayline Home Goods", currency: "USD" } as const;

const copyOf = (p: Person) => PERSON_COPY[p.id] ?? { first: p.name, title: "", can: [], cant: [] };
/** "Sam" */
export const firstName = (p: Person) => copyOf(p).first;
/** "Owner" */
export const titleOf = (p: Person) => copyOf(p).title;
/** "Sam · Owner" */
export const displayName = (p: Person) => [firstName(p), titleOf(p)].filter(Boolean).join(" · ");

/** Only documents: no amounts, findings, disputes, questions or approvals. */
export const isUploaderOnly = (p: Person) => p.roles.every((r) => r === "uploader");

/** The person CargoOS asks and who decides disputes: whoever holds controller ("Sam"). */
export const OWNER: Person = PEOPLE.find((p) => p.roles.includes("controller"))!;

const listeners = new Set<() => void>();
const read = (): string => {
  try {
    const id = localStorage.getItem(KEY);
    return id && personById(id) ? id : DEFAULT_PERSON_ID;
  } catch { return DEFAULT_PERSON_ID; }
};
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

export function setDevicePerson(id: string) {
  if (!personById(id)) return;
  try { localStorage.setItem(KEY, id); } catch { /* not remembered */ }
  listeners.forEach((l) => l());
}

/** The person this device is set to; Sam on the server and when nothing is stored. */
export function useDevicePerson(): Person {
  const id = useSyncExternalStore(subscribe, read, () => DEFAULT_PERSON_ID);
  return personById(id) ?? DEFAULT_PERSON;
}
