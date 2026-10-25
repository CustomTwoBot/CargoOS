// The invoice canvas (docs/design.md §0.4 п.3): the verdict and the marked-up invoice lines, or in their
// place the source document or the message to the seller that the shared focus points at. An uploader
// sees the case's documents and a place to drop more, never money or findings (§0.3).
import { useEffect, useRef } from "react";
import { INVOICE, type CanvasProps } from "@/components/case/panes";
import { canAct } from "@/components/case/roles";
import { isRechecking, toRows, totalsOf } from "@/components/case/view-model";
import { DocView } from "./doc-view";
import { InvoiceLines } from "./lines";
import { MessageView } from "./message-view";
import { askedName, changedKeys, firstAtStake, seesFindings, sourceChips } from "./model";
import { Proof } from "./proof";
import { UploaderCanvas } from "./uploader";
import { Verdict } from "./verdict";

export function CaseCanvas({ demo, x, actions, viewer, forwarder, focus, onFocus }: CanvasProps) {
  const sheet = useRef<HTMLDivElement>(null);
  const reviews = seesFindings(viewer);
  const asked = askedName(viewer);
  const back = () => onFocus(INVOICE);

  // A line focused from the thread scrolls into view; a message starts at the top.
  const lineKey = focus.kind === "line" ? focus.key : undefined;
  const kind = focus.kind;
  useEffect(() => {
    if (lineKey) sheet.current?.querySelector(`[data-key="${lineKey}"]`)?.scrollIntoView?.({ block: "nearest" });
    else if (kind === "message") sheet.current?.parentElement?.scrollTo?.({ top: 0 });
  }, [lineKey, kind]);

  let content: React.ReactNode;
  if (focus.kind === "doc") {
    content = <DocView x={x} docId={focus.docId} quote={focus.quote} onBack={back} marks={reviews} asked={asked} />;
  } else if (!reviews) {
    content = <UploaderCanvas x={x} asked={asked} onAdd={actions.addEvidence} onFocus={onFocus} />;
  } else if (focus.kind === "message") {
    content = <MessageView demo={demo} x={x} forwarder={forwarder} actions={actions} viewer={viewer} draftId={focus.draftId} onBack={back} />;
  } else {
    const rows = toRows(x);
    const decides = canAct(viewer.roles, "dismiss");
    content = (
      <>
        <Verdict totals={totalsOf(x)} forwarder={forwarder} asked={asked} was={firstAtStake(x)}
          rechecking={isRechecking(x)} chargeCount={x.charges.length} sources={sourceChips(x, asked)} onFocus={onFocus} />
        <InvoiceLines rows={rows} charges={x.charges} asked={asked} changed={changedKeys(x)}
          open={focus.kind === "line" ? focus.key : undefined} onFocus={onFocus}
          proofFor={(r) => (
            <Proof x={x} row={r} charge={x.charges.find((c) => c._id === r.finding.chargeId)} asked={asked} canDecide={decides} live={demo.live}
              onVerdict={actions.verdict} onSaveLine={actions.saveLine} onFocus={onFocus} />
          )} />
      </>
    );
  }

  return (
    <section aria-label="Invoice" className="min-h-0 flex-1 overflow-auto bg-bg px-4 pb-24 pt-6 sm:px-7">
      <div ref={sheet} className="mx-auto max-w-[760px]">{content}</div>
    </section>
  );
}
