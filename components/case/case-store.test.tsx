import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Person } from "@/lib/types";
import { personById } from "@/lib/people";
import { decisionBlocked, useCaseStore } from "./case-store";
import { SCENARIO_A } from "./fixture";

const SAM = personById("sam")!;
const MAYA = personById("maya")!;

/** Scenario A after the answers, acted on by whoever `viewer` is at the time. */
function setup(first: Person) {
  const toast = vi.fn();
  const cases = [SCENARIO_A];
  const hook = renderHook(({ viewer }) => useCaseStore(cases, toast, viewer), { initialProps: { viewer: first } });
  const act$ = () => hook.result.current.actionsFor(SCENARIO_A);
  const x = () => hook.result.current.inputs[SCENARIO_A.id];
  act(() => act$().reset(SCENARIO_A.end));
  return { hook, toast, act: act$, x };
}

describe("requests and decisions (CLAUDE.md rule 8, docs/design.md §0.3)", () => {
  it("a bookkeeper's draft is a request with their id, and the owner accepts it under the owner id", () => {
    const { hook, toast, act: a, x } = setup(MAYA);
    act(() => { a().draftDispute(); });
    const [d] = x().drafts;
    expect(d).toMatchObject({ status: "pending_approval", requestedBy: "maya" });
    expect(x().events.find((e) => e.type === "approval_requested")?.payload).toMatchObject({ draftId: d._id, personId: "maya" });
    expect(toast).toHaveBeenLastCalledWith("Approval requested from Sam. Nothing was sent.");

    hook.rerender({ viewer: SAM });
    act(() => a().accept(d._id));
    expect(x().drafts[0]).toMatchObject({ status: "approved", requestedBy: "maya", approvedBy: "sam" });
  });

  it("the bookkeeper can't accept or reject: approval_blocked is written and nothing changes", () => {
    const { toast, act: a, x } = setup(MAYA);
    act(() => { a().draftDispute(); });
    const id = x().drafts[0]._id;
    act(() => a().accept(id));
    act(() => a().reject(id, "no"));
    expect(x().drafts[0].status).toBe("pending_approval");
    expect(x().events.filter((e) => e.type === "approval_blocked")).toHaveLength(2);
    expect(toast).toHaveBeenLastCalledWith("Only Sam can accept or reject a dispute.");
  });

  it("an owner who asks is the requester too, and can't decide it (as on the server)", () => {
    const { toast, act: a, x } = setup(SAM);
    act(() => { a().draftDispute(); });
    const [d] = x().drafts;
    expect(d).toMatchObject({ status: "pending_approval", requestedBy: "sam" });
    act(() => a().reject(d._id, "They did expedite it."));
    expect(x().drafts[0].status).toBe("pending_approval");
    expect(x().events.filter((e) => e.type === "approval_blocked")).toHaveLength(1);
    expect(toast).toHaveBeenLastCalledWith("You requested this dispute. Another owner decides.");
  });

  it("stamps what people do on the replay's clock, a minute after the recorded story, not the wall clock", () => {
    const { hook, act: a, x } = setup(MAYA);
    const recorded = Math.max(...SCENARIO_A.at(SCENARIO_A.end).events.map((e) => Date.parse(e.at)));
    act(() => { a().draftDispute(); });
    hook.rerender({ viewer: SAM });
    const at = (type: string) => Date.parse(x().events.find((e) => e.type === type)!.at);
    expect(at("draft_created")).toBe(recorded + 60_000);
    expect(at("approval_requested")).toBe(recorded + 120_000);
    act(() => a().reject(x().drafts[0]._id, "Paid already."));
    expect(Date.parse((x().drafts[0] as { rejectedAt?: string }).rejectedAt!)).toBe(recorded + 180_000);
  });

  it("nobody decides on a dispute they requested, even an owner", () => {
    expect(decisionBlocked(SAM, { requestedBy: "sam" })).toBe("You requested this dispute. Another owner decides.");
    expect(decisionBlocked(SAM, { requestedBy: "maya" })).toBeUndefined();
    expect(decisionBlocked(MAYA, {})).toBe("Only Sam can accept or reject a dispute.");
  });
});

describe("line decisions name the person (History shows who, not 'Someone · clerk')", () => {
  it("Keep in dispute and Not an issue carry the viewer's id", () => {
    const { act: a, x } = setup(MAYA);
    const key = x().findings.find((f) => f.status === "potential_discrepancy")!.key;
    act(() => a().verdict(key, "confirmed"));
    act(() => a().verdict(key, "false_positive"));
    const payloads = x().events.filter((e) => e.type === "finding_confirmed" || e.type === "finding_dismissed").map((e) => e.payload);
    expect(payloads).toEqual([{ findingKey: key, personId: "maya" }, { findingKey: key, personId: "maya" }]);
  });
});
