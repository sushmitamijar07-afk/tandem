import { fmtBps, fmtHours, fmtPrice } from "@/lib/format";
import type { Snapshot } from "@/lib/types";
import { Skeleton } from "@/components/ui";

export function PriceStripSkeleton() {
  return (
    <div className="space-y-2" aria-busy>
      <Skeleton className="h-5 w-full max-w-md" />
      <Skeleton className="h-10 w-full" />
    </div>
  );
}

/** Pool price, pool average (TWAP) with its real window, Mezo price feed, and the live testnet sentence. */
export function PriceStrip({ snap }: { snap: Snapshot }) {
  const p = snap.prices;
  if (!p) {
    return <p className="text-sm text-muted">Prices aren&apos;t available right now. Try again in a few seconds.</p>;
  }
  const feed = p.oracle > 0n;
  const above = p.twap >= p.oracle;
  const window = snap.twap
    ? `over ${fmtHours(snap.twap.windowSec)}, ending ${fmtHours(snap.twap.endedAgoSec)} ago`
    : null;
  return (
    <div className="space-y-3 text-sm">
      <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-3">
        <div>
          <dt className="text-muted">Pool price</dt>
          <dd className="num">{fmtPrice(p.spot)} MUSD/BTC</dd>
        </div>
        <div>
          <dt className="text-muted">Pool average (TWAP)</dt>
          <dd className="num">
            {fmtPrice(p.twap)}
            {window && <span className="block text-xs text-muted">{window}</span>}
          </dd>
        </div>
        <div>
          <dt className="text-muted">Mezo price feed</dt>
          <dd className="num">{feed ? `${fmtPrice(p.oracle)} USD/BTC` : "Not available"}</dd>
        </div>
      </dl>
      {feed && (
        <p className="text-muted">
          Testnet: the pool is {fmtBps(p.twapOracleBps)} {above ? "above" : "below"} Mezo&apos;s price feed because testnet liquidity
          is thin and not arbitraged. We allow up to {fmtBps(snap.params.oracleBandBps)} here; a real launch would use about 3%.
        </p>
      )}
    </div>
  );
}
