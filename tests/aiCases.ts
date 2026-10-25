// Claude-call test cases built from the fixtures. Shared by tests/ai.test.ts (replaying recordings)
// and scripts/record.ts (calling the real API once to create them).
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { draftDispute, type DisputeDraft } from "../lib/ai/draftDispute";
import { extractDocument, type Extraction } from "../lib/ai/extract";
import { emlToText, pdfToText, plainText } from "../lib/ai/fileText";
import { prepareImage } from "../lib/ai/image";
import { transcribeImage, type Transcription } from "../lib/ai/transcribe";
import { interpretReply, resolveReply, type InterpretedReply } from "../lib/ai/interpretReply";
import { planQuestion } from "../lib/ai/planQuestion";
import type { ClaudeReply, ClaudeRequest, ClaudeSender } from "../lib/ai/client";
import type { CaseState, NewQuestion } from "../lib/ai/types";
import type { Finding, Question, SourceDoc } from "../lib/types";
import { loadScenarios, type Scenario } from "../scripts/evalCore";
import ui from "../fixtures/scenarioA.ui.json";

export const RECORDINGS_DIR = join(process.cwd(), "tests", "recordings");
export const LIVE_DIR = join(process.cwd(), "fixtures", "live");
const SCENARIOS = loadScenarios(join(process.cwd(), "fixtures"));
const scenario = (id: string) => SCENARIOS.find((s) => s.id === id)!;

// ---- Inputs ----

const A_BEFORE = ui.findings["1"] as Finding[];
const A_AFTER = ui.findings["2"] as Finding[];

function stateFor(s: Scenario, findings: Finding[], extraDocs: SourceDoc[] = [], questions: Question[] = []): CaseState {
  return {
    case: s.extracted.case,
    documents: [...s.extracted.documents, ...extraDocs],
    facts: s.extracted.facts,
    charges: s.extracted.charges,
    findings,
    questions,
  };
}

const withLine = (findings: Finding[], lineNo: number, change: Partial<Finding>) =>
  findings.map((f) => (f.lineNo === lineNo ? { ...f, ...change } : f));

// A-nopss: line 2 has no PSS clause to lean on, so it waits too.
const NOPSS_BEFORE = withLine(A_BEFORE, 2, {
  status: "needs_review", ruleId: "R6_NO_EVIDENCE", expectedCents: undefined, factIds: [], evidence: [],
  missing: ["no agreement found for pss"], routeTo: "ops_lead",
  explanation: "Billed $400. Nothing in the quote, emails or chats agrees to this charge.",
});
// A-clean: everything matches, nothing waits.
const CLEAN = scenario("A-clean").key.expected.findings.map((f): Finding => ({
  key: `chg_${f.lineNo}`, caseId: "case_A-clean", chargeId: `chg_${f.lineNo}`, lineNo: f.lineNo, revision: 1,
  status: f.status, ruleId: f.ruleId, billedCents: f.billedCents, expectedCents: f.expectedCents,
  factIds: [], evidence: [], explanation: "",
}));

const QUESTION_A: Question = { ...(ui.question as Question), status: "open" };
const replyDoc = (id: string, n = 1): SourceDoc => scenario(id).replies[n - 1].replyDoc;

export const INPUTS = {
  planA: stateFor(scenario("A"), A_BEFORE),
  planNopss: stateFor(scenario("A-nopss"), NOPSS_BEFORE),
  planClean: stateFor(scenario("A-clean"), CLEAN),
  draftA: stateFor(scenario("A"), A_AFTER, [replyDoc("A")]),
  questionA: QUESTION_A,
  replyState: (id: string) => stateFor(scenario(id), A_BEFORE, scenario(id).replies.map((r) => r.replyDoc), [QUESTION_A]),
  replyDoc,
};

// ---- Live demo files (fixtures/live/, SPEC.md 7.7), read the way the upload backend reads them ----

const live = (file: string) => readFileSync(join(LIVE_DIR, file));
const liveDoc = (id: string, type: SourceDoc["type"], title: string, text: string, extra: Partial<SourceDoc> = {}): SourceDoc =>
  ({ _id: id, caseId: "case_live", type, title, text, ...extra });

export const LIVE_DOCS = {
  quote: async () => liveDoc("doc_quote", "quote", "quote.pdf", await pdfToText(new Uint8Array(live("quote.pdf"))), { textFrom: "pdf" }),
  invoice: async () => liveDoc("doc_invoice", "freight_invoice", "invoice.pdf", await pdfToText(new Uint8Array(live("invoice.pdf"))), { textFrom: "pdf" }),
  email: async () => {
    const e = emlToText(live("email.eml").toString("utf8"));
    return liveDoc("doc_email", "email", "email.eml", e.text, { textFrom: "eml", sentAt: e.sentAt, sender: e.from });
  },
  chat: async () => liveDoc("doc_chat", "chat", "whatsapp.txt", plainText(live("whatsapp.txt").toString("utf8")), { textFrom: "txt" }),
};

async function liveImage(file: string) {
  const prepared = await prepareImage(new Uint8Array(live(file)), "image/png");
  if (!prepared.ok) throw new Error(prepared.reason);
  return prepared.image;
}

export interface ScreenshotResult {
  transcription: Transcription;
  extraction: Extraction | null;
}

// ---- Cases that call Claude ----

