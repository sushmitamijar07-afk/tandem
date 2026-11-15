import type { Address } from "viem";

export interface Prices {
  spot: bigint;
  twap: bigint;
  oracle: bigint;
  spotTwapBps: bigint;
  twapOracleBps: bigint;
  reserveMusd: bigint;
  reserveBtc: bigint;
  feeBps: bigint;
}

export interface BatchData {
  status: number;
  count: number;
  live: number;
  totalBtcIn: bigint;
  totalMusdIn: bigint;
  refPrice: bigint;
  twapPrice: bigint;
  oraclePrice: bigint;
  priceBtcSide: bigint;
  priceMusdSide: bigint;
  routedIn: bigint;
  routedOut: bigint;
  routedBtc: boolean;
}

export interface Fill {
  id: bigint;
  filled: boolean;
  amountOut: bigint;
  refundIn: bigint;
}

export interface Clearing {
  refPrice: bigint;
  routeBtc: boolean;
  routeIn: bigint;
  routeOut: bigint;
  priceBtcSide: bigint;
  priceMusdSide: bigint;
  rounds: bigint;
  fills: readonly Fill[];
}

export interface IntentData {
  id: bigint;
  owner: Address;
  batchId: bigint;
  side: number;
  status: number;
  amountIn: bigint;
  minOut: bigint;
  amountOut: bigint;
  refundIn: bigint;
}

export interface RoundInfo {
  id: bigint;
  openAt: number;
  closeAt: number;
  expireAt: number;
  batch: BatchData;
  /** What would happen if settled now. Null when not asked for or it reverted. */
  preview: { clearing: Clearing; prices: Prices } | null;
  /** Custom error name when preview reverted (guard errors etc). */
  previewError: string | null;
  /** The round's intents; loaded only for rounds with live swaps (to split by side and sum matches). */
  intents: IntentData[];
}

export interface Params {
  minMusd: bigint;
  minBtc: bigint;
  maxIntents: number;
  start: number;
  oracleBandBps: bigint;
  maxSpotTwapBps: bigint;
  granularity: bigint;
}

export interface Snapshot {
  mock: boolean;
  deployed: boolean;
  /** Chain time in seconds at fetch, and the client clock (ms) at the same moment. */
  chainTime: number;
  fetchedAt: number;
  paused: boolean;
  params: Params;
  prices: Prices | null;
  pricesError: string | null;
  /** Real window behind the pool average (TWAP). */
  twap: { windowSec: number; endedAgoSec: number } | null;
  currentId: bigint;
  /** Current round first, then earlier rounds (newest first). */
  rounds: RoundInfo[];
}

export interface AccountData {
  musdBalance: bigint;
  btcBalance: bigint;
  musdAllowance: bigint;
  claimableMusd: bigint;
  claimableBtc: bigint;
  intents: IntentData[];
}

export interface SettleEvent {
  settler: Address;
  reserveMusd: bigint;
  reserveBtc: bigint;
  feeBps: bigint;
  txHash: `0x${string}`;
}

export interface RoundDetail {
  round: RoundInfo;
  intents: IntentData[];
  settled: SettleEvent | null;
}
