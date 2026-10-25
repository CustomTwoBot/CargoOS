"use client";
// The bill's History tab (docs/design.md §0.5, P3 style): every step, newest first, with the time,
// who did it and one plain sentence from history.ts, on a timeline grouped by day. Blocked approvals
// read in hold red. Icons sit beside the sentence; the sentence always says what happened.
import { useRef, useState } from "react";
import type { CaseEvent, Person } from "@/lib/types";
import { PEOPLE, personById } from "@/lib/people";
import type { Bill } from "@/components/app/bills-provider";
import { useBills } from "@/components/app/bills-provider";
import {
  Ban, BadgeCheck, BookmarkCheck, CircleCheck, CircleHelp, FilePenLine, FilePlus, FileUp, FileX, Flag, History, Pencil, Reply,
  Scale, ScanText, Search, SearchX, Send, Undo2, type LucideIcon,
} from "@/components/app/icons";
import { RISE } from "@/components/app/motion";
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

/** The icon beside each kind of step. */
const STEP_ICON: Record<CaseEvent["type"], LucideIcon> = {
  doc_added: FilePlus, document_uploaded: FileUp, facts_extracted: ScanText, extraction_failed: FileX,
  charge_edited: Pencil, recomputed: Scale, question_asked: CircleHelp, reply_received: Reply,
  finding_confirmed: Flag, finding_dismissed: CircleCheck, draft_created: FilePenLine,
  approval_requested: Send, approval_blocked: Ban, approved: BadgeCheck, draft_rejected: Ban,
  rule_learned: BookmarkCheck, rule_undone: Undo2,
};

/** How long each row waits before rising in, capped so a long history doesn't trickle. */
const stagger = (i: number) => `${Math.min(i, 12) * 35}ms`;

export function HistoryTab({ bill }: { bill: Bill }) {
  const { person } = useBills();
  const [query, setQuery] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const all = historyEntries(bill.x);
  const entries = (isUploaderOnly(person) ? uploaderEntries(all) : all).slice().reverse();
  const shown = entries.filter((e) => matches(e, query));
  const events = new Map(bill.x.events.map((e) => [e._id, e]));
  const clear = () => { setQuery(""); input.current?.focus(); };

  return (
    <Card className="px-5 py-[18px] sm:px-[22px]">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 pb-3">
        <h2 className="font-bold">History</h2>
        <span className="text-meta text-ink-3">Every step is saved and can&apos;t be edited</span>
      </div>
      <label className="relative mb-1 block">
        <span className="sr-only">Search history</span>
        <Search aria-hidden="true" strokeWidth={2} className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
        <input ref={input} type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search: line 6, approval, rush handling"
          className="h-10 w-full rounded-[10px] border border-line-strong bg-surface pl-9 pr-3 text-[14px] text-ink placeholder:text-ink-4" />
      </label>
      {!entries.length && (
        <div className="flex flex-col items-center gap-2 py-8 text-center">
          <History aria-hidden="true" strokeWidth={1.8} className="size-6 text-ink-4" />
          <p className="text-why text-ink-2">Nothing has happened on this bill yet.</p>
        </div>
      )}
      {entries.length > 0 && !shown.length && (
        <div className="flex flex-col items-center gap-2 py-8 text-center">
          <SearchX aria-hidden="true" strokeWidth={1.8} className="size-6 text-ink-4" />
          <p className="text-why text-ink-2">No step matches “{query.trim()}”.</p>
          <button type="button" onClick={clear} className="text-[13px] font-semibold text-link underline underline-offset-4">Clear search</button>
        </div>
      )}
      <ol aria-label="History" className="flex flex-col">
        {shown.map((e, i) => {
          const who = whoOf(e, events.get(e.id));
          const day = dayPT(e.at);
          const newDay = i === 0 || dayPT(shown[i - 1].at) !== day;
          const lastOfDay = i === shown.length - 1 || dayPT(shown[i + 1].at) !== day;
          const Icon = STEP_ICON[e.code] ?? History;
          return (
            <li key={e.id} data-blocked={e.blocked || undefined} style={{ animationDelay: stagger(i) }}
              className={cx("grid grid-cols-[64px_28px_minmax(0,1fr)] gap-x-3 fill-mode-both sm:grid-cols-[72px_28px_minmax(0,1fr)]", RISE)}>
              {newDay && (
                <span className="col-span-3 flex items-center gap-3 pb-2.5 pt-3">
                  <span className="text-[12px] font-semibold uppercase tracking-[0.04em] text-ink-3">{day}</span>
                  <span aria-hidden="true" className="h-px flex-1 bg-line" />
                </span>
              )}
              <span className="pt-[3px] font-mono text-[12.5px] leading-[18px] text-ink-3">
                <time dateTime={e.at} title={`${day}, ${secondsPT(e.at)}`}>{timeOf(e.at)}</time>
              </span>
              <span className="relative flex justify-center" title={whoName(who)}>
                {/* The rail: from this step's avatar down to the next one's, broken at each day. */}
                {!lastOfDay && <span aria-hidden="true" className="absolute bottom-0 left-1/2 top-3 w-px -translate-x-1/2 bg-line-strong" />}
                {!newDay && <span aria-hidden="true" className="absolute left-1/2 top-0 h-3 w-px -translate-x-1/2 bg-line-strong" />}
                <span className="relative rounded-full ring-4 ring-surface"><Avatar who={who} /></span>
              </span>
              <span className={cx("min-w-0", lastOfDay ? "pb-2" : "pb-4")}>
                <span className="flex items-start gap-1.5">
                  <Icon aria-hidden="true" strokeWidth={2} className={cx("mt-[3px] size-3.5 flex-none", e.blocked ? "text-hold" : "text-ink-3")} />
                  <span className={cx("block min-w-0", e.blocked ? "font-semibold text-hold" : "text-ink")}>
                    {e.blocked && <span className="sr-only">Blocked: </span>}{e.what}
                  </span>
                </span>
                {e.quotes.map((q, k) => (
                  <q key={k} className="ml-5 mt-1.5 block border-l-2 border-line-strong pl-2.5 text-[13px] italic leading-[20px] text-ink-2 before:content-none after:content-none">
                    “<mark>{q}</mark>”
                  </q>
                ))}
                <span className="ml-5 mt-0.5 block text-meta text-ink-3">{whoName(who)}</span>
              </span>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
