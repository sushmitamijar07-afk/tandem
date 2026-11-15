/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Address, PublicClient } from "viem";
import {
  BATCH_SETTLER_ABI,
  CONTRACTS,
  ERC20_ABI,
  INTENT_BOOK_ABI,
  MEZO,
  POOL_ABI,
  PRICE_GUARD_ABI,
  ROUTER_ABI,
  isDeployed,
  routeOf,
} from "@/lib/contracts";
import { errorNameOf } from "@/lib/errors";
import type {
  AccountData,
  BatchData,
  IntentData,
  Params,
  Prices,
  RoundDetail,
  RoundInfo,
  SettleEvent,
  Snapshot,
} from "@/lib/types";

void BATCH_SETTLER_ABI;

/** How many rounds back the live panel looks for rounds still waiting to settle. */
export const LOOKBACK = 6;
const MY_INTENTS_MAX = 60;

export const contractsDeployed = () =>
  isDeployed(CONTRACTS.intentBook) && isDeployed(CONTRACTS.priceGuard) && isDeployed(CONTRACTS.batchSettler);

const book = () => ({ address: CONTRACTS.intentBook, abi: INTENT_BOOK_ABI }) as const;
const guard = () => ({ address: CONTRACTS.priceGuard, abi: PRICE_GUARD_ABI }) as const;

type MC = { status: "success"; result: any } | { status: "failure"; error: unknown };

async function multicall(client: PublicClient, contracts: any[]): Promise<MC[]> {
  if (contracts.length === 0) return [];
  return (await client.multicall({ contracts, allowFailure: true, batchSize: 8192 } as any)) as MC[];
}

const toBatch = (b: any): BatchData => ({
  status: Number(b.status),
  count: Number(b.count),
  live: Number(b.live),
  totalBtcIn: b.totalBtcIn,
  totalMusdIn: b.totalMusdIn,
  refPrice: b.refPrice,
  twapPrice: b.twapPrice,
  oraclePrice: b.oraclePrice,
  priceBtcSide: b.priceBtcSide,
  priceMusdSide: b.priceMusdSide,
  routedIn: b.routedIn,
  routedOut: b.routedOut,
  routedBtc: b.routedBtc,
});

const toIntent = (id: bigint, i: any): IntentData => ({
  id,
  owner: i.owner,
  batchId: BigInt(i.batchId),
  side: Number(i.side),
  status: Number(i.status),
  amountIn: i.amountIn,
  minOut: i.minOut,
  amountOut: i.amountOut,
  refundIn: i.refundIn,
});

const nameOfFailure = (m: MC) => (m.status === "failure" ? (errorNameOf(m.error) ?? "unknown") : null);

/** Round times, batch and (for rounds that could settle) the preview. */
async function loadRounds(client: PublicClient, ids: bigint[]): Promise<RoundInfo[]> {
  const base = await multicall(
    client,
    ids.flatMap((id) => [
      { ...book(), functionName: "batchTimes", args: [id] },
      { ...book(), functionName: "getBatch", args: [id] },
    ]),
  );
  const partial = ids.map((id, k) => {
    const t = base[2 * k];
    const b = base[2 * k + 1];
    if (t.status !== "success" || b.status !== "success") throw new Error("round read failed");
    const [openAt, closeAt, expireAt] = t.result as readonly bigint[];
    return { id, openAt: Number(openAt), closeAt: Number(closeAt), expireAt: Number(expireAt), batch: toBatch(b.result) };
  });
  const needPreview = partial.filter((r) => r.batch.status === 0 && r.batch.live > 0);
  const pv = await multicall(
    client,
    needPreview.map((r) => ({ ...book(), functionName: "preview", args: [r.id] })),
  );
  const idLists = await multicall(
    client,
    needPreview.map((r) => ({ ...book(), functionName: "batchIntentIds", args: [r.id] })),
  );
  const allIds = idLists.map((m) => (m.status === "success" ? ((m as any).result as bigint[]) : []));
  const flat = allIds.flat();
  const got = await multicall(
    client,
    flat.map((i) => ({ ...book(), functionName: "getIntent", args: [i] })),
  );
  const byId = new Map<bigint, IntentData>();
  flat.forEach((i, k) => {
    if (got[k].status === "success") byId.set(i, toIntent(i, (got[k] as any).result));
  });
  return partial.map((r) => {
    const k = needPreview.findIndex((n) => n.id === r.id);
    if (k < 0) return { ...r, preview: null, previewError: null, intents: [] };
    const intents = allIds[k].flatMap((i) => (byId.has(i) ? [byId.get(i) as IntentData] : []));
    const m = pv[k];
    if (m.status === "success") {
      const [clearing, prices] = m.result as [any, any];
      return { ...r, preview: { clearing, prices: prices as Prices }, previewError: null, intents };
    }
    return { ...r, preview: null, previewError: nameOfFailure(m), intents };
  });
}

