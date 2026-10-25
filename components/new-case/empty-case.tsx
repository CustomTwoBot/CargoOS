// The empty case in live mode (SPEC.md §8 "Empty case"): the case exists, nothing is in it yet.
// Large drop targets by type and the phone uploader's QR. Files go up the moment they land
// (`onAdd`); the overview then shows ReadingProgress from the backend.
import { useState } from "react";
import { EMPTY_CASE } from "@/components/states/copy";
import { DropTargets, type PasteDraft } from "./drop-targets";
import type { NewCaseDocType, NewCaseDocument, PendingDoc } from "./model";
import { PhoneCard, TEXT_BUTTON } from "./parts";

const strip = ({ type, title, text, file }: PendingDoc): NewCaseDocument => (file ? { type, title, text, file } : { type, title, text });

export function EmptyCaseUpload({ onAdd, uploadUrl, counts, onLoadScenarioA }: {
  /** Upload these now (generateUploadUrl + addDocument, role "clerk"). */
  onAdd: (docs: NewCaseDocument[]) => void;
  /** `/upload/[caseId]` for the phone; shows the QR card when given. */
  uploadUrl?: string;
  /** Documents already uploaded, per type, shown on the targets. */
  counts?: Partial<Record<NewCaseDocType, number>>;
  /** The labelled replay fallback. */
  onLoadScenarioA?: () => void;
}) {
  const [paste, setPaste] = useState<PasteDraft>();
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_300px] items-start gap-4">
      <section aria-label="Empty case" className="rounded-xl border border-line bg-surface px-5 pb-5 pt-5 shadow-card">
        <h2 className="text-panel font-semibold text-ink">{EMPTY_CASE.title}</h2>
        <p className="mb-4 mt-1 text-body text-ink-2">{EMPTY_CASE.body}</p>
        <DropTargets onAdd={(docs) => onAdd(docs.map(strip))} counts={counts} paste={paste} onPaste={setPaste} large />
        {onLoadScenarioA && (
          <p className="mt-4 text-meta text-ink-3">
            No files at hand?{" "}
            <button type="button" onClick={onLoadScenarioA} className={TEXT_BUTTON}>{EMPTY_CASE.action}</button>{" "}
            as a replay.
          </p>
        )}
      </section>
      {uploadUrl && <PhoneCard url={uploadUrl} />}
    </div>
  );
}
