import { Suspense } from "react";
import { LineEditorLab } from "@/components/inputs/line-editor-lab";

// The variation comes from ?v=, read on the client, so the page itself can prerender.
export default function Page() {
  return <Suspense><LineEditorLab /></Suspense>;
}