export async function fetchSnapshot(client: PublicClient): Promise<Snapshot> {
  const [block, a] = await Promise.all([
    client.getBlock(),
    multicall(client, [
      { ...book(), functionName: "currentBatchId" },
      { ...book(), functionName: "paused" },
      { ...book(), functionName: "MIN_MUSD_IN" },
      { ...book(), functionName: "MIN_BTC_IN" },
      { ...book(), functionName: "MAX_INTENTS" },
      { ...book(), functionName: "START" },
      { ...guard(), functionName: "read" },
      { ...guard(), functionName: "ORACLE_BAND_BPS" },
      { ...guard(), functionName: "MAX_SPOT_TWAP_BPS" },
      { ...guard(), functionName: "GRANULARITY" },
      { address: MEZO.pool, abi: POOL_ABI, functionName: "observationLength" },
      { address: MEZO.pool, abi: POOL_ABI, functionName: "lastObservation" },
    ]),
  ]);
  for (const k of [0, 1, 2, 3, 4, 5, 7, 8, 9]) {
    if (a[k].status !== "success") throw new Error("contract read failed");
  }
  const val = (k: number) => (a[k] as { result: any }).result;
  const params: Params = {
    minMusd: val(2),
    minBtc: val(3),
    maxIntents: Number(val(4)),
    start: Number(val(5)),
    oracleBandBps: val(7),
    maxSpotTwapBps: val(8),
    granularity: val(9),
  };
  const currentId = val(0) as bigint;
  const first = currentId >= BigInt(LOOKBACK - 1) ? currentId - BigInt(LOOKBACK - 1) : 0n;
  const ids: bigint[] = [];
  for (let i = currentId; i >= first; i--) ids.push(i);

  // TWAP window: observations(len - 1 - G) -> lastObservation (SPEC D35).
  let twap: Snapshot["twap"] = null;
  if (a[10].status === "success" && a[11].status === "success") {
    const len = val(10) as bigint;
    const last = val(11) as { timestamp: bigint };
    const idx = len - 1n - params.granularity;
    if (idx >= 0n) {
      const [o] = await multicall(client, [{ address: MEZO.pool, abi: POOL_ABI, functionName: "observations", args: [idx] }]);
      if (o.status === "success") {
        const startTs = Number((o.result as readonly bigint[])[0]);
        const endTs = Number(last.timestamp);
        twap = { windowSec: endTs - startTs, endedAgoSec: Number(block.timestamp) - endTs };
      }
    }
  }

  const rounds = await loadRounds(client, ids);
  return {
    mock: false,
    deployed: true,
    chainTime: Number(block.timestamp),
    fetchedAt: Date.now(),
    paused: val(1),
    params,
    prices: a[6].status === "success" ? (val(6) as Prices) : null,
    pricesError: nameOfFailure(a[6]),
    twap,
    currentId,
    rounds,
  };
}

