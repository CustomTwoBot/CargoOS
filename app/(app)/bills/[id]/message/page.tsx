"use client";
// /bills/[id]/message: the letter to the forwarder (docs/design.md §0.5, L1), inside the app frame.
import { useParams } from "next/navigation";
import { LetterPage } from "@/components/letter/letter-page";

export default function MessagePage() {
  const { id } = useParams<{ id: string }>();
  return <LetterPage id={decodeURIComponent(id)} />;
}
