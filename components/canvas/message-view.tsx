// The message to the seller on the canvas (docs/design.md §0.4 п.3), once the owner accepts the dispute:
// editable words, numbers locked to the findings, Copy text / Save PDF. Nothing is ever sent.
import type { Person } from "@/lib/types";
import { approvalItems } from "@/components/inboxes/items";
import { SellerMessage } from "@/components/inboxes/seller-message";
import type { CaseContext } from "@/components/case/panes";
import { canAct } from "@/components/case/roles";
import { Back } from "./doc-view";

type Props = Pick<CaseContext, "demo" | "x" | "forwarder" | "actions"> & { viewer: Person; draftId: string; onBack: () => void };

export function MessageView({ demo, x, forwarder, actions, viewer, draftId, onBack }: Props) {
  const item = approvalItems([{ demo, x, forwarder }]).find((a) => a.draftId === draftId);
  return (
    <Back onBack={onBack}>
      {item?.status === "accepted" && item.message ? (
        <SellerMessage key={item.id} to={item.forwarder} subject={item.subject} message={item.message}
          readOnly={!canAct(viewer.roles, "approve")} onChange={(t) => actions.editMessage(draftId, t)} />
      ) : (
        <p className="rounded-[14px] border border-line bg-surface px-5 py-4 text-why text-ink-2 shadow-card">
          {item?.status === "rejected" ? "This dispute was rejected, so there is no message to the seller."
            : "The message to the seller is written once the owner accepts the dispute. Nothing is sent."}
        </p>
      )}
    </Back>
  );
}
