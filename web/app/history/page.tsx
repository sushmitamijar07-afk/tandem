"use client";

import Link from "next/link";
import { IntentStatus, Side, USE_MOCKS } from "@/lib/contracts";
import { fmtBtc, fmtMusd } from "@/lib/format";
import { contractsDeployed } from "@/lib/reads";
import type { IntentData } from "@/lib/types";
import { useAccountData } from "@/hooks/use-data";
import { useWallet } from "@/hooks/use-wallet";
import { LoadError, NotDeployed } from "@/components/NotDeployed";
import { Panel, Skeleton } from "@/components/ui";
import { ClaimNotice } from "@/components/ResultCard";

function describe(i: IntentData): string {
  const sellBtc = i.side === Side.SellBtc;
  const sold = sellBtc ? `${fmtBtc(i.amountIn)} BTC` : `${fmtMusd(i.amountIn)} MUSD`;
  const got = (v: bigint) => (sellBtc ? `${fmtMusd(v)} MUSD` : `${fmtBtc(v)} BTC`);
  if (i.status === IntentStatus.Open) return `Selling ${sold}. Waiting for the round.`;
  if (i.status === IntentStatus.Filled) return `Sold ${sold} and got ${got(i.amountOut)}.`;
  if (i.status === IntentStatus.Cancelled) return `Cancelled. ${sold} returned.`;
  if (i.status === IntentStatus.Refunded) return `Returned ${sold}.`;
  return sold;
}

export default function History() {
  const wallet = useWallet();
  const account = useAccountData(wallet.isConnected ? wallet.address : undefined);
  if (!USE_MOCKS && !contractsDeployed()) return <NotDeployed />;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">My swaps</h1>
      <ClaimNotice account={account.data} />
      {!wallet.isConnected ? (
        <p className="text-sm text-muted">Connect a wallet to see your swaps.</p>
      ) : account.isError ? (
        <LoadError what="your swaps" />
      ) : account.isLoading ? (
        <Panel>
          <div className="space-y-3" aria-busy aria-label="Loading your swaps">
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-3/4" />
          </div>
        </Panel>
      ) : account.data && account.data.intents.length === 0 ? (
        <p className="text-sm text-muted">
          You haven&apos;t swapped yet.{" "}
          <Link href="/" className="underline underline-offset-2">
            Join a round
          </Link>
        </p>
      ) : (
        <ul className="divide-y divide-line border border-line bg-surface">
          {account.data?.intents.map((i) => (
            <li key={i.id.toString()} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-3 text-sm">
              <span className="num">{describe(i)}</span>
              <Link href={`/round/${i.batchId}`} className="num text-muted underline underline-offset-2 hover:text-ink">
                Round #{i.batchId.toString()}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
