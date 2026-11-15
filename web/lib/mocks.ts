/** Mock data for local UI work. Only reachable when USE_MOCKS is true. Pick a state with ?state=<name>. */
import type {
  AccountData,
  BatchData,
  Clearing,
  IntentData,
  Params,
  Prices,
  RoundDetail,
  RoundInfo,
  Snapshot,
} from "@/lib/types";

export const SCENARIOS = [
  "open",
  "ready",
  "spot",
  "oracle",
  "unavailable",
  "refund",
  "expired",
  "empty",
  "settled",
  "paused",
  "full",
  "oneside",
  "loading",
] as const;
export type Scenario = (typeof SCENARIOS)[number];

export const isScenario = (s: string | null): s is Scenario => !!s && (SCENARIOS as readonly string[]).includes(s);

const E = 10n ** 18n;
const USER = "0x00000000000000000000000000000000000000a1" as const;
const OTHER = "0x00000000000000000000000000000000000000b2" as const;
export const MOCK_SETTLER = "0x00000000000000000000000000000000000000c3" as const;
const HASH = ("0x" + "ab".repeat(32)) as `0x${string}`;

const DURATION = 120;
const SETTLE_TIMEOUT = 7200;
const CURRENT = 40n;

const params: Params = {
  minMusd: 10n * E,
  minBtc: 10n ** 14n,
  maxIntents: 40,
  start: 0,
  oracleBandBps: 2114n,
  maxSpotTwapBps: 50n,
  granularity: 2n,
};

const prices: Prices = {
  spot: 78_222_484_474_000_000_000_000n,
  twap: 78_224_800_000_000_000_000_000n,
  oracle: 67_642_100_000_000_000_000_000n,
  spotTwapBps: 1n,
  twapOracleBps: 1565n,
  reserveMusd: 102257124585249121862151778n,
  reserveBtc: 1307259994017371489267n,
  feeBps: 4n,
};

const emptyBatch: BatchData = {
  status: 0,
  count: 0,
  live: 0,
  totalBtcIn: 0n,
  totalMusdIn: 0n,
  refPrice: 0n,
  twapPrice: 0n,
  oraclePrice: 0n,
  priceBtcSide: 0n,
  priceMusdSide: 0n,
  routedIn: 0n,
  routedOut: 0n,
  routedBtc: false,
};

/** Brief example 1, round 2: A sells 0.05 BTC, B sells 3,000 MUSD. */
const exampleClearing: Clearing = {
  refPrice: prices.spot,
  routeBtc: true,
  routeIn: 11_647_856_000_000_000n,
  routeOut: 910_751_662_000_000_000_000n,
  priceBtcSide: 78_215_030_000_000_000_000_000n,
  priceMusdSide: prices.spot,
  rounds: 2n,
  fills: [],
};

const openBatch: BatchData = { ...emptyBatch, count: 3, live: 3, totalBtcIn: 5n * 10n ** 16n, totalMusdIn: 4000n * E };

function round(id: bigint, now: number, closeIn: number, batch: BatchData): RoundInfo {
  const closeAt = Math.floor(now + closeIn);
  return {
    id,
    openAt: closeAt - DURATION,
    closeAt,
    expireAt: closeAt + SETTLE_TIMEOUT,
    batch,
    preview: null,
    previewError: null,
    intents: [],
  };
}

/** Example 1 intents for a round that still has live swaps (A sells BTC, B and C sell MUSD). */
function liveIntents(id: bigint, oneSided: boolean): IntentData[] {
  if (oneSided) return [mkIntent(7, OTHER, id, { side: 1, status: 1, amountIn: 500n * E, minOut: 6n * 10n ** 15n })];
  return [
    mkIntent(1, OTHER, id, { side: 0, status: 1, amountIn: 5n * 10n ** 16n, minOut: 3880n * E }),
    mkIntent(2, OTHER, id, { side: 1, status: 1, amountIn: 3000n * E, minOut: 38n * 10n ** 15n }),
    mkIntent(3, OTHER, id, { side: 1, status: 1, amountIn: 1000n * E, minOut: 12_800_000_000_000_000n }),
  ];
}

