"use client";

import { useState } from "react";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { CONTRACTS, ERC20_ABI, INTENT_BOOK_ABI, MEZO } from "@/lib/contracts";
import { applySlippage } from "@/lib/amm";
import { fmtBps, fmtBtc, fmtClock, fmtCountdown, fmtMusd, parseAmount, toInputString } from "@/lib/format";
import type { AccountData, Snapshot } from "@/lib/types";
import { useAloneQuote } from "@/hooks/use-data";
import { useTx } from "@/hooks/use-tx";
import { useWallet } from "@/hooks/use-wallet";
import { Button, Notice, Panel, Skeleton } from "@/components/ui";
import { TxLink } from "@/components/TxLink";

const SLIPPAGE_BPS = 50n;
/** Kept back from Max so there's BTC left for the network fee. */
const GAS_RESERVE = 10n ** 14n;

export function SwapBoxSkeleton() {
  return (
    <Panel>
      <div className="space-y-4" aria-busy aria-label="Loading swap box">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-11 w-full" />
      </div>
    </Panel>
  );
}

export function SwapBox({
  snap,
  now,
  account,
}: {
  snap: Snapshot;
  now: number;
  account: AccountData | undefined;
}) {
  const wallet = useWallet();
  const { openConnectModal } = useConnectModal();
  const { run, pending, hash } = useTx();
  const [sellBtc, setSellBtc] = useState(true);
  const [amount, setAmount] = useState("");
  const [minInput, setMinInput] = useState<string | null>(null);
  const [approvedLocal, setApprovedLocal] = useState(false);

  const tokenIn = sellBtc ? "BTC" : "MUSD";
  const tokenOut = sellBtc ? "MUSD" : "BTC";
  const amountIn = parseAmount(amount);
  const alone = useAloneQuote(sellBtc, amountIn, snap);
  const aloneOut = alone.data ?? 0n;
  const suggested = applySlippage(aloneOut, SLIPPAGE_BPS);
  const minOut = minInput !== null ? parseAmount(minInput) : suggested;
  const current = snap.rounds[0];
  const roundId = snap.currentId;
  const secondsLeft = current.closeAt - now;
  const notStarted = snap.currentId === 0n && now < snap.params.start;
  const full = current.batch.count >= snap.params.maxIntents;
  const fmtIn = (v: bigint) => (sellBtc ? fmtBtc(v) : fmtMusd(v));
  const fmtOut = (v: bigint) => (sellBtc ? fmtMusd(v) : fmtBtc(v));
  const minimum = sellBtc ? snap.params.minBtc : snap.params.minMusd;
  const balance = account ? (sellBtc ? account.btcBalance : account.musdBalance) : 0n;
  const spendable = sellBtc ? (balance > GAS_RESERVE ? balance - GAS_RESERVE : 0n) : balance;
  const allowance = account?.musdAllowance ?? 0n;
  const needsApproval = !sellBtc && amountIn !== null && amountIn > 0n && !approvedLocal && allowance < amountIn;
  const busy = !!pending;

  // The one message that stops the button, in the order a person would hit them.
  let problem: string | null = null;
  if (snap.paused) problem = "New swaps are paused. Existing swaps still settle or refund.";
  else if (notStarted) problem = `Swaps open at ${fmtClock(snap.params.start)}.`;
  else if (full) problem = `This round is full. Try again in ${fmtCountdown(secondsLeft)}.`;
  else if (amountIn === null || amountIn === 0n) problem = null;
  else if (amountIn < minimum) problem = sellBtc ? "Minimum is 0.0001 BTC." : "Minimum is 10 MUSD.";
  else if (account && amountIn > spendable) problem = sellBtc ? "Not enough BTC (keep a little for gas)." : "Not enough MUSD.";
  else if (minOut === null || minOut === 0n) problem = "Set a minimum you'll accept.";

  const ready = wallet.isReady && amountIn !== null && amountIn > 0n && !problem && alone.data !== undefined;

  function setMax() {
    setAmount(toInputString(spendable, 18));
    setMinInput(null);
  }

  async function approve() {
    if (!amountIn) return;
    await run(
      "approve",
      { address: MEZO.musd, abi: ERC20_ABI as never, functionName: "approve", args: [CONTRACTS.intentBook, amountIn] },
      { success: "MUSD approved. Now join the round.", onSuccess: () => setApprovedLocal(true) },
    );
  }

  async function join() {
    if (!amountIn || !minOut) return;
    const spec = sellBtc
      ? { address: CONTRACTS.intentBook, abi: INTENT_BOOK_ABI as never, functionName: "submitSellBtc", args: [minOut], value: amountIn }
      : { address: CONTRACTS.intentBook, abi: INTENT_BOOK_ABI as never, functionName: "submitSellMusd", args: [amountIn, minOut] };
    const left = secondsLeft;
    const ok = await run("join", spec, {
      success: `You're in round #${roundId}. It closes in ${fmtCountdown(left)}.`,
    });
    if (ok) {
      setAmount("");
      setMinInput(null);
      setApprovedLocal(false);
    }
  }

  const button = (() => {
    if (!wallet.isConnected) {
      return (
        <Button onClick={() => openConnectModal?.()} className="w-full">
          Connect a wallet to swap.
        </Button>
      );
    }
    if (wallet.wrongNetwork) {
      return (
        <Button onClick={() => wallet.switchToMezo().catch(() => {})} busy={wallet.isSwitching} className="w-full">
          Switch to Mezo Testnet
        </Button>
      );
    }
    if (needsApproval) {
      return (
        <Button onClick={approve} busy={pending === "approve"} disabled={!ready || busy} className="w-full">
          {pending === "approve" ? "Approving…" : "Approve MUSD"}
        </Button>
      );
    }
    return (
      <Button onClick={join} busy={pending === "join"} disabled={!ready || busy} className="w-full">
        {pending === "join" ? `Joining round #${roundId}…` : "Join round"}
      </Button>
    );
  })();

  return (
    <Panel>
      <div className="space-y-4">
        <div role="group" aria-label="Direction" className="grid grid-cols-2 border border-line text-sm">
          {[
            { v: true, label: "Sell BTC" },
            { v: false, label: "Sell MUSD" },
          ].map((o) => (
            <button
              key={o.label}
              type="button"
              aria-pressed={sellBtc === o.v}
              onClick={() => {
                setSellBtc(o.v);
                setAmount("");
                setMinInput(null);
              }}
              className={`min-h-11 font-medium ${sellBtc === o.v ? "bg-brand text-on-brand" : "bg-surface text-ink hover:bg-bg"}`}
            >
              {o.label}
            </button>
          ))}
        </div>

        <div>
          <label htmlFor="amount" className="flex items-baseline justify-between text-sm text-muted">
            <span>You sell</span>
            {wallet.isConnected && account && (
              <span className="num">
                Balance {fmtIn(balance)} {tokenIn}
                <button type="button" onClick={setMax} className="ml-2 font-medium text-brand underline underline-offset-2">
                  Max
                </button>
              </span>
            )}
          </label>
          <div className="mt-1 flex items-center border border-line bg-bg focus-within:border-ink">
            <input
              id="amount"
              inputMode="decimal"
              autoComplete="off"
              placeholder="0.00"
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value);
                setMinInput(null);
              }}
              className="num min-w-0 flex-1 bg-transparent px-3 py-3 text-xl outline-none"
            />
            <span className="px-3 text-sm text-muted">{tokenIn}</span>
          </div>
        </div>

        {amountIn !== null && amountIn > 0n && (
          <div className="space-y-3 text-sm">
            <p className="num">
              You&apos;ll get at least{" "}
              <b>
                {minOut ? fmtOut(minOut) : "…"} {tokenOut}
              </b>
            </p>
            <p className="num text-muted">
              {alone.isLoading ? (
                "Checking the pool price…"
              ) : (
                <>
                  Swapping alone now: {fmtOut(aloneOut)} {tokenOut} (pool fee {snap.prices ? fmtBps(snap.prices.feeBps) : "—"})
                </>
              )}
            </p>
            <div>
              <label htmlFor="min" className="text-muted">
                Minimum you&apos;ll accept ({tokenOut})
              </label>
              <input
                id="min"
                inputMode="decimal"
                autoComplete="off"
                value={minInput ?? (suggested > 0n ? toInputString(suggested, sellBtc ? 2 : 6) : "")}
                onChange={(e) => setMinInput(e.target.value)}
                className="num mt-1 w-full border border-line bg-bg px-3 py-2 outline-none focus:border-ink"
              />
              <p className="mt-1 text-xs text-muted">If the round can&apos;t give you this much, your funds are returned.</p>
            </div>
          </div>
        )}

        {sellBtc === false && wallet.isConnected && needsApproval && (
          <p className="text-sm text-muted">Step 1 of 2: approve MUSD. Step 2: join the round.</p>
        )}
        {wallet.isSmartAccount && (
          <p className="text-sm text-muted">Bitcoin wallets use a Mezo smart account; approvals take one extra step.</p>
        )}
        {problem && <Notice>{problem}</Notice>}

        {button}

        {pending && hash && (
          <p className="text-sm">
            {pending === "join" ? `Joining round #${roundId}…` : "Approving…"} <TxLink hash={hash} />
          </p>
        )}
      </div>
    </Panel>
  );
}
