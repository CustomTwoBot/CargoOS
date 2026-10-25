// @vitest-environment jsdom
// Live mode's store (live-store.ts): getCaseView → CaseInput, and each action → its mutation, as the device's
// person. Only convex/react's useQuery / useMutation are mocked; the view-model and engine run for real.
import { act, cleanup, renderHook } from "@testing-library/react";
import type { FunctionReference } from "convex/server";
import { ConvexError } from "convex/values";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Draft } from "@/lib/types";
import { personById } from "@/lib/people";
import type { CaseActions } from "./case-store";
import { SCENARIO_A } from "./fixture";
import { caseInputOf, liveDemoCase, useLiveCase, type CaseView } from "./live-store";

const h = vi.hoisted(() => ({
  queries: {} as Record<string, unknown>,
  results: {} as Record<string, unknown>,
  calls: [] as { name: string; args: unknown }[],
}));

vi.mock("convex/react", async () => {
  const { getFunctionName } = await import("convex/server");
  return {
    useQuery: (ref: FunctionReference<"query">, args?: unknown) => (args === "skip" ? undefined : h.queries[getFunctionName(ref)]),
    useMutation: (ref: FunctionReference<"mutation">) => async (args: unknown) => {
      const name = getFunctionName(ref);
      h.calls.push({ name, args });
      const result = h.results[name];
      if (result instanceof Error) throw result;
      return result;
    },
  };
});

const SAM = personById("sam")!;
const x = SCENARIO_A.at(SCENARIO_A.start);
const caseId = x.case._id;

const DRAFT: Draft = {
  _id: "draft_1", caseId, to: "forwarder", subject: "", body: "", findingKeys: [], totalDisputedCents: 70000,
  status: "pending_approval", createdBy: "clerk", requestedBy: "maya",
};

/** getCaseView's shape around Scenario A's starting snapshot; fixture ids stand in for Convex ids. */
const viewOf = (draft: Draft | null, revision = x.case.revision) => ({
  case: { ...x.case, revision }, documents: x.documents, facts: x.facts, charges: x.charges, findings: x.findings, changes: [],
  totals: { billed: 0, agreed: 0, atStake: 0, waiting: 0, waived: 0 },
  questions: x.questions, replies: x.replies, draft, events: x.events,
}) as unknown as CaseView;

beforeEach(() => {
  h.queries = { "cases:getDemoCase": caseId, "cases:getCaseView": viewOf(null) };
  h.results = {};
  h.calls = [];
});
afterEach(cleanup);

function setup() {
  const toast = vi.fn();
  const hook = renderHook(() => useLiveCase(SAM, toast));
  /** Runs an action and lets its mutation settle. */
  const run = async <T>(f: (a: CaseActions) => T): Promise<T> => {
    let out!: T;
    await act(async () => {
      out = f(hook.result.current!.actions);
      await new Promise((r) => setTimeout(r, 0));
    });
    return out;
  };
  return { hook, toast, run };
}

describe("caseInputOf (getCaseView → CaseInput)", () => {
  it("keeps every list, and the latest draft becomes the draft list", () => {
    expect(caseInputOf(viewOf(null))).toEqual({ ...x, drafts: [] });
    expect(caseInputOf(viewOf(DRAFT)).drafts).toEqual([DRAFT]);
  });

  it("the live DemoCase is one live snapshot with no recorded answers", () => {
    const input = caseInputOf(viewOf(DRAFT));
    const demo = liveDemoCase(input);
    expect(demo).toMatchObject({ id: caseId, title: x.case.title, live: true, stages: ["live"], start: "live", end: "live", answers: {} });
    expect(demo.at("live")).toBe(input);
    expect(demo.draft(input)).toEqual(DRAFT);
  });
});