const exampleFills = [
  { id: 1n, filled: true, amountOut: 3_910_751_662_000_000_000_000n, refundIn: 0n },
  { id: 2n, filled: true, amountOut: 38_352_144_000_000_000n, refundIn: 0n },
  { id: 3n, filled: false, amountOut: 0n, refundIn: 1000n * E },
];

const settledBatch: BatchData = {
  ...emptyBatch,
  status: 1,
  count: 3,
  live: 0,
  totalBtcIn: 5n * 10n ** 16n,
  totalMusdIn: 4000n * E,
  refPrice: prices.spot,
  twapPrice: prices.twap,
  oraclePrice: prices.oracle,
  priceBtcSide: exampleClearing.priceBtcSide,
  priceMusdSide: exampleClearing.priceMusdSide,
  routedIn: exampleClearing.routeIn,
  routedOut: exampleClearing.routeOut,
  routedBtc: true,
};

export function mockSnapshot(s: Scenario, now: number): Snapshot {
  const cur = round(CURRENT, now, 72, { ...openBatch });
  cur.preview = { clearing: exampleClearing, prices };
  const rounds: RoundInfo[] = [cur];
  let p: Prices | null = prices;
  const earlier = (id: bigint, ago: number, batch: BatchData) => round(id, now, -ago, batch);

  switch (s) {
    case "ready": {
      const r = earlier(CURRENT - 1n, 20, { ...openBatch });
      r.preview = { clearing: exampleClearing, prices };
      rounds.push(r);
      break;
    }
    case "spot": {
      const r = earlier(CURRENT - 1n, 20, { ...openBatch });
      r.previewError = "SpotTwapDeviation";
      rounds.push(r);
      p = { ...prices, spotTwapBps: 82n };
      break;
    }
    case "oracle": {
      const r = earlier(CURRENT - 1n, 20, { ...openBatch });
      r.previewError = "OracleDeviation";
      rounds.push(r);
      p = { ...prices, twapOracleBps: 2300n };
      break;
    }
    case "unavailable": {
      const r = earlier(CURRENT - 1n, 20, { ...openBatch });
      r.previewError = "OracleUnavailable";
      rounds.push(r);
      p = { ...prices, oracle: 0n, twapOracleBps: 0n };
      break;
    }
    case "refund":
      rounds.push(earlier(CURRENT - 1n, SETTLE_TIMEOUT + 30, { ...openBatch }));
      break;
    case "expired":
      rounds.push(earlier(CURRENT - 1n, 300, { ...openBatch, status: 2, live: 0 }));
      break;
    case "empty":
      cur.batch = { ...emptyBatch };
      cur.preview = null;
      break;
    case "settled":
      rounds.push(earlier(CURRENT - 1n, 200, { ...settledBatch }));
      break;
    case "paused":
      break;
    case "full":
      cur.batch = { ...openBatch, count: 40, live: 40 };
      break;
    case "oneside":
      cur.batch = { ...emptyBatch, count: 1, live: 1, totalMusdIn: 500n * E };
      cur.preview = {
        clearing: { ...exampleClearing, routeBtc: false, routeIn: 500n * E, routeOut: 6_389_436_000_000_000n },
        prices,
      };
      rounds.push(earlier(CURRENT - 1n, 200, { ...settledBatch, totalBtcIn: 0n, totalMusdIn: 500n * E, count: 1 }));
      break;
    default:
      rounds.push(earlier(CURRENT - 1n, 200, { ...settledBatch }));
  }
  for (const r of rounds) {
    if (r.batch.status !== 0 || r.batch.live === 0 || r.batch.count >= params.maxIntents) continue;
    const one = s === "oneside" && r.id === CURRENT;
    r.intents = liveIntents(r.id, one);
    if (r.preview) {
      const fills = one ? [{ id: 7n, filled: true, amountOut: 6_389_436_000_000_000n, refundIn: 0n }] : exampleFills;
      r.preview = { ...r.preview, clearing: { ...r.preview.clearing, fills } };
    }
  }
  return {
    mock: true,
    deployed: true,
    chainTime: now,
    fetchedAt: Date.now(),
    paused: s === "paused",
    params,
    prices: p,
    pricesError: null,
    twap: { windowSec: 15_480, endedAgoSec: 21_240 },
    currentId: CURRENT,
    rounds,
  };
}

