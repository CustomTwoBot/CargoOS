// The evidence chain speaks to whoever answered CargoOS's question as "you" (evidence.ts). On a screen
// that doesn't answer (the bookkeeper), the same steps name the person who did: "Sam said it wasn't
// agreed", "Sam's answer, Oct 24" (docs/design.md §0.3). Pure: exact phrases only, nothing guessed.
// TODO(merge): move into `chainOf` once evidence.ts takes the viewer.
import type { Chain, ChainStep } from "./evidence";

const TITLES: Record<string, (n: string) => string> = {
  "You approved it": (n) => `${n} approved it`,
  "You said it wasn't agreed": (n) => `${n} said it wasn't agreed`,
};
const RESULTS: Record<string, (n: string) => string> = {
  "Waiting for your answer": (n) => `Waiting for ${n}'s answer`,
  "Sources disagree, waiting for your answer": (n) => `Sources disagree, waiting for ${n}'s answer`,
};
const ANSWER = "Your answer";

const step = (s: ChainStep, n: string): ChainStep => ({
  ...s,
  title: TITLES[s.title]?.(n) ?? s.title,
  where: s.where?.startsWith(ANSWER) ? `${n}'s answer${s.where.slice(ANSWER.length)}` : s.where,
});

/** The chain as `answerer` ("Sam") is named on this screen; unchanged when the screen answers itself. */
export function chainFor(chain: Chain, answerer?: string): Chain {
  if (!answerer) return chain;
  return {
    steps: chain.steps.map((s) => step(s, answerer)),
    result: { ...chain.result, text: RESULTS[chain.result.text]?.(answerer) ?? chain.result.text },
  };
}
