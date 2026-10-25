import { Suspense } from "react";
import { AddEvidenceLab } from "@/components/inputs/add-evidence-lab";

// The variation comes from ?v=, read on the client, so the page itself can prerender.
export default function Page() {
  return <Suspense><AddEvidenceLab /></Suspense>;
}
