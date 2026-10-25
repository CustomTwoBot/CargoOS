// The cases list before there is any case: one way in (New case) and the recorded cases to try.
// Rendered in place of the list card, under the same "Cases" header.
import { NEW_CASE_COPY, RECORDED_EXAMPLES, type RecordedExample } from "./model";
import { ExampleList, Primary } from "./parts";

export const CASES_EMPTY_COPY = {
  title: "No cases yet.",
  body: "Start with the forwarder's invoice. CargoOS checks it against the quotes, emails and chats before you pay.",
  action: "New case",
  examples: "Or open a recorded case",
} as const;

export function CasesEmpty({ onNew, onLoadExample, examples = RECORDED_EXAMPLES }: {
  onNew: () => void; onLoadExample: (id: string) => void; examples?: RecordedExample[];
}) {
  return (
    <section aria-label="Cases" className="mx-6 max-w-[640px] rounded-xl border border-line bg-surface shadow-card">
      <div className="px-6 pb-5 pt-6">
        <h2 className="text-panel font-semibold text-ink">{CASES_EMPTY_COPY.title}</h2>
        <p className="mt-1 max-w-[460px] text-body text-ink-2">{CASES_EMPTY_COPY.body}</p>
        <div className="mt-4"><Primary onClick={onNew}>{CASES_EMPTY_COPY.action}</Primary></div>
      </div>
      {examples.length > 0 && (
        <div className="border-t border-line px-6 pb-2 pt-3.5">
          <h3 className="text-[13px] font-semibold text-ink-2">{CASES_EMPTY_COPY.examples}</h3>
          <p className="text-meta text-ink-3">{NEW_CASE_COPY.examplesBody}</p>
          <ExampleList examples={examples} onLoad={onLoadExample} />
        </div>
      )}
    </section>
  );
}
