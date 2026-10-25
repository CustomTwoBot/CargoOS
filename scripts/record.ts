// Records real Claude responses for the tests (tests/recordings/). Run manually; it costs API calls.
//   ANTHROPIC_API_KEY=... npm run record                 all cases
//   ANTHROPIC_API_KEY=... npm run record -- draftDispute-A   one case
// Commit the JSON files it writes. CI only replays them.
import { CLAUDE_MODEL } from "../lib/ai/config";
import { anthropicSender } from "../lib/ai/client";
import { AI_CASES, recordingSender, type CaseName } from "../tests/aiCases";

async function main(): Promise<number> {
  if (process.env.CI) {
    console.error("record: refusing to run in CI; it calls the Claude API.");
    return 1;
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("record: set ANTHROPIC_API_KEY in your shell first (it is never stored in the repo).");
    return 1;
  }
  const wanted = process.argv.slice(2);
  const names = (Object.keys(AI_CASES) as CaseName[]).filter((n) => wanted.length === 0 || wanted.includes(n));
  if (names.length === 0) {
    console.error(`record: no case named ${wanted.join(", ")}. Cases: ${Object.keys(AI_CASES).join(", ")}`);
    return 1;
  }

  let failed = 0;
  for (const name of names) {
    const recorder = recordingSender(name, anthropicSender());
    try {
      const result = await AI_CASES[name](recorder.send);
      recorder.save(CLAUDE_MODEL);
      console.log(`recorded ${name} (${recorder.calls.length} call${recorder.calls.length === 1 ? "" : "s"})`);
      console.log(JSON.stringify(result, null, 2));
    } catch (e) {
      failed++;
      // Save anyway, so an invalid-output failure can be inspected and replayed.
      if (recorder.calls.length > 0) recorder.save(CLAUDE_MODEL);
      console.error(`FAILED ${name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return failed === 0 ? 0 : 1;
}

main().then((code) => process.exit(code), (e: unknown) => {
  console.error(e);
  process.exit(1);
});