export async function fetchAccount(client: PublicClient, user: Address): Promise<AccountData> {
  const [btcBalance, a] = await Promise.all([
    client.getBalance({ address: user }),
    multicall(client, [
      { address: MEZO.musd, abi: ERC20_ABI, functionName: "balanceOf", args: [user] },
      { address: MEZO.musd, abi: ERC20_ABI, functionName: "allowance", args: [user, CONTRACTS.intentBook] },
      { ...book(), functionName: "intentsOf", args: [user] },
      { ...book(), functionName: "claimable", args: [user, MEZO.musd] },
      { ...book(), functionName: "claimable", args: [user, MEZO.btc] },
    ]),
  ]);
  const ok = (k: number, d: any) => (a[k].status === "success" ? (a[k] as { result: any }).result : d);
  const all = ok(2, []) as bigint[];
  const ids = all.slice(-MY_INTENTS_MAX);
  const got = await multicall(
    client,
    ids.map((id) => ({ ...book(), functionName: "getIntent", args: [id] })),
  );
  const intents = ids.flatMap((id, k) => (got[k].status === "success" ? [toIntent(id, (got[k] as any).result)] : []));
  return {
    musdBalance: ok(0, 0n),
    btcBalance,
    musdAllowance: ok(1, 0n),
    claimableMusd: ok(3, 0n),
    claimableBtc: ok(4, 0n),
    intents: intents.reverse(),
  };
}

/** Swapping alone now, from the Router (brief section 13). 0 when the quote fails. */
export async function fetchAloneQuote(client: PublicClient, sellBtc: boolean, amountIn: bigint): Promise<bigint> {
  if (amountIn <= 0n) return 0n;
  const from = sellBtc ? MEZO.btc : MEZO.musd;
  const to = sellBtc ? MEZO.musd : MEZO.btc;
  try {
    const amounts = (await client.readContract({
      address: MEZO.router,
      abi: ROUTER_ABI,
      functionName: "getAmountsOut",
      args: [amountIn, routeOf(from, to) as any],
    })) as readonly bigint[];
    return amounts[amounts.length - 1] ?? 0n;
  } catch {
    return 0n;
  }
}

/** Find the BatchSettled log for a round: one wide request first, then 9,000-block chunks (RPC range caps). */
async function findSettleEvent(client: PublicClient, batchId: bigint): Promise<SettleEvent | null> {
  const event = (INTENT_BOOK_ABI as readonly any[]).find((x) => x.type === "event" && x.name === "BatchSettled");
  const toEvent = (l: any): SettleEvent => ({
    settler: l.args.settler,
    reserveMusd: l.args.reserveMusd,
    reserveBtc: l.args.reserveBtc,
    feeBps: l.args.feeBps,
    txHash: l.transactionHash,
  });
  const latest = await client.getBlockNumber();
  const from = CONTRACTS.deployBlock;
  try {
    const logs = await client.getLogs({
      address: CONTRACTS.intentBook,
      event,
      args: { batchId },
      fromBlock: from,
      toBlock: latest,
    } as any);
    return logs.length ? toEvent(logs[logs.length - 1]) : null;
  } catch {
    const step = 9000n;
    for (let hi = latest; hi >= from; hi -= step) {
      const lo = hi - step + 1n > from ? hi - step + 1n : from;
      try {
        const logs = await client.getLogs({
          address: CONTRACTS.intentBook,
          event,
          args: { batchId },
          fromBlock: lo,
          toBlock: hi,
        } as any);
        if (logs.length) return toEvent(logs[logs.length - 1]);
      } catch {
        return null;
      }
      if (latest - hi > 200_000n) return null;
    }
    return null;
  }
}

export async function fetchRoundDetail(client: PublicClient, id: bigint): Promise<RoundDetail> {
  const [round] = await loadRounds(client, [id]);
  const [idsRes] = await multicall(client, [{ ...book(), functionName: "batchIntentIds", args: [id] }]);
  const ids = idsRes.status === "success" ? ((idsRes as any).result as bigint[]) : [];
  const got = await multicall(
    client,
    ids.map((i) => ({ ...book(), functionName: "getIntent", args: [i] })),
  );
  const intents = ids.flatMap((i, k) => (got[k].status === "success" ? [toIntent(i, (got[k] as any).result)] : []));
  const settled = round.batch.status === 1 && round.batch.count > 0 ? await findSettleEvent(client, id).catch(() => null) : null;
  return { round, intents, settled };
}
