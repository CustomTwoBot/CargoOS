"use client";
// Documents screen at 1280: what CargoOS has, what it read from each document, and what failed.
// Replay mode only for now: Scenario A after the answer, from the fixture. Live Convex data later.
// Three variations for the lab (app/lab/documents); /documents shows the recommended one.
import { scenarioAAt } from "@/components/case/fixture";
import type { CaseInput } from "@/components/case/view-model";
import { docRows } from "./documents";
import { ListView } from "./list-view";
import { Shell } from "./parts";
import { TimelineView } from "./timeline-view";
import { TrackerView } from "./tracker-view";

export type Variant = "list" | "timeline" | "tracker";

export function DocumentsScreen({ x = scenarioAAt("after"), variant = "list" }: { x?: CaseInput; variant?: Variant }) {
  const rows = docRows(x);
  return (
    <Shell x={x} count={rows.length}>
      {variant === "timeline" ? <TimelineView x={x} rows={rows} />
        : variant === "tracker" ? <TrackerView x={x} rows={rows} />
        : <ListView x={x} rows={rows} />}
    </Shell>
  );
}
