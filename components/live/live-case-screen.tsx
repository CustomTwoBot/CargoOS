"use client";
// The page's container: reads the live case from Convex when a deployment is configured and hands
// it to `CaseScreen`, which stays a plain view tested with recorded cases. Without Convex, while it
// loads, or when the demo case isn't seeded, Scenario A plays from the recording (labeled Replay).
import { CaseScreen } from "@/components/case/case-screen";
import { useDevicePerson } from "@/components/shell/person";
import { CONVEX_URL } from "./live-provider";
import { useLiveCase } from "./use-live-case";

export function LiveCaseScreen() {
  return CONVEX_URL ? <WithLive /> : <CaseScreen />;
}

function WithLive() {
  const state = useLiveCase(useDevicePerson());
  return <CaseScreen live={state.status === "ready" ? state.live : undefined} />;
}
