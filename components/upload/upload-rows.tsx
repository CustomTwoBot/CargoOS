"use client";
// The list of documents on /bills/new while they are uploaded and read: an icon by detected kind, a bar
// that creeps while reading and fills when read, a check that pops once. Failed rows say why and, when
// nothing reached the server, offer Try again or Remove.
import { Check, CircleCheck, CircleDashed, CircleX, DocIcon, RotateCcw, X } from "@/components/app/icons";
import { Card } from "@/components/app/ui";
import { RISE } from "@/components/app/motion";
import { cx } from "@/components/case/cx";
import { headline, isBusy, stateLabel, type UploadRow } from "./kinds";

/** A row plus what this page can do about it. */
export type ViewRow = UploadRow & { onRetry?: () => void; onRemove?: () => void };

// Width and how long the bar takes to get there: reading creeps slowly toward the end, read snaps full.
const BAR: Record<UploadRow["state"], { width: string; ms: number }> = {
  uploading: { width: "28%", ms: 600 },
  reading: { width: "88%", ms: 2800 },
  read: { width: "100%", ms: 320 },
  failed: { width: "100%", ms: 320 },
  not_read: { width: "0%", ms: 0 },
};

/** How far along all rows are together, 0–1, for the header's small bar. */
const overall = (rows: UploadRow[]) =>
  rows.length ? rows.reduce((s, r) => s + (isBusy(r.state) ? (r.state === "reading" ? 0.6 : 0.2) : 1), 0) / rows.length : 0;

export function Rows({ rows, note, onStartOver }: { rows: ViewRow[]; note?: string; onStartOver?: () => void }) {
  const busy = rows.some((r) => isBusy(r.state));
  const allRead = !busy && rows.every((r) => r.state === "read");
  return (
    <Card className="flex flex-col px-4 py-[18px] sm:px-[22px]">
      <div className="flex items-center justify-between gap-4 pb-2.5">
        <h2 aria-live="polite" className="text-panel font-bold text-ink">{headline(rows)}</h2>
        {busy ? (
          <span aria-hidden="true" className="block h-1.5 w-24 flex-none overflow-hidden rounded-full bg-raised">
            <span className="block h-1.5 rounded-full bg-brand transition-[width] duration-700 ease-move motion-reduce:transition-none"
              style={{ width: `${Math.round(overall(rows) * 100)}%` }} />
          </span>
        ) : allRead ? (
          <CircleCheck aria-hidden="true" strokeWidth={2} className="size-5 flex-none text-pay animate-in zoom-in-50 duration-300 motion-reduce:animate-none" />
        ) : null}
      </div>
      <ul aria-label="Added documents">
        {rows.map((r) => <Row key={r.key} row={r} />)}
      </ul>
      {note && <p className="border-t border-line pt-3 text-why text-ink-3">{note}</p>}
      {onStartOver && (
        <button type="button" onClick={onStartOver} className="mt-2.5 self-start text-ink-3 underline underline-offset-4 hover:text-ink">
          Start over
        </button>
      )}
    </Card>
  );
}

const TILE: Record<UploadRow["state"], string> = {
  uploading: "bg-raised text-ink-2",
  reading: "bg-raised text-ink-2",
  read: "bg-[var(--lime-ink)] text-lime dark:bg-lime dark:text-lime-ink",
  failed: "bg-hold-tint text-hold",
  not_read: "bg-sunken text-ink-3",
};

function Row({ row }: { row: ViewRow }) {
  const known = row.state !== "uploading";
  const bar = BAR[row.state];
  return (
    <li className={cx("grid grid-cols-[40px_minmax(0,1fr)] items-center gap-x-3.5 gap-y-1 border-t border-line px-1 py-3 sm:grid-cols-[40px_minmax(0,1fr)_auto]", RISE)}>
      {/* The tile re-mounts on each state so the read pop plays once. */}
      <span key={row.state === "read" ? "read" : "busy"} aria-hidden="true"
        className={cx("inline-flex size-10 flex-col items-center justify-center gap-px rounded-[11px] transition-colors", TILE[row.state],
          row.state === "read" && "animate-in zoom-in-90 duration-300 motion-reduce:animate-none")}>
        <DocIcon type={row.docType} image={row.icon === "IMG"} className="size-[17px]" />
        <span className="text-[8.5px] font-extrabold leading-none tracking-[0.04em]">{row.icon}</span>
      </span>
      <span className="flex min-w-0 flex-col gap-[5px]">
        <span className="flex flex-wrap items-center gap-2">
          <b className="min-w-0 break-words font-semibold text-ink">{row.name}</b>
          {known && <span className="rounded-[6px] bg-sunken px-2 py-px text-[12px] font-bold text-ink-2 animate-in fade-in duration-300 motion-reduce:animate-none">{row.kind}</span>}
          {row.from && <span className="text-meta text-ink-3">{row.from}</span>}
        </span>
        <span className="block h-1.5 overflow-hidden rounded-full bg-raised">
          <span className={cx("block h-1.5 rounded-full transition-[width,background-color] ease-move motion-reduce:transition-none",
            row.state === "read" ? "bg-pay-fill" : row.state === "failed" ? "bg-hold-fill" : "bg-brand")}
            style={{ width: bar.width, transitionDuration: `${bar.ms}ms` }} />
        </span>
      </span>
      <Status row={row} />
    </li>
  );
}

function Status({ row }: { row: ViewRow }) {
  const tone = row.state === "read" ? "text-pay" : row.state === "failed" ? "text-hold" : "text-ink-3";
  return (
    <span className="col-start-2 flex flex-wrap items-center gap-x-3 gap-y-1 sm:col-start-auto sm:max-w-[300px] sm:justify-end sm:text-right">
      <span className={cx("inline-flex min-w-0 items-center gap-1.5 font-semibold", tone)}>
        {isBusy(row.state) && <i aria-hidden="true" className="inline-block size-3.5 flex-none animate-spin rounded-full border-2 border-line-strong border-t-brand motion-reduce:animate-none" />}
        {row.state === "read" && <Check aria-hidden="true" strokeWidth={2.6} className="size-4 flex-none animate-in zoom-in-50 spin-in-12 duration-300 motion-reduce:animate-none" />}
        {row.state === "failed" && <CircleX aria-hidden="true" strokeWidth={2} className="size-4 flex-none" />}
        {row.state === "not_read" && <CircleDashed aria-hidden="true" strokeWidth={2} className="size-4 flex-none" />}
        <span className="min-w-0 break-words">{stateLabel(row)}</span>
      </span>
      {(row.onRetry || row.onRemove) && (
        <span className="inline-flex items-center gap-1">
          {row.onRetry && (
            <button type="button" onClick={row.onRetry}
              className="inline-flex h-8 items-center gap-1 rounded-[9px] px-2 text-[13px] font-semibold text-ink hover:bg-sunken">
              <RotateCcw aria-hidden="true" strokeWidth={2} className="size-3.5" />Try again
            </button>
          )}
          {row.onRemove && (
            <button type="button" onClick={row.onRemove} aria-label={`Remove ${row.name}`}
              className="inline-flex h-8 items-center gap-1 rounded-[9px] px-2 text-[13px] font-semibold text-ink-2 hover:bg-sunken hover:text-ink">
              <X aria-hidden="true" strokeWidth={2} className="size-3.5" />Remove
            </button>
          )}
        </span>
      )}
    </span>
  );
}
