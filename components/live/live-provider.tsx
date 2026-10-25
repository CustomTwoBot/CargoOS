"use client";
// Connects the app to Convex when a deployment is configured (NEXT_PUBLIC_CONVEX_URL, set in Vercel
// and in .env.local by `npx convex dev`). Without one the app runs on recorded replays only.
import { ConvexProvider, ConvexReactClient } from "convex/react";
import type { ReactNode } from "react";

export const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL;

const client = CONVEX_URL ? new ConvexReactClient(CONVEX_URL) : null;

export function LiveProvider({ children }: { children: ReactNode }) {
  return client ? <ConvexProvider client={client}>{children}</ConvexProvider> : <>{children}</>;
}
