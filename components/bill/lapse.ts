"use client";
// Short-lived states on the bill page (a strip after a recheck, "was $300", a row flash) end after a
// set time. Next keeps visited pages alive and re-runs their effects when you come back, so a plain
// timer would start over; this one counts from when the state began, including time spent away.
import { useEffect, useRef } from "react";

/** Calls `done` once `ms` have passed since `token` became what it is now. A nullish or false token waits. */
export function useLapse(token: unknown, ms: number, done: () => void) {
  const started = useRef<{ token: unknown; at: number }>(undefined);
  const cb = useRef(done);
  useEffect(() => { cb.current = done; });
  useEffect(() => {
    if (token === undefined || token === null || token === false) { started.current = undefined; return; }
    if (!started.current || started.current.token !== token) started.current = { token, at: Date.now() };
    const t = setTimeout(() => cb.current(), Math.max(0, ms - (Date.now() - started.current.at)));
    return () => clearTimeout(t);
  }, [token, ms]);
}
