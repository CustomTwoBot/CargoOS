"use client";
// "Get started" / "Open the demo" on the landing page: a screen that was already set up goes straight
// to its bills; a new one goes to /start to pick who uses it (components/app/setup.ts).
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { cx } from "@/components/case/cx";
import { BUTTON } from "@/components/app/ui";
import { readSetup } from "@/components/app/setup";

export function GetStarted({ children = "Get started", variant = "primary", className }: {
  children?: ReactNode; /** null: only `className` styles the button. */ variant?: keyof typeof BUTTON | null; className?: string;
}) {
  const router = useRouter();
  return (
    <button type="button" className={cx(variant && BUTTON[variant], className)}
      onClick={() => router.push(readSetup() ? "/bills" : "/start")}>
      {children}
    </button>
  );
}
