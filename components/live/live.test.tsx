// The live case (SPEC W3 step 8): Convex's case view reaches the screen unchanged except for shape,
// totals are the engine's, and every action calls its mutation with its own role and the device's
// person. Only the Convex client is mocked; the engine totals are real.
import { act, renderHook } from "@testing-library/react";
import { getFunctionName } from "convex/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { caseTotals } from "@/lib/engine/totals";
import { personById } from "@/lib/people";
import { SCENARIO_A } from "@/components/case/fixture";
import { currentFindings, totalsOf, type CaseInput } from "@/components/case/view-model";
import { disputeOf, withWording } from "./live-case";
import { toCaseInput, type CaseView } from "./to-input";

const SAM = personById("sam")!;
const MAYA = personById("maya")!;

/** What `api.cases.getCaseView` returns for a snapshot of the recorded case. */
function viewOf(x: CaseInput): CaseView {
  const findings = currentFindings(x);
  return {
    case: x.case, documents: x.documents, facts: x.facts, charges: x.charges, findings, changes: [],
    totals: caseTotals(findings), questions: x.questions, replies: x.replies, draft: x.drafts.at(-1) ?? null, events: x.events,
  } as unknown as CaseView;
}

const BEFORE = viewOf(SCENARIO_A.at(SCENARIO_A.start));
const AFTER = viewOf(SCENARIO_A.at(SCENARIO_A.end));

describe("toCaseInput", () => {
  it("keeps the case as Convex returns it and takes the totals from the engine", () => {
    const x = toCaseInput(BEFORE);
    expect(x.charges).toHaveLength(8);
    expect(x.drafts).toEqual([]);
    expect(totalsOf(x).atStakeCents).toBe(30000);
    expect(totalsOf(x).billedCents).toBe(BEFORE.totals.billed);
  });

  it("shows whatever the server's totals say, without adding anything up", () => {
    const x = toCaseInput({ ...AFTER, totals: { ...AFTER.totals, atStake: 12345 } });
    expect(totalsOf(x).atStakeCents).toBe(12345);
  });
});

describe("the dispute a live case can ask approval for", () => {
  it("waits while a question is open, then covers the disputed lines with the engine's total", () => {
    expect(disputeOf(toCaseInput(BEFORE))).toBeUndefined();
    const d = disputeOf(toCaseInput(AFTER))!;
    expect(d).toMatchObject({ status: "draft", totalDisputedCents: 70000 });
    expect(d.findingKeys.sort()).toEqual(["chg_1", "chg_6"]);
  });

  it("keeps the server's status and requester, and lays only the owner's edited wording on top", () => {
    const draft = { _id: "d1", _creationTime: 2000, caseId: "case_A", to: "forwarder", subject: "", body: "",
      findingKeys: ["chg_1", "chg_6"], totalDisputedCents: 70000, status: "pending_approval", createdBy: "clerk", requestedBy: "maya" };
    const x = toCaseInput({ ...AFTER, draft } as unknown as CaseView);
    expect(withWording(x, {})).toBe(x);
    const worded = withWording(x, { d1: { subject: "Invoice PCL-INV-1012", editedBody: "Hi Derek" } });
    expect(worded.drafts[0]).toMatchObject({ status: "pending_approval", requestedBy: "maya", subject: "Invoice PCL-INV-1012", editedBody: "Hi Derek" });
  });
});

// --- the hook, with the Convex client mocked ---
const calls: { fn: string; args: unknown }[] = [];
let queries: Record<string, unknown> = {};
let results: Record<string, unknown> = {};
vi.mock("convex/react", () => ({
  useQuery: (ref: unknown, args: unknown) => (args === "skip" ? undefined : queries[getFunctionName(ref as never)]),
  useMutation: (ref: unknown) => async (args: unknown) => {
    const fn = getFunctionName(ref as never);
    calls.push({ fn, args });
    return results[fn] ?? null;
  },
}));
const { useLiveCase } = await import("./use-live-case");

beforeEach(() => { calls.length = 0; results = {}; queries = { "cases:getDemoCase": "case_A", "cases:getCaseView": BEFORE }; });

