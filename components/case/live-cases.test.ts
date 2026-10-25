// @vitest-environment jsdom
// The backend's other cases (live-store.ts useOtherLiveCases): every case listCaseIds gives except Scenario A,
// each with its own actions as the device's person. Only convex/react is mocked.
import { act, cleanup, renderHook } from "@testing-library/react";
import type { FunctionReference } from "convex/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { personById } from "@/lib/people";
import { SCENARIO_A } from "./fixture";
import { useOtherLiveCases, type CaseView } from "./live-store";

const h = vi.hoisted(() => ({
  queries: {} as Record<string, unknown>,
  views: {} as Record<string, unknown>,
  calls: [] as { name: string; args: unknown }[],
}));

vi.mock("convex/react", async () => {
  const { getFunctionName } = await import("convex/server");
  return {
    useQuery: (ref: FunctionReference<"query">) => h.queries[getFunctionName(ref)],
    useQueries: (req: Record<string, unknown>) => Object.fromEntries(Object.keys(req).map((id) => [id, h.views[id]])),
    useMutation: (ref: FunctionReference<"mutation">) => async (args: unknown) => { h.calls.push({ name: getFunctionName(ref), args }); return null; },
  };
});

const MAYA = personById("maya")!;
const x = SCENARIO_A.at(SCENARIO_A.start);
const viewOf = (id: string, title: string) => ({
  case: { ...x.case, _id: id, title }, documents: x.documents, facts: x.facts, charges: x.charges, findings: x.findings, changes: [],
  totals: { billed: 0, agreed: 0, atStake: 0, waiting: 0, waived: 0 },
  questions: x.questions, replies: x.replies, draft: null, events: x.events,
}) as unknown as CaseView;

beforeEach(() => {
  h.queries = { "cases:getDemoCase": "case_A", "demoCases:listCaseIds": ["case_A", "c2", "c3"] };
  h.views = { c2: viewOf("c2", "Cedar & Co 2x40HC Yantian-Oakland"), c3: undefined };
  h.calls = [];
});
afterEach(cleanup);

describe("useOtherLiveCases", () => {
  it("lists the loaded cases other than Scenario A, in listCaseIds order", () => {
    const { result } = renderHook(() => useOtherLiveCases(MAYA, vi.fn()));
    expect(result.current.map((l) => [l.demo.id, l.demo.title, l.demo.live])).toEqual([["c2", "Cedar & Co 2x40HC Yantian-Oakland", true]]);
  });

  it("acts on its own case as the device's person, and has no reset of its own", async () => {
    const { result } = renderHook(() => useOtherLiveCases(MAYA, vi.fn()));
    await act(async () => {
      result.current[0].actions.draftDispute();
      result.current[0].actions.reset("live");
    });
    expect(h.calls).toEqual([{ name: "drafts:requestApproval", args: { caseId: "c2", personId: "maya" } }]);
  });

  it("is empty until the list loads", () => {
    h.queries = {};
    expect(renderHook(() => useOtherLiveCases(MAYA, vi.fn())).result.current).toEqual([]);
  });
});
