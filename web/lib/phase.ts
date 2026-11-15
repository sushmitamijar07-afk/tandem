import { BatchStatus } from "@/lib/contracts";
import type { RoundInfo } from "@/lib/types";

export type Phase = "open" | "ready" | "empty" | "refund" | "settled" | "expired";

/** SPEC D38. `now` is chain-corrected unix seconds. */
export function phaseOf(r: RoundInfo, now: number): Phase {
  if (r.batch.status === BatchStatus.Settled) return "settled";
  if (r.batch.status === BatchStatus.Expired) return "expired";
  if (now < r.closeAt) return "open";
  if (r.batch.live === 0) return "empty";
  if (now >= r.expireAt) return "refund";
  return "ready";
}

/** The guard problem behind a failed preview, in plain classes. */
export type GuardProblem = "spot" | "oracle" | "unavailable" | "poolPaused" | "other";

export function guardProblem(name: string | null): GuardProblem | null {
  if (!name) return null;
  if (name === "SpotTwapDeviation") return "spot";
  if (name === "OracleDeviation") return "oracle";
  if (name === "OracleUnavailable") return "unavailable";
  if (name === "PoolPaused") return "poolPaused";
  return "other";
}