function live(viewer = SAM) {
  const toast = vi.fn();
  const { result } = renderHook(() => useLiveCase(viewer));
  const state = result.current;
  if (state.status !== "ready") throw new Error(`not ready: ${state.status}`);
  return { live: state.live, actions: state.live.actionsWith(toast), toast };
}

describe("useLiveCase", () => {
  it("is loading until Convex answers, and missing when the demo case isn't seeded", () => {
    queries = {};
    expect(renderHook(() => useLiveCase(SAM)).result.current.status).toBe("loading");
    queries = { "cases:getDemoCase": null };
    expect(renderHook(() => useLiveCase(SAM)).result.current.status).toBe("missing");
  });

  it("shows the live case as a live DemoCase with nothing to replay", () => {
    const { live: l } = live();
    expect(l.demo).toMatchObject({ live: true, answers: {} });
    expect(totalsOf(l.input).atStakeCents).toBe(30000);
  });

  it("sends the typed answer as the ops lead, with the device's person", async () => {
    const { actions } = live(SAM);
    await act(async () => actions.reply("q_1", "  nobody approved either fee "));
    expect(calls).toEqual([{ fn: "ai:submitReply", args: { role: "ops_lead", personId: "sam", questionId: "q_1", text: "nobody approved either fee" } }]);
  });

  it("sends nothing for an empty answer", async () => {
    const { actions } = live(SAM);
    await act(async () => actions.reply("q_1", "   "));
    expect(calls).toEqual([]);
  });

  it("calls the verdict and line edit mutations as the clerk, and asks for approval as Maya", async () => {
    const { actions } = live(MAYA);
    await act(async () => {
      actions.verdict("chg_1", "confirmed");
      actions.verdict("chg_1", "false_positive");
      actions.saveLine("chg_4", { description: "Port congestion fee", amountCents: 15000 });
      actions.draftDispute();
    });
    const clerk = { role: "clerk", personId: "maya", caseId: "case_A" };
    expect(calls).toEqual([
      { fn: "pipeline:confirmFinding", args: { ...clerk, key: "chg_1" } },
      { fn: "pipeline:dismissFinding", args: { ...clerk, key: "chg_1" } },
      { fn: "pipeline:editCharge", args: { ...clerk, chargeId: "chg_4", description: "Port congestion fee", amountCents: 15000 } },
      { fn: "drafts:requestApproval", args: { caseId: "case_A", personId: "maya" } },
    ]);
  });

  it("accepts and rejects through the server as the device's person, with the reason", async () => {
    results = { "drafts:approveDraft": { ok: true }, "drafts:rejectDraft": { ok: true } };
    const { actions, toast } = live(SAM);
    await act(async () => { actions.accept("d1"); actions.reject("d1", "They really did expedite it."); });
    expect(calls).toEqual([
      { fn: "drafts:approveDraft", args: { draftId: "d1", personId: "sam" } },
      { fn: "drafts:rejectDraft", args: { draftId: "d1", personId: "sam", reason: "They really did expedite it." } },
    ]);
    expect(toast).toHaveBeenCalledWith("Accepted. CargoOS is writing the message to the seller. Nothing was sent.");
  });

  it("says why when the server's gate refuses a decision", async () => {
    results = { "drafts:approveDraft": { ok: false, reason: "The requester can't approve their own request" } };
    const { actions, toast } = live(SAM);
    await act(async () => { actions.accept("d1"); });
    expect(toast).toHaveBeenCalledWith("The requester can't approve their own request. Nothing changed.");
  });

  it("sends pasted evidence to the server, which reads it and rechecks", async () => {
    const { actions } = live(MAYA);
    let outcome: unknown;
    await act(async () => { outcome = await actions.addEvidence({ type: "chat", text: "Derek: rush handling is free this time" }); });
    expect(calls).toEqual([{ fn: "uploads:addPastedText", args: { caseId: "case_A", personId: "maya", text: "Derek: rush handling is free this time", docType: "chat" } }]);
    expect(outcome).toEqual({ kind: "reading" });
  });

  it("resets the demo through the server", async () => {
    const { actions } = live(SAM);
    await act(async () => actions.reset("live"));
    expect(calls).toEqual([{ fn: "seed:resetDemo", args: { personId: "sam" } }]);
  });
});
