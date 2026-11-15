import { Side } from "@/lib/contracts";
import type { IntentData, RoundInfo } from "@/lib/types";

export interface SideTotals {
  btcIn: bigint;
  btcCount: number;
  musdIn: bigint;
  musdCount: number;
}

/** Open swaps in a round, split by side. Falls back to the batch totals when intents weren't loaded. */
export function sideTotals(r: RoundInfo): SideTotals {
  if (r.intents.length === 0) {
    return { btcIn: r.batch.totalBtcIn, btcCount: 0, musdIn: r.batch.totalMusdIn, musdCount: 0 };
  }
  const open = r.intents.filter((i) => i.status === 1);
  const btc = open.filter((i) => i.side === Side.SellBtc);
  const musd = open.filter((i) => i.side === Side.SellMusd);
  const sum = (xs: IntentData[]) => xs.reduce((a, i) => a + i.amountIn, 0n);
  return { btcIn: sum(btc), btcCount: btc.length, musdIn: sum(musd), musdCount: musd.length };
}

export interface Matched {
  /** Matched internally, at the uniform price. */
  btc: bigint;
  musd: bigint;
  /** Left over, sent to the pool, in the token that was sold into it. */
  poolAmount: bigint;
  poolIsBtc: boolean;
}

/** "Matched if settled now" from a preview. Null when there's nothing to show. */
export function matchedSummary(r: RoundInfo): Matched | null {
  const c = r.preview?.clearing;
  if (!c || r.intents.length === 0) return null;
  const filled = new Map(c.fills.map((f) => [f.id, f]));
  // Y side = the side that is fully matched at the reference price.
  const ySide = c.routeBtc ? Side.SellMusd : Side.SellBtc;
  let yIn = 0n;
  let yOut = 0n;
  for (const i of r.intents) {
    const f = filled.get(i.id);
    if (i.side !== ySide || !f || !f.filled) continue;
    yIn += i.amountIn;
    yOut += f.amountOut;
  }
  if (yIn === 0n) return { btc: 0n, musd: 0n, poolAmount: c.routeIn, poolIsBtc: c.routeBtc };
  return c.routeBtc
    ? { btc: yOut, musd: yIn, poolAmount: c.routeIn, poolIsBtc: true }
    : { btc: yIn, musd: yOut, poolAmount: c.routeIn, poolIsBtc: false };
}
