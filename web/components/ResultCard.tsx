"use client";

import { BatchStatus, CONTRACTS, INTENT_BOOK_ABI, IntentStatus, MEZO, Side, addressUrl } from "@/lib/contracts";
import { aloneOut } from "@/lib/amm";
import { fmtBps, fmtBtc, fmtMusd, fmtPrice, fmtSigned, shortAddress } from "@/lib/format";
import type { AccountData, IntentData, RoundDetail } from "@/lib/types";
import { useTx } from "@/hooks/use-tx";
import { Button, Panel, Row } from "@/components/ui";
import { TxLink } from "@/components/TxLink";

const money = (sellBtc: boolean, v: bigint) => (sellBtc ? `${fmtBtc(v)} BTC` : `${fmtMusd(v)} MUSD`);

/** What happened to one swap, in plain words. */
export function ResultCard({ intent, detail }: { intent: IntentData; detail: RoundDetail }) {
  const sellBtc = intent.side === Side.SellBtc;
  const inText = money(sellBtc, intent.amountIn);
  const outText = (v: bigint) => money(!sellBtc, v);
  const { batch } = detail.round;
  const lines: string[] = [];
  let compare: string | null = null;

  if (intent.status === IntentStatus.Open) {
    lines.push("Waiting for the round to settle.");
  } else if (intent.status === IntentStatus.Cancelled) {
    lines.push(`You cancelled this swap. Your ${inText} was returned.`);
  } else if (intent.status === IntentStatus.Refunded) {
    lines.push(
      batch.status === BatchStatus.Expired
        ? `This round couldn't settle in time, so your ${money(sellBtc, intent.refundIn)} was returned.`
        : `Your minimum (${outText(intent.minOut)}) couldn't be met at this round's price, so your ${money(sellBtc, intent.refundIn)} was returned.`,
    );
  } else if (intent.status === IntentStatus.Filled) {
    const sold = intent.amountIn - intent.refundIn;
    lines.push(`You sold ${money(sellBtc, sold)} and got ${outText(intent.amountOut)}.`);
    const oneSided = sellBtc ? batch.totalMusdIn === 0n : batch.totalBtcIn === 0n;
    if (oneSided) {
      lines.push("No one was swapping the other way this round, so your swap went to the pool as usual.");
    } else if (detail.settled) {
      const alone = aloneOut(sellBtc, sold, detail.settled);
      const kept = intent.amountOut - alone;
      const price = batch.refPrice;
      const keptMusd = sellBtc ? kept : (kept * price) / 10n ** 18n;
      const bps = alone > 0n ? (kept * 10_000n) / alone : 0n;
      compare = `Swapping alone at the same moment: ${outText(alone)}. You kept ${sellBtc ? fmtSigned(kept, 2) + " MUSD" : fmtSigned(kept, 6) + " BTC"} (≈ ${fmtMusd(keptMusd)} MUSD, ${fmtBps(bps < 0n ? -bps : bps)}).`;
    }
    if (intent.refundIn > 0n) lines.push(`${money(sellBtc, intent.refundIn)} of your swap couldn't reach the pool and was returned.`);
  }

  return (
    <div className="space-y-1 border border-line bg-surface p-4 text-sm">
      <p className="num text-muted">
        Swap #{intent.id.toString()} · Round #{intent.batchId.toString()}
      </p>
      {lines.map((l) => (
        <p key={l} className="num">
          {l}
        </p>
      ))}
      {compare && <p className="num">{compare}</p>}
    </div>
  );
}