export interface AmbigResult {
  first: InterpretedReply;
  firstResolution: ReturnType<typeof resolveReply>;
  second: InterpretedReply;
  secondResolution: ReturnType<typeof resolveReply>;
}

export const AI_CASES = {
  "planQuestion-A": (send: ClaudeSender) => planQuestion(INPUTS.planA, INPUTS.planA.findings, { send }),
  "planQuestion-A-nopss": (send: ClaudeSender) => planQuestion(INPUTS.planNopss, INPUTS.planNopss.findings, { send }),
  "interpretReply-A": (send: ClaudeSender) => interpretReply(QUESTION_A, replyDoc("A"), INPUTS.replyState("A"), { send }),
  "interpretReply-A-no": (send: ClaudeSender) => interpretReply(QUESTION_A, replyDoc("A-no"), INPUTS.replyState("A-no"), { send }),
  "interpretReply-A-yes": (send: ClaudeSender) => interpretReply(QUESTION_A, replyDoc("A-yes"), INPUTS.replyState("A-yes"), { send }),
  // Two replies in one thread: the follow-up asked after the first is the question for the second.
  "interpretReply-A-ambig": async (send: ClaudeSender): Promise<AmbigResult> => {
    const state = INPUTS.replyState("A-ambig");
    const first = await interpretReply(QUESTION_A, replyDoc("A-ambig", 1), state, { send });
    const firstResolution = resolveReply(QUESTION_A, first, state.questions);
    const followUp: Question = { ...(firstResolution.followUp as NewQuestion), _id: "q_2", caseId: "case_A-ambig", status: "open", createdAt: "2026-10-24T14:06:00-07:00" };
    const questions = [{ ...QUESTION_A, status: firstResolution.questionStatus }, followUp];
    const second = await interpretReply(followUp, replyDoc("A-ambig", 2), { ...state, questions }, { send });
    return { first, firstResolution, second, secondResolution: resolveReply(followUp, second, questions) };
  },
  "draftDispute-A": (send: ClaudeSender): Promise<DisputeDraft> => draftDispute(A_AFTER, INPUTS.draftA, { send }),
  "extract-live-quote": async (send: ClaudeSender): Promise<Extraction> => extractDocument(await LIVE_DOCS.quote(), { send }),
  "extract-live-invoice": async (send: ClaudeSender): Promise<Extraction> => extractDocument(await LIVE_DOCS.invoice(), { send }),
  "extract-live-email": async (send: ClaudeSender): Promise<Extraction> => extractDocument(await LIVE_DOCS.email(), { send }),
  "extract-live-chat": async (send: ClaudeSender): Promise<Extraction> => extractDocument(await LIVE_DOCS.chat(), { send }),
  // Screenshot: transcribe once, then the normal extraction on the transcription.
  "transcribe-live-whatsapp-png": async (send: ClaudeSender): Promise<ScreenshotResult> => {
    const transcription = await transcribeImage(await liveImage("whatsapp.png"), { send });
    const extraction = transcription.readable
      ? await extractDocument(liveDoc("doc_chat_png", "chat", "whatsapp.png", transcription.text, { textFrom: "image" }), { send })
      : null;
    return { transcription, extraction };
  },
  "transcribe-unreadable-png": async (send: ClaudeSender): Promise<Transcription> => transcribeImage(await liveImage("unreadable.png"), { send }),
} satisfies Record<string, (send: ClaudeSender) => Promise<unknown>>;

export type CaseName = keyof typeof AI_CASES;

// ---- Recordings ----

interface Recording {
  name: string;
  model: string;
  recordedAt: string;
  calls: { request: ClaudeRequest; reply: ClaudeReply }[];
}

const recordingPath = (name: string, dir: string) => join(dir, `${name}.json`);
export const hasRecording = (name: CaseName, dir = RECORDINGS_DIR) => existsSync(recordingPath(name, dir));

// Images are stored as a hash, so recordings stay small but still notice a changed image.
const forRecording = (request: ClaudeRequest): ClaudeRequest => request.image
  ? { ...request, image: { mediaType: request.image.mediaType, data: `sha256:${createHash("sha256").update(request.image.data).digest("hex")}` } }
  : request;

// Replays a recording in order; a request that differs from the recorded one means the prompt or
// inputs changed since recording, so the test fails instead of silently passing.
export function replaySender(name: CaseName, dir = RECORDINGS_DIR): ClaudeSender {
  const recording = JSON.parse(readFileSync(recordingPath(name, dir), "utf8")) as Recording;
  let i = 0;
  return async (request) => {
    const call = recording.calls[i++];
    if (!call) throw new Error(`${name}: more Claude calls than recorded; re-run npm run record`);
    if (JSON.stringify(call.request) !== JSON.stringify(forRecording(request))) {
      throw new Error(`${name}: request differs from the recording (prompt or inputs changed); re-run npm run record`);
    }
    return call.reply;
  };
}

export function recordingSender(name: CaseName, live: ClaudeSender, dir = RECORDINGS_DIR) {
  const calls: Recording["calls"] = [];
  const send: ClaudeSender = async (request) => {
    const reply = await live(request);
    calls.push({ request: forRecording(request), reply });
    return reply;
  };
  const save = (model: string) => {
    const recording: Recording = { name, model, recordedAt: new Date().toISOString(), calls };
    writeFileSync(recordingPath(name, dir), JSON.stringify(recording, null, 2) + "\n");
  };
  return { send, save, calls };
}
