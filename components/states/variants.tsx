// The three state variations, each composed over the lab's sample screen (app/lab/states).
// One table so the lab and the tests walk the same scenes.
import type { ReactNode } from "react";
import { TOASTS, type ExtractionFailure } from "./copy";
import { PanelEmpty, PanelFailed, PanelLoading, PanelRechecking, PanelToast } from "./panel";
import { QUIET_DIM, QuietEmpty, QuietFailedBanner, QuietRecheckLine, QuietSkeleton, QuietToast } from "./quiet";
import { SAMPLE, SampleScreen } from "./sample";
import { ToastRegion } from "./shared";
import { STRIP_BODY, StatusStrip } from "./strip";

export type SceneKey = "loading" | "rechecking" | "failed" | "empty" | "toasts";
export type Handlers = { onPaste?: () => void; onLoad?: () => void; onUndo?: () => void; onKeepWaiting?: () => void };
export type Scene = { key: SceneKey; render: (h: Handlers) => ReactNode; below?: (h: Handlers) => ReactNode };
export type Variant = { id: "A" | "B" | "C"; name: string; idea: string; tradeoff: string; scenes: Scene[] };

export const SCENE_TITLE: Record<SceneKey, string> = {
  loading: "Loading, first open of a case",
  rechecking: "Rechecking after your answer",
  failed: "Extraction failed",
  empty: "Empty case",
  toasts: "Toasts for your own actions",
};

/** Scenario A: the chat's congestion messages could not be read, so line 4 stays waiting. */
export const SAMPLE_FAILURE: ExtractionFailure = {
  document: "WhatsApp chat",
  where: "messages 3–4",
  lines: SAMPLE.rows.filter((r) => r.lineNo === 4).map(({ lineNo, description }) => ({ lineNo, description })),
};

const N = SAMPLE.chargeCount;

export const VARIANTS: Variant[] = [
  {
    id: "A", name: "Quiet, in place",
    idea: "Each state shows inside the card it affects; the screen keeps its shape and nothing jumps.",
    tradeoff: "Easy to miss from the back of a room: rechecking is one small line in the totals card.",
    scenes: [
      { key: "loading", render: () => <SampleScreen body={<QuietSkeleton />} /> },
      { key: "rechecking", render: () => <SampleScreen pill="Replay" statusLine={<QuietRecheckLine count={N} />} dimNumbers={QUIET_DIM} /> },
      { key: "failed", render: (h) => <SampleScreen pill="Replay" aboveList={<QuietFailedBanner failure={SAMPLE_FAILURE} onPaste={h.onPaste} />} /> },
      { key: "empty", render: (h) => <SampleScreen blank list={<QuietEmpty onLoad={h.onLoad} />} /> },
      { key: "toasts", render: (h) => (
        <SampleScreen pill="Replay" toasts={
          <ToastRegion contained>
            <QuietToast text={TOASTS.dismissed} onUndo={h.onUndo} />
            <QuietToast text={TOASTS.approved} />
          </ToastRegion>
        } />
      ) },
    ],
  },
  {
    id: "B", name: "One status strip",
    idea: "A 40px strip under the header carries every state and every confirmation: one place to look.",
    tradeoff: "Confirmations leave the bottom-right toast spot (docs/design.md §7.14), and the empty case is thin.",
    scenes: [
      { key: "loading", render: () => <SampleScreen statusLine={false} strip={<StatusStrip state={{ kind: "loading" }} />} bodyClass={STRIP_BODY.loading} /> },
      { key: "rechecking", render: () => <SampleScreen pill="Replay" statusLine={false} strip={<StatusStrip state={{ kind: "rechecking", count: N }} />} bodyClass={STRIP_BODY.rechecking} /> },
      { key: "failed", render: (h) => <SampleScreen pill="Replay" statusLine={false} strip={<StatusStrip state={{ kind: "failed", failure: SAMPLE_FAILURE, onPaste: h.onPaste }} />} /> },
      { key: "empty", render: (h) => <SampleScreen blank statusLine={false} strip={<StatusStrip state={{ kind: "empty", onLoad: h.onLoad }} />} bodyClass={STRIP_BODY.empty} /> },
      {
        key: "toasts",
        render: (h) => <SampleScreen pill="Replay" statusLine={false} strip={<StatusStrip state={{ kind: "saved", text: TOASTS.dismissed, onUndo: h.onUndo }} />} />,
        below: () => <StatusStrip state={{ kind: "saved", text: TOASTS.approved }} />,
      },
    ],
  },
  {
    id: "C", name: "Full panel",
    idea: "The state takes the whole work area with one clear action; impossible to miss.",
    tradeoff: "Rechecking covers the lines, so rows start moving only after the panel closes; heavy for a one-second load.",
    scenes: [
      { key: "loading", render: () => <SampleScreen body={<PanelLoading />} /> },
      { key: "rechecking", render: () => (
        <SampleScreen pill="Replay" overlay={<PanelRechecking count={N} answer={SAMPLE.answer} />} bodyBehindOverlay="opacity-15" />
      ) },
      { key: "failed", render: (h) => (
        <SampleScreen pill="Replay" bodyBehindOverlay="opacity-15"
          overlay={<PanelFailed failure={SAMPLE_FAILURE} onPaste={h.onPaste} onKeepWaiting={h.onKeepWaiting} />} />
      ) },
      { key: "empty", render: (h) => <SampleScreen blank body={<PanelEmpty onLoad={h.onLoad} />} /> },
      { key: "toasts", render: (h) => (
        <SampleScreen pill="Replay" toasts={
          <ToastRegion contained>
            <PanelToast text={TOASTS.dismissed} onUndo={h.onUndo} />
            <PanelToast text={TOASTS.approved} />
          </ToastRegion>
        } />
      ) },
    ],
  },
];
