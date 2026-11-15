"use client";

import Link from "next/link";
import { CONTRACTS, INTENT_BOOK_ABI, Side } from "@/lib/contracts";
import { fmtBps, fmtBtc, fmtClock, fmtMusd } from "@/lib/format";
import { ERROR_MESSAGES } from "@/lib/errors";
import { guardProblem, phaseOf } from "@/lib/phase";
import { matchedSummary, sideTotals } from "@/lib/summary";
import type { AccountData, RoundInfo, Snapshot } from "@/lib/types";
import { useTx } from "@/hooks/use-tx";
import { useWallet } from "@/hooks/use-wallet";
import { Button, Notice, Panel, Skeleton } from "@/components/ui";
import { Countdown } from "@/components/Countdown";
import { TxLink } from "@/components/TxLink";

export function RoundPanelSkeleton() {
  return (
    <Panel>
      <div className="space-y-3" aria-busy aria-label="Loading round">
        <Skeleton className="h-6 w-56" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-4/5" />
        <Skeleton className="h-4 w-3/5" />
      </div>
    </Panel>
  );
}

function guardMessage(r: RoundInfo, snap: Snapshot): string | null {
  const g = guardProblem(r.previewError);
  if (!g) return null;
  const p = snap.prices;
  if (g === "spot") {
    const moved = p ? fmtBps(p.spotTwapBps) : "too far";
    return `Can't settle yet: the pool price moved ${moved} from its pool average (TWAP) (limit ${fmtBps(snap.params.maxSpotTwapBps)}). Try again soon. If it can't settle by ${fmtClock(r.expireAt)}, everyone is refunded.`;
  }
  if (g === "oracle") {
    return `Can't settle yet: the pool and Mezo's price feed differ by more than ${fmtBps(snap.params.oracleBandBps)}.`;
  }
  if (g === "unavailable") return ERROR_MESSAGES.OracleUnavailable;
  if (g === "poolPaused") return ERROR_MESSAGES.PoolPaused;
  return "Can't settle yet. Try again soon.";
}

