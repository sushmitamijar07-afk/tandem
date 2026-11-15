"use client";

import { USE_MOCKS } from "@/lib/contracts";
import { contractsDeployed } from "@/lib/reads";
import { useAccountData, useNow, useSnapshot } from "@/hooks/use-data";
import { useWallet } from "@/hooks/use-wallet";
import { LoadError, NotDeployed } from "@/components/NotDeployed";
import { Panel } from "@/components/ui";
import { PriceStrip, PriceStripSkeleton } from "@/components/PriceStrip";
import { RoundPanel, RoundPanelSkeleton } from "@/components/RoundPanel";
import { SwapBox, SwapBoxSkeleton } from "@/components/SwapBox";
import { ClaimNotice } from "@/components/ResultCard";

export default function Home() {
  const snap = useSnapshot();
  const wallet = useWallet();
  const account = useAccountData(wallet.isConnected ? wallet.address : undefined);
  const now = useNow(snap.data);

  if (!USE_MOCKS && !contractsDeployed()) return <NotDeployed />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Swap MUSD and BTC in short rounds.</h1>
        <p className="mt-2 max-w-2xl text-muted">
          Opposite swaps are matched with each other at the pool price, with no fee. Only what is left goes to the pool.
        </p>
      </div>

      {snap.isError && <LoadError what="the round" />}

      <ClaimNotice account={account.data} />

      <div className="grid gap-6 md:grid-cols-2">
        {snap.data ? <SwapBox snap={snap.data} now={now} account={account.data} /> : <SwapBoxSkeleton />}
        {snap.data ? <RoundPanel snap={snap.data} now={now} account={account.data} /> : <RoundPanelSkeleton />}
      </div>

      <Panel>{snap.data ? <PriceStrip snap={snap.data} /> : <PriceStripSkeleton />}</Panel>
    </div>
  );
}