/** Shown when a payout couldn't be sent and sits in claimable. */
export function ClaimNotice({ account }: { account: AccountData | undefined }) {
  const { run, pending, hash } = useTx();
  if (!account) return null;
  const items = [
    { token: MEZO.musd, amount: account.claimableMusd, text: `${fmtMusd(account.claimableMusd)} MUSD`, key: "claim-musd" },
    { token: MEZO.btc, amount: account.claimableBtc, text: `${fmtBtc(account.claimableBtc)} BTC`, key: "claim-btc" },
  ].filter((i) => i.amount > 0n);
  if (items.length === 0) return null;
  return (
    <div className="space-y-2">
      {items.map((i) => (
        <div key={i.key} className="flex flex-wrap items-center justify-between gap-3 border border-warn-line bg-warn-bg px-3 py-2 text-sm text-warn-ink">
          <span className="num">We couldn&apos;t send {i.text} to your address. Claim it here.</span>
          <Button
            variant="quiet"
            className="min-h-9"
            busy={pending === i.key}
            disabled={!!pending}
            onClick={() =>
              run(
                i.key,
                { address: CONTRACTS.intentBook, abi: INTENT_BOOK_ABI as never, functionName: "claim", args: [i.token] },
                { success: `Claimed ${i.text}.` },
              )
            }
          >
            {pending === i.key ? "Claiming…" : "Claim"}
          </Button>
        </div>
      ))}
      {pending && hash && (
        <p className="text-sm">
          Transaction sent: <TxLink hash={hash} />
        </p>
      )}
    </div>
  );
}

/** Round summary: both side prices, matched amount, router leg, settler. */
export function RoundSummary({ detail }: { detail: RoundDetail }) {
  const { batch } = detail.round;
  if (batch.status === BatchStatus.Expired) {
    return (
      <Panel>
        <p className="text-sm">This round couldn&apos;t settle in time. Everyone was refunded.</p>
      </Panel>
    );
  }
  if (batch.status !== BatchStatus.Settled) return null;
  if (batch.count === 0) {
    return (
      <Panel>
        <p className="text-sm">No swaps in this round.</p>
      </Panel>
    );
  }
  const ySide = batch.routedBtc ? Side.SellMusd : Side.SellBtc;
  const filledY = detail.intents.filter((i) => i.status === IntentStatus.Filled && i.side === ySide);
  const yIn = filledY.reduce((a, i) => a + i.amountIn, 0n);
  const yOut = filledY.reduce((a, i) => a + i.amountOut, 0n);
  const matched = yIn === 0n ? "Nothing matched" : ySide === Side.SellMusd ? `${fmtBtc(yOut)} BTC ↔ ${fmtMusd(yIn)} MUSD` : `${fmtBtc(yIn)} BTC ↔ ${fmtMusd(yOut)} MUSD`;
  const routed =
    batch.routedIn === 0n
      ? "Nothing went to the pool"
      : batch.routedBtc
        ? `${fmtBtc(batch.routedIn)} BTC → ${fmtMusd(batch.routedOut)} MUSD`
        : `${fmtMusd(batch.routedIn)} MUSD → ${fmtBtc(batch.routedOut)} BTC`;
  const price = (v: bigint) => (v === 0n ? "—" : `${fmtPrice(v)} MUSD/BTC`);
  return (
    <Panel>
      <h2 className="text-base font-semibold">Round summary</h2>
      <dl className="mt-2">
        <Row label="Price for BTC sellers">{price(batch.priceBtcSide)}</Row>
        <Row label="Price for MUSD sellers">{price(batch.priceMusdSide)}</Row>
        <Row label="Matched">{matched}</Row>
        <Row label="Sent to the pool">
          {routed}
          {detail.settled && batch.routedIn > 0n && (
            <span className="ml-2">
              <TxLink hash={detail.settled.txHash} />
            </span>
          )}
        </Row>
        {detail.settled && (
          <Row label="Settled by">
            <a
              href={addressUrl(detail.settled.settler)}
              target="_blank"
              rel="noreferrer"
              title={detail.settled.settler}
              className="font-mono underline underline-offset-2"
            >
              {shortAddress(detail.settled.settler)}
            </a>
          </Row>
        )}
      </dl>
    </Panel>
  );
}
