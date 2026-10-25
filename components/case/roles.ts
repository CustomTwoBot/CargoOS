// One operator by default (docs/design.md §0). The screen holds a set of roles; each action
// carries its own role to the server. There is no UI control that changes either.
import type { Role } from "@/lib/types";

export type Action =
  | "confirm" | "dismiss" | "editCharge" | "addEvidence" | "draftDispute" | "requestApproval"
  | "reply" | "approve";

export const ACTION_ROLE: Record<Action, Role> = {
  confirm: "clerk", dismiss: "clerk", editCharge: "clerk", addEvidence: "clerk",
  draftDispute: "clerk", requestApproval: "clerk",
  reply: "ops_lead",
  approve: "controller",
};

export const ALL_ROLES: readonly Role[] = ["clerk", "controller", "ops_lead"];

/** Whether a screen holding `held` shows the control for `action`. */
export const canAct = (held: readonly Role[], action: Action) => held.includes(ACTION_ROLE[action]);