const mkIntent = (id: number, owner: `0x${string}`, batchId: bigint, over: Partial<IntentData>): IntentData => ({
  id: BigInt(id),
  owner,
  batchId,
  side: 1,
  status: 3,
  amountIn: 0n,
  minOut: 0n,
  amountOut: 0n,
  refundIn: 0n,
  ...over,
});

/** The round that results pages show: brief example 1 (B filled, C refunded, A filled). */
const RESULT_ID = CURRENT - 1n;
const resultIntents = (): IntentData[] => [
  mkIntent(1, OTHER, RESULT_ID, { side: 0, amountIn: 5n * 10n ** 16n, minOut: 3880n * E, amountOut: 3_910_751_662_000_000_000_000n }),
  mkIntent(2, USER, RESULT_ID, { side: 1, amountIn: 3000n * E, minOut: 38n * 10n ** 15n, amountOut: 38_352_144_000_000_000n }),
  mkIntent(3, USER, RESULT_ID, { side: 1, status: 4, amountIn: 1000n * E, minOut: 12_800_000_000_000_000n, refundIn: 1000n * E }),
];

export function mockAccount(s: Scenario, now: number): AccountData {
  const open = [
    mkIntent(4, USER, CURRENT, { side: 0, status: 1, amountIn: 2n * 10n ** 16n, minOut: 1500n * E }),
  ];
  const base: AccountData = {
    musdBalance: 5000n * E,
    btcBalance: 2n * E,
    musdAllowance: 0n,
    claimableMusd: 0n,
    claimableBtc: 0n,
    intents: [...open, ...resultIntents().filter((i) => i.owner === USER).reverse()],
  };
  void now;
  if (s === "settled" || s === "open") return { ...base, claimableBtc: 38_300_000_000_000_000n };
  if (s === "expired") {
    return {
      ...base,
      intents: [mkIntent(5, USER, CURRENT - 1n, { side: 1, status: 4, amountIn: 800n * E, minOut: 10n ** 16n, refundIn: 800n * E })],
    };
  }
  if (s === "oneside") {
    return {
      ...base,
      intents: [mkIntent(6, USER, CURRENT - 1n, { side: 1, amountIn: 500n * E, minOut: 6n * 10n ** 15n, amountOut: 6_389_436_000_000_000n })],
    };
  }
  return base;
}

export function mockRoundDetail(id: bigint, s: Scenario, now: number): RoundDetail {
  const snap = mockSnapshot(s, now);
  const found = snap.rounds.find((r) => r.id === id);
  if (s === "expired") {
    const r = found ?? round(id, now, -300, { ...emptyBatch, status: 2 });
    return { round: { ...r, batch: { ...r.batch, status: 2 } }, intents: mockAccount(s, now).intents, settled: null };
  }
  const r = round(id, now, -200, { ...settledBatch });
  if (s === "oneside") {
    return {
      round: { ...r, batch: { ...settledBatch, totalBtcIn: 0n, totalMusdIn: 500n * E, count: 1 } },
      intents: mockAccount(s, now).intents,
      settled: { settler: MOCK_SETTLER, reserveMusd: prices.reserveMusd, reserveBtc: prices.reserveBtc, feeBps: 4n, txHash: HASH },
    };
  }
  if (id >= CURRENT) return { round: found ?? r, intents: [], settled: null };
  return {
    round: r,
    intents: resultIntents(),
    settled: { settler: MOCK_SETTLER, reserveMusd: prices.reserveMusd, reserveBtc: prices.reserveBtc, feeBps: 4n, txHash: HASH },
  };
}

export const MOCK_USER = USER;
