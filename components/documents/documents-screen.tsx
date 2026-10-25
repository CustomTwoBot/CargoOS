"use client";
// Documents screen at 1280: what CargoOS has, what it read from each document, and what failed.
// Replay mode only for now: Scenario A after the answer, from the fixture. Live Convex data later.
import { useState } from "react";
import { Rail } from "@/components/case/chrome";
import { cx } from "@/components/case/cx";
import { scenarioAAt } from "@/components/case/fixture";
import { ChainGlyph } from "@/components/case/glyphs";
import { ThemeToggle } from "@/components/case/theme-toggle";
import { latestQuestion, type CaseInput } from "@/components/case/view-model";
import { docRows, itemsOf, segmentsOf, type DocRow, type DocStatus } from "./documents";

export function DocumentsScreen({ x = scenarioAAt("after") }: { x?: CaseInput }) {
  const rows = docRows(x);
  const [selectedId, setSelectedId] = useState(rows[0]?.doc._id);
  const selected = rows.find((r) => r.doc._id === selectedId) ?? rows[0];

  return (
    <div className="flex h-dvh min-w-[1280px] overflow-hidden bg-bg text-ink">
      <Rail openQuestion={latestQuestion(x)?.status === "open"} active="documents" />
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-4 px-6 pb-3 pt-3.5">
          <div className="min-w-0">
            <h1 className="flex items-center gap-2.5 text-title font-[650] tracking-[-0.012em]">
              Documents
              <span title="Replay of a recorded run. Nothing here reaches the backend or Claude."
                className="rounded-full border border-line-strong px-2 text-xs font-semibold leading-5 text-ink-2">Replay</span>
            </h1>
            <p className="mt-0.5 text-[13px] text-ink-2">
              {x.case.title}. {rows.length} documents, oldest first.{" "}
              <span className="text-ink-3">Synthetic data. Nothing is sent or paid automatically.</span>
            </p>
          </div>
          <ThemeToggle />
        </header>
        <div className="grid min-h-0 flex-1 grid-cols-[300px_minmax(0,1fr)] gap-4 px-6 pb-4">
          <ul aria-label="Documents" className="min-h-0 overflow-auto rounded-xl border border-line bg-surface p-1.5 shadow-card">
            {rows.map((r) => (
              <li key={r.doc._id}>
                <button type="button" onClick={() => setSelectedId(r.doc._id)} aria-current={r === selected || undefined}
                  className={cx("grid w-full grid-cols-[28px_minmax(0,1fr)] gap-2.5 rounded-lg px-2.5 py-2 text-left",
                    r === selected ? "bg-sunken" : "hover:bg-sunken")}>
                  <span className="mt-0.5 grid size-7 place-items-center rounded-full border border-line-strong bg-surface text-ink-2">
                    <ChainGlyph icon={r.icon} />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[13.5px] font-[650] leading-[19px]">{r.doc.title}</span>
                    <span className="block text-meta text-ink-3">{meta(r)}</span>
                    <StatusText status={r.status} />
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {selected ? <DocumentCard key={selected.doc._id} x={x} row={selected} />
            : <p className="text-why text-ink-2">No documents in this case yet.</p>}
        </div>
      </main>
    </div>
  );
}

const meta = (r: DocRow) => [r.kind, r.sender, r.date].filter(Boolean).join(" · ");

function StatusText({ status }: { status: DocStatus }) {
  return (
    <span className={cx("block text-meta", status.state === "failed" ? "font-semibold text-waiting" : "text-ink-2")}>
      {status.label}
    </span>
  );
}

function DocumentCard({ x, row }: { x: CaseInput; row: DocRow }) {
  const [active, setActive] = useState<string>();
  const read = row.status.state === "read";
  const items = read ? itemsOf(x, row.doc) : [];
  const { segments, missing } = segmentsOf(row.doc.text, items);
  const show = (id: string) => {
    setActive(id);
    document.querySelector(`[data-quote="${id}"]`)?.scrollIntoView?.({ block: "center" });
  };

  return (
    <section aria-label={row.doc.title} className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-card">
      <div className="flex items-start justify-between gap-4 border-b border-line px-4 pb-2.5 pt-3">
        <div className="min-w-0">
          <div className="text-meta text-ink-3">{meta(row)}</div>
          <h2 className="mt-0.5 text-panel font-[650]">{row.doc.title}</h2>
        </div>
        <div className="pt-[18px]"><StatusText status={row.status} /></div>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-h-0 overflow-auto bg-sunken p-3">
          {row.status.state === "failed" && (
            <p className="mb-3 rounded-lg bg-waiting-tint px-3 py-2 text-meta text-waiting">
              Couldn&apos;t read part of this document; affected lines are waiting on answers.
            </p>
          )}
          <p data-testid="document-text" className="whitespace-pre-wrap break-words rounded-lg border border-line bg-surface p-3 text-[13px] leading-5">
            {segments.map((s, i) => s.id
              ? <mark key={i} data-quote={s.id} className={cx(active === s.id && "outline-2 outline-offset-1 outline-ink")}>{s.text}</mark>
              : s.text)}
          </p>
        </div>
        <div className="min-h-0 overflow-auto border-l border-line px-4 pt-3">
          <h3 className="text-[13.5px] font-[650]">What CargoOS read</h3>
          {row.status.state === "waiting" && <p className="mt-1 text-why text-ink-2">Not read yet.</p>}
          {row.status.state === "failed" && <p className="mt-1 text-why text-ink-2">Nothing was taken from it.</p>}
          {read && !items.length && <p className="mt-1 text-why text-ink-2">Nothing to take from it.</p>}
          <ul className="mt-1.5 pb-3">
            {items.map((it) => (
              <li key={it.id}>
                <button type="button" onClick={() => show(it.id)} onMouseEnter={() => setActive(it.id)} onFocus={() => setActive(it.id)}
                  onMouseLeave={() => setActive(undefined)} title="Show it in the text"
                  className={cx("-mx-2 block w-[calc(100%+16px)] rounded-[7px] px-2 py-1.5 text-left text-[13.5px] leading-5",
                    active === it.id && "bg-sunken", missing.includes(it.id) && "text-ink-3")}>
                  {it.text}
                  {it.note && <span className="block text-xs text-ink-3">{it.note}</span>}
                  {missing.includes(it.id) && <span className="block text-xs text-ink-3">Not found in the text.</span>}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