describe("useLiveCase", () => {
  it("is undefined while loading and when the backend has no demo case", () => {
    h.queries = {};
    expect(setup().hook.result.current).toBeUndefined();
    h.queries = { "cases:getDemoCase": null };
    expect(setup().hook.result.current).toBeUndefined();
  });

  it("gives the screen an empty, live CaseLocal", () => {
    expect(setup().hook.result.current!.local).toEqual({
      stage: "live", replaying: false, verdicts: {}, drafts: [], added: [], edits: {}, log: [],
    });
  });

  it("each action calls its mutation with the device person's id", async () => {
    h.results["drafts:approveDraft"] = { ok: true };
    h.results["drafts:rejectDraft"] = { ok: true };
    const { run } = setup();
    const question = x.questions[0];
    const finding = x.findings.find((f) => f.revision === x.case.revision)!;

    await run((a) => a.reply(question._id, "approved congestion, not rush handling"));
    await run((a) => a.verdict(finding.key, "confirmed"));
    await run((a) => a.verdict(finding.key, "false_positive"));
    expect(await run((a) => a.draftDispute())).toBeUndefined();
    await run((a) => a.accept("draft_1"));
    await run((a) => a.reject("draft_1", "They did expedite it."));
    await run((a) => a.saveLine(finding.key, { description: "Ocean freight", amountCents: 450000 }));
    expect(await run((a) => a.addEvidence({ type: "chat", text: "ok approved" }))).toEqual({ kind: "live" });
    await run((a) => a.reset("live"));

    const verdict = { role: "clerk", personId: "sam", caseId, key: finding.key };
    expect(h.calls).toEqual([
      { name: "ai:submitReply", args: { role: "ops_lead", personId: "sam", questionId: question._id, text: "approved congestion, not rush handling" } },
      { name: "pipeline:confirmFinding", args: verdict },
      { name: "pipeline:dismissFinding", args: verdict },
      { name: "drafts:requestApproval", args: { caseId, personId: "sam" } },
      { name: "drafts:approveDraft", args: { draftId: "draft_1", personId: "sam" } },
      { name: "drafts:rejectDraft", args: { draftId: "draft_1", personId: "sam", reason: "They did expedite it." } },
      { name: "pipeline:editCharge", args: {
        role: "clerk", personId: "sam", caseId, chargeId: finding.chargeId, amountCents: 450000, description: "Ocean freight",
      } },
      { name: "uploads:addPastedText", args: { caseId, personId: "sam", text: "ok approved", docType: "chat", title: "Chat you added" } },
      { name: "seed:resetLiveDemo", args: { personId: "sam", shipmentRef: "PCL-INV-1012" } },
    ]);
  });

  it("a refused decision ({ ok: false, reason }) is toasted", async () => {
    h.results["drafts:approveDraft"] = { ok: false, reason: "The requester can't approve their own request" };
    const { run, toast } = setup();
    await run((a) => a.accept("draft_1"));
    expect(toast).toHaveBeenLastCalledWith("The requester can't approve their own request");
  });

  it("a thrown mutation error is toasted, never thrown", async () => {
    h.results["drafts:requestApproval"] = new ConvexError("Nothing is at stake, so there is nothing to dispute");
    const { run, toast } = setup();
    await run((a) => a.draftDispute());
    expect(toast).toHaveBeenLastCalledWith("Nothing is at stake, so there is nothing to dispute");
  });

  it("after a reply it rechecks until the revision goes up", async () => {
    const { hook, run } = setup();
    await run((a) => a.reply(x.questions[0]._id, "approved"));
    expect(hook.result.current!.local.replaying).toBe(true);
    h.queries["cases:getCaseView"] = viewOf(null, x.case.revision + 1);
    hook.rerender();
    expect(hook.result.current!.local.replaying).toBe(false);
  });

  it("the owner's edits to the seller message stay on this screen", () => {
    h.queries["cases:getCaseView"] = viewOf({ ...DRAFT, status: "approved", subject: "Disputed charges", body: "Hello" });
    const { hook } = setup();
    act(() => hook.result.current!.actions.editMessage("draft_1", { subject: "Disputed charges", body: "Hi Derek" }));
    expect(hook.result.current!.x.drafts[0]).toMatchObject({ subject: "Disputed charges", body: "Hello", editedBody: "Hi Derek" });
  });
});
