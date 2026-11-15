/* eslint-disable @typescript-eslint/no-explicit-any */
// Optional keeper (brief 11.4). Off unless SETTLE_SECRET and KEEPER_PRIVATE_KEY are set. Never logs secrets.
import { createHash, timingSafeEqual } from "node:crypto";
import { createPublicClient, createWalletClient, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { CONTRACTS, INTENT_BOOK_ABI, MEZO, POOL_ABI, isDeployed, mezoTestnet } from "@/lib/contracts";
import { errorNameOf } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LOOKBACK = 10;
const STALE_OBSERVATION_SECONDS = 1800;

/** Constant-time string compare (hash both sides so lengths match). */
function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

function authorized(req: Request): boolean {
  const secret = process.env.SETTLE_SECRET;
  if (!secret) return false;
  const header = req.headers.get("authorization") ?? "";
  return safeEqual(header, `Bearer ${secret}`);
}

export async function POST(req: Request) {
  if (!authorized(req)) return Response.json({ error: "unauthorized" }, { status: 401 });

  const key = process.env.KEEPER_PRIVATE_KEY;
  if (!key) return Response.json({ enabled: false, actions: [] });
  if (!isDeployed(CONTRACTS.intentBook)) return Response.json({ enabled: true, actions: [], note: "not deployed" });

  const transport = http(mezoTestnet.rpcUrls.default.http[0]);
  const pub = createPublicClient({ chain: mezoTestnet, transport });
  const account = privateKeyToAccount((key.startsWith("0x") ? key : `0x${key}`) as Hex);
  const wallet = createWalletClient({ account, chain: mezoTestnet, transport });
  const book = { address: CONTRACTS.intentBook, abi: INTENT_BOOK_ABI } as const;
  const actions: { round: string; action: string; hash?: string; error?: string }[] = [];

  try {
    const block = await pub.getBlock();
    const now = Number(block.timestamp);
    const current = (await pub.readContract({ ...book, functionName: "currentBatchId" })) as bigint;
    const first = current >= BigInt(LOOKBACK) ? current - BigInt(LOOKBACK) : 0n;
    let synced = false;

    for (let id = current; id >= first; id--) {
      const [times, batch] = await Promise.all([
        pub.readContract({ ...book, functionName: "batchTimes", args: [id] }) as Promise<readonly bigint[]>,
        pub.readContract({ ...book, functionName: "getBatch", args: [id] }) as Promise<any>,
      ]);
      const closeAt = Number(times[1]);
      const expireAt = Number(times[2]);
      if (batch.status !== 0 || batch.live === 0 || now < closeAt || now >= expireAt) continue;

      try {
        await pub.simulateContract({ ...book, functionName: "settle", args: [id], account });
      } catch (err) {
        const name = errorNameOf(err);
        if (name === "SpotTwapDeviation" && !synced) {
          const last = (await pub.readContract({ address: MEZO.pool, abi: POOL_ABI, functionName: "lastObservation" })) as {
            timestamp: bigint;
          };
          if (now - Number(last.timestamp) > STALE_OBSERVATION_SECONDS) {
            synced = true;
            try {
              const gas = await pub.estimateContractGas({ address: MEZO.pool, abi: POOL_ABI, functionName: "sync", account });
              const hash = await wallet.writeContract({
                address: MEZO.pool,
                abi: POOL_ABI,
                functionName: "sync",
                gas: (gas * 150n) / 100n,
              });
              actions.push({ round: id.toString(), action: "sync", hash });
              continue;
            } catch (e) {
              actions.push({ round: id.toString(), action: "sync", error: errorNameOf(e) ?? "failed" });
              continue;
            }
          }
        }
        actions.push({ round: id.toString(), action: "skip", error: name ?? "simulation failed" });
        continue;
      }

      try {
        const estimate = await pub.estimateContractGas({ ...book, functionName: "settle", args: [id], account });
        const gas = (estimate * 150n) / 100n;
        const hash = await wallet.writeContract({ ...book, functionName: "settle", args: [id], gas });
        actions.push({ round: id.toString(), action: "settle", hash });
      } catch (e) {
        actions.push({ round: id.toString(), action: "settle", error: errorNameOf(e) ?? "failed" });
      }
    }
    return Response.json({ enabled: true, actions });
  } catch {
    return Response.json({ enabled: true, actions, error: "keeper run failed" }, { status: 500 });
  }
}
