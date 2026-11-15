"use client";

import { use } from "react";
import Link from "next/link";
import { USE_MOCKS } from "@/lib/contracts";
import { contractsDeployed } from "@/lib/reads";
import { useAccountData, useRoundDetail, useSnapshot } from "@/hooks/use-data";
import { useWallet } from "@/hooks/use-wallet";
import { LoadError, NotDeployed } from "@/components/NotDeployed";
import { Panel, Skeleton } from "@/components/ui";
import { ClaimNotice, ResultCard, RoundSummary } from "@/components/ResultCard";
import { PriceStrip } from "@/components/PriceStrip";

export default function RoundPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: raw } = use(params);
  const id = /^\d{1,18}$/.test(raw) ? BigInt(raw) : null;
  const wallet = useWallet();
  const detail = useRoundDetail(id);
  const account = useAccountData(wallet.isConnected ? wallet.address : undefined);
  const snap = useSnapshot();

  if (id === null) {
    return (
      <Panel className="max-w-xl">
        <p className="text-sm">That isn&apos;t a round number.</p>
      </Panel>
    );
  }
  if (!USE_MOCKS && !contractsDeployed()) return <NotDeployed />;

  const mine = detail.data?.intents.filter((i) => wallet.address && i.owner.toLowerCase() === wallet.address.toLowerCase()) ?? [];

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm">
          <Link href="/" className="text-muted underline underline-offset-2">
            Back to swap
          </Link>
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Round #{id.toString()}</h1>
      </div>

      {detail.isError && <LoadError what="this round" />}
      {detail.isLoading && (
        <Panel>
          <div className="space-y-3" aria-busy aria-label="Loading round">
            <Skeleton className="h-5 w-64" />
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-3/4" />
          </div>
        </Panel>
      )}

      {detail.data && (
        <>
          {detail.data.round.batch.status === 0 && (
            <Panel>
              <p className="text-sm">This round hasn&apos;t settled yet.</p>
            </Panel>
          )}
          <section className="space-y-3">
            <h2 className="text-base font-semibold">Your swaps</h2>
            {!wallet.isConnected ? (
              <p className="text-sm text-muted">Connect a wallet to see your swaps in this round.</p>
            ) : mine.length === 0 ? (
              <p className="text-sm text-muted">You had no swaps in this round.</p>
            ) : (
              mine.map((i) => <ResultCard key={i.id.toString()} intent={i} detail={detail.data} />)
            )}
            <ClaimNotice account={account.data} />
          </section>
          <RoundSummary detail={detail.data} />
        </>
      )}

      {snap.data && (
        <Panel>
          <PriceStrip snap={snap.data} />
        </Panel>
      )}
    </div>
  );
}
