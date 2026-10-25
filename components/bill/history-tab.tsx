"use client";
// The bill's History tab (docs/design.md §0.5, P3 style): every step, newest first, with the time,
// who did it and one plain sentence from history.ts. Blocked approvals read in hold red.
import { useState } from "react";
import type { CaseEvent, Person } from "@/lib/types";
import { PEOPLE, personById } from "@/lib/people";
import type { Bill } from "@/components/app/bills-provider";
import { useBills } from "@/components/app/bills-provider";
import { Card, PersonAvatar } from "@/components/app/ui";
import { cx } from "@/components/case/cx";
import { timeOf } from "@/components/case/format";
import { dayPT, historyEntries, matches, secondsPT, uploaderEntries, type Entry } from "@/components/history/history";
import { firstName, isUploaderOnly } from "@/components/shell/person";

const ROLE_WORD: Record<string, string> = { clerk: "clerk", controller: "controller", ops_lead: "ops lead", uploader: "uploader" };

type Who = { kind: "cargoos" } | { kind: "person"; person: Person; role?: string } | { kind: "role"; role?: string };

/** Who took the step: CargoOS, the person named on the event, or the one person holding its role. */
function whoOf(e: Entry, event: CaseEvent | undefined): Who {
  if (e.who !== "you") return { kind: "cargoos" };
  const role = event && typeof event.actor === "string" ? event.actor : undefined;
  const id = typeof event?.payload.personId === "string" ? event.payload.personId : undefined;
  const named = id ? personById(id) : undefined;
  // A blocked attempt carries the role tried, not one the person holds: name the person alone.
  if (named) return { kind: "person", person: named, role: role && named.roles.includes(role as Person["roles"][number]) ? role : undefined };
  const holders = role ? PEOPLE.filter((p) => p.roles.includes(role as Person["roles"][number])) : [];
  if (holders.length === 1) return { kind: "person", person: holders[0], role };
  return { kind: "role", role };
}

const whoName = (w: Who) => w.kind === "cargoos" ? "CargoOS"
  : w.kind === "person" ? [firstName(w.person), w.role && ROLE_WORD[w.role]].filter(Boolean).join(" · ")
  : `Someone · ${w.role ? ROLE_WORD[w.role] ?? w.role : "team"}`;

function Avatar({ who }: { who: Who }) {
  if (who.kind === "person") return <PersonAvatar person={who.person} size={24} />;
  return (
    <span aria-hidden="true" className={cx("inline-flex size-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold",
      who.kind === "cargoos" ? "bg-ink text-bg" : "border border-line-strong bg-surface text-ink-2")}>
      {who.kind === "cargoos" ? "C" : (who.role?.charAt(0).toUpperCase() ?? "?")}
    </span>
  );
}

export function HistoryTab({ bill }: { bill: Bill }) {
  const { person } = useBills();
  const [query, setQuery] = useState("");
  const all = historyEntries(bill.x);
  const entries = (isUploaderOnly(person) ? uploaderEntries(all) : all).slice().reverse();
  const shown = entries.filter((e) => matches(e, query));
  const events = new Map(bill.x.events.map((e) => [e._id, e]));

  return (
    <Card className="px-5 py-[18px] sm:px-[22px]">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 pb-2">
        <h2 className="font-bold">History</h2>
        <span className="text-meta text-ink-3">Every step is saved and can&apos;t be edited</span>
      </div>
      <label className="mb-2 block">
        <span className="sr-only">Search history</span>
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search: line 6, approval, rush handling"
          className="h-10 w-full rounded-[10px] border border-line-strong bg-surface px-3 text-[14px] text-ink placeholder:text-ink-4" />
      </label>
      {!entries.length && <p className="py-3 text-why text-ink-2">Nothing has happened on this bill yet.</p>}
      {entries.length > 0 && !shown.length && <p className="py-3 text-why text-ink-2">No step matches “{query.trim()}”.</p>}
      <ol aria-label="History" className="flex flex-col">
        {shown.map((e, i) => {
          const who = whoOf(e, events.get(e.id));
          const day = dayPT(e.at);
          const newDay = i === 0 || dayPT(shown[i - 1].at) !== day;
          return (
            <li key={e.id} data-blocked={e.blocked || undefined}
              className="grid grid-cols-[72px_28px_minmax(0,1fr)] items-start gap-2.5 border-t border-line py-[9px]">
              <span className="pt-0.5 font-mono text-[12.5px] leading-[18px] text-ink-3">
                <time dateTime={e.at} title={`${day}, ${secondsPT(e.at)}`}>{timeOf(e.at)}</time>
                {newDay && <span className="block text-[11px] text-ink-4">{day}</span>}
              </span>
              <span className="pt-px" title={whoName(who)}><Avatar who={who} /></span>
              <span className="min-w-0">
                <span className={cx("block", e.blocked ? "font-semibold text-hold" : "text-ink")}>
                  {e.blocked && <span className="sr-only">Blocked: </span>}{e.what}
                </span>
                {e.quotes.map((q, k) => (
                  <q key={k} className="mt-1 block text-[13px] italic text-ink-2 before:content-none after:content-none">
                    “<mark>{q}</mark>”
                  </q>
                ))}
                <span className="block text-meta text-ink-3">{whoName(who)}</span>
              </span>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
