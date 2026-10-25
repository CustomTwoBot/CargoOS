// The contract every replay case follows (SPEC W3 step 1, docs/demo-script.md). The case screen
// knows nothing about Scenario A: it asks the case for a snapshot, and when the operator answers a
// question it plays that answer's beats. A beat is a snapshot plus the list item to bring into view.
import type { Draft } from "@/lib/types";
import type { CaseInput } from "./view-model";

/** One step of an answer's replay: after `at` ms, show snapshot `stage`, bring `moving` into view. */
export type Beat = { at: number; stage: string; moving?: string };

export type RecordedAnswer = {
  /** The answer CargoOS reads in replay, whatever the operator types. Shown to the presenter. */
  text: string;
  /** Snapshots in order; the first beat should be the "rechecking" snapshot at 0 ms. */
  beats: Beat[];
};

export interface DemoCase {
  id: string;
  /** For the case list: "Bayline 40HC Ningbo-LB". */
  title: string;
  /** One plain line for the case list: "1 invoice, 8 charges, one question". */
  summary: string;
  /** The snapshot the case opens on, and the one "After answers" jumps to. */
  start: string;
  end: string;
  /** Every snapshot id the case can show, in story order. */
  stages: string[];
  /** The full case at a snapshot. Must be pure and cheap enough to call on every render. */
  at(stage: string): CaseInput;
  /** Keyed by question _id: what happens when the operator answers it. */
  answers: Record<string, RecordedAnswer>;
  /** The dispute draft for the case as it stands, or undefined when nothing is disputed yet. */
  draft(x: CaseInput): Draft | undefined;
  /** True for the live case read from Convex: no snapshots to jump between, no recorded answers. */
  live?: boolean;
}
