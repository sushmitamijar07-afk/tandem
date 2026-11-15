"use client";

import { fmtCountdown } from "@/lib/format";

/** Presentational: seconds left as m:ss. The caller owns the 1 s tick (useNow). */
export function Countdown({ seconds, className = "" }: { seconds: number; className?: string }) {
  return <span className={`num ${className}`}>{fmtCountdown(seconds)}</span>;
}
