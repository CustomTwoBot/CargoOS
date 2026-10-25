"use client";
// The Convex client for live mode (SPEC W3 step 8). Without NEXT_PUBLIC_CONVEX_URL there is no provider and
// the app runs in replay mode; `useHasConvex` tells the screen which one it is in, since convex/react's hooks
// throw outside a provider.
import { ConvexProvider, ConvexReactClient } from "convex/react";
import { createContext, useContext, type ReactNode } from "react";

const url = process.env.NEXT_PUBLIC_CONVEX_URL;
const client = url ? new ConvexReactClient(url) : null;

const HasConvex = createContext(false);

/** True under a Convex provider: live queries and mutations can be used. */
export const useHasConvex = () => useContext(HasConvex);

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  if (!client) return <>{children}</>;
  return (
    <ConvexProvider client={client}>
      <HasConvex.Provider value>{children}</HasConvex.Provider>
    </ConvexProvider>
  );
}
