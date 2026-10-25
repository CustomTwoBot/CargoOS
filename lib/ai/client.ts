// Claude client (SPEC.md 9, W2 step 1): one JSON call, parsed with Zod, retried once on invalid output.
// The transport is a ClaudeSender so tests replay recordings (tests/recordings/) and CI never calls the API.
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";
import { CLAUDE_MODEL } from "./config";

export interface ClaudeRequest {
  model: string;
  system: string;
  user: string;
  jsonSchema: Record<string, unknown>;
}

export interface ClaudeReply {
  stopReason: string | null;
  text: string;
}

export type ClaudeSender = (request: ClaudeRequest) => Promise<ClaudeReply>;

export type ClaudeErrorKind = "missing_api_key" | "api" | "refusal" | "invalid_output";

export class ClaudeError extends Error {
  constructor(
    readonly kind: ClaudeErrorKind,
    message: string,
    readonly attempts: number,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "ClaudeError";
  }
}

export interface CallClaudeOptions<T> {
  system: string;
  user: string;
  schema: z.ZodType<T>;
  // Extra checks that JSON Schema can't express (e.g. "no digits"). Returns problems; any problem = invalid output.
  check?: (value: T) => string[];
  send?: ClaudeSender;
}

const MAX_ATTEMPTS = 2; // first try + one retry on invalid output

// Real transport. The key comes from the environment (Convex env vars in production), never from code.
export function anthropicSender(apiKey = process.env.ANTHROPIC_API_KEY): ClaudeSender {
  return async (request) => {
    if (!apiKey) throw new ClaudeError("missing_api_key", "ANTHROPIC_API_KEY is not set", 0);
    const client = new Anthropic({ apiKey });
    try {
      const response = await client.beta.messages.create({
        model: request.model,
        max_tokens: 16000,
        // Server-side fallback on policy declines (Claude API only).
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        system: request.system,
        messages: [{ role: "user", content: request.user }],
        output_config: { effort: "medium", format: { type: "json_schema", schema: request.jsonSchema } },
      });
      const text = response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
      return { stopReason: response.stop_reason, text };
    } catch (e) {
      if (e instanceof Anthropic.APIError) throw new ClaudeError("api", `Claude API error ${e.status ?? ""}: ${e.message}`, 1, e);
      throw e;
    }
  };
}

function parseReply<T>(reply: ClaudeReply, schema: z.ZodType<T>, check?: (value: T) => string[]): { value: T } | { problem: string } {
  if (reply.stopReason === "max_tokens") return { problem: "output was cut off (max_tokens)" };
  let json: unknown;
  try {
    json = JSON.parse(reply.text);
  } catch {
    return { problem: "output is not valid JSON" };
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) return { problem: `output does not match the schema: ${parsed.error.message}` };
  const problems = check?.(parsed.data) ?? [];
  if (problems.length > 0) return { problem: problems.join("; ") };
  return { value: parsed.data };
}

export async function callClaude<T>({ system, user, schema, check, send = anthropicSender() }: CallClaudeOptions<T>): Promise<T> {
  const request: ClaudeRequest = { model: CLAUDE_MODEL, system, user, jsonSchema: zodOutputFormat(schema).schema };
  const problems: string[] = [];
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const reply = await send(request);
    if (reply.stopReason === "refusal") throw new ClaudeError("refusal", "Claude declined the request", attempt);
    const result = parseReply(reply, schema, check);
    if ("value" in result) return result.value;
    problems.push(`attempt ${attempt}: ${result.problem}`);
  }
  throw new ClaudeError("invalid_output", `Claude returned invalid output twice (${problems.join(" | ")})`, MAX_ATTEMPTS);
}