function RoundCard({
  round,
  snap,
  now,
  account,
  current,
}: {
  round: RoundInfo;
  snap: Snapshot;
  now: number;
  account: AccountData | undefined;
  current: boolean;
}) {
  const { run, pending, hash } = useTx();
  const wallet = useWallet();
  const phase = phaseOf(round, now);
  const t = sideTotals(round);
  const m = matchedSummary(round);
  const mine = (account?.intents ?? []).filter((i) => i.batchId === round.id && i.status === 1);
  const guardMsg = phase === "ready" ? guardMessage(round, snap) : null;
  const book = { address: CONTRACTS.intentBook, abi: INTENT_BOOK_ABI } as never as { address: `0x${string}`; abi: never };
  const id = round.id;

  const act = (key: string, fn: "settle" | "expire" | "cancel", arg: bigint, success: string) =>
    run(key, { ...book, functionName: fn, args: [arg], heavy: fn !== "cancel" }, { success });

  const header = (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4">
      <h3 className="text-lg font-semibold">
        Round #{id.toString()}
        {phase === "open" && (
          <span className="font-normal text-muted">
            {" "}
            · closes in <Countdown seconds={round.closeAt - now} />
          </span>
        )}
      </h3>
      {(phase === "settled" || phase === "expired") && (
        <Link href={`/round/${id}`} className="text-sm underline underline-offset-2">
          See results
        </Link>
      )}
    </div>
  );

  const connectNote = !wallet.isReady && <p className="text-sm text-muted">Connect a wallet to do this.</p>;

  return (
    <div className="space-y-3">
      {header}

      {(phase === "open" || phase === "ready" || phase === "refund") && round.batch.live > 0 && (
        <>
          <ul className="num space-y-0.5 text-sm">
            <li>
              Selling BTC: {fmtBtc(t.btcIn)} BTC{t.btcCount > 0 && ` (${t.btcCount})`}
            </li>
            <li>
              Selling MUSD: {fmtMusd(t.musdIn)} MUSD{t.musdCount > 0 && ` (${t.musdCount})`}
            </li>
          </ul>
          {m && phase !== "refund" && (
            <ul className="num space-y-0.5 text-sm">
              <li>
                Matched if settled now: {fmtBtc(m.btc)} BTC ↔ {fmtMusd(m.musd)} MUSD
              </li>
              <li>
                To the pool: {m.poolAmount > 0n ? (m.poolIsBtc ? `${fmtBtc(m.poolAmount)} BTC` : `${fmtMusd(m.poolAmount)} MUSD`) : "nothing"}
              </li>
            </ul>
          )}
        </>
      )}

      {phase === "empty" || (phase === "open" && round.batch.live === 0) ? (
        <p className="text-sm text-muted">No swaps in this round.</p>
      ) : null}

      {phase === "open" && current && mine.length > 0 && (
        <ul className="space-y-1.5">
          {mine.map((i) => (
            <li key={i.id.toString()} className="flex flex-wrap items-center justify-between gap-2 border border-line px-3 py-2 text-sm">
              <span className="num">
                Your swap: {i.side === Side.SellBtc ? `${fmtBtc(i.amountIn)} BTC` : `${fmtMusd(i.amountIn)} MUSD`}
              </span>
              <Button
                variant="quiet"
                className="min-h-9"
                busy={pending === `cancel-${i.id}`}
                disabled={!!pending}
                onClick={() => act(`cancel-${i.id}`, "cancel", i.id, "Swap cancelled. Your funds are back in your wallet.")}
              >
                {pending === `cancel-${i.id}` ? "Cancelling…" : "Cancel"}
              </Button>
            </li>
          ))}
        </ul>
      )}

      {phase === "ready" && (
        <div className="space-y-2">
          {guardMsg ? <Notice>{guardMsg}</Notice> : <p className="text-sm">Round closed. Ready to settle.</p>}
          <Button
            busy={pending === `settle-${id}`}
            disabled={!wallet.isReady || !!pending}
            onClick={() => act(`settle-${id}`, "settle", id, `Round #${id} settled.`)}
          >
            {pending === `settle-${id}` ? "Settling…" : guardMsg ? "Try settling again" : "Settle round"}
          </Button>
          {connectNote}
        </div>
      )}

      {phase === "refund" && (
        <div className="space-y-2">
          <Notice>This round couldn&apos;t settle in time. Refund everyone to send the funds back.</Notice>
          <Button
            busy={pending === `expire-${id}`}
            disabled={!wallet.isReady || !!pending}
            onClick={() => act(`expire-${id}`, "expire", id, `Round #${id} refunded. Everyone has their funds back.`)}
          >
            {pending === `expire-${id}` ? "Refunding…" : "Refund everyone"}
          </Button>
          {connectNote}
        </div>
      )}

      {phase === "expired" && <p className="text-sm">This round couldn&apos;t settle in time. Everyone was refunded.</p>}
      {phase === "settled" && <p className="text-sm text-muted">Settled.</p>}

      {pending && hash && (
        <p className="text-sm">
          Transaction sent: <TxLink hash={hash} />
        </p>
      )}
    </div>
  );
}

/** Live panel: the current round, then earlier rounds that still need an action, then the latest result. */
export function RoundPanel({
  snap,
  now,
  account,
}: {
  snap: Snapshot;
  now: number;
  account: AccountData | undefined;
}) {
  const [current, ...earlier] = snap.rounds;
  const actionable = earlier.filter((r) => ["ready", "refund"].includes(phaseOf(r, now)));
  const lastDone = earlier.find((r) => ["settled", "expired"].includes(phaseOf(r, now)) && r.batch.count > 0);
  return (
    <Panel>
      <div className="space-y-5 divide-y divide-line [&>*:not(:first-child)]:pt-5">
        {snap.currentId === 0n && now < snap.params.start ? (
          <p className="text-sm text-muted">Round #0 opens at {fmtClock(snap.params.start)}.</p>
        ) : (
          <RoundCard round={current} snap={snap} now={now} account={account} current />
        )}
        {actionable.map((r) => (
          <RoundCard key={r.id.toString()} round={r} snap={snap} now={now} account={account} current={false} />
        ))}
        {lastDone && <RoundCard round={lastDone} snap={snap} now={now} account={account} current={false} />}
      </div>
    </Panel>
  );
}
