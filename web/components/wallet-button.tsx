"use client";

import { useState } from "react";
import { useDisconnect } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { addressUrl } from "@/lib/contracts";
import { shortAddress } from "@/lib/format";
import { useMounted } from "@/hooks/use-mounted";
import { useWallet } from "@/hooks/use-wallet";
import { Skeleton } from "@/components/ui";

const btn = "min-h-10 border border-line bg-surface px-3 text-sm hover:border-ink";

/** Opens Mezo Passport's connect modal (Bitcoin wallets via a Mezo smart account, or Ethereum wallets). */
export function WalletButton() {
  const mounted = useMounted();
  const w = useWallet();
  const { openConnectModal } = useConnectModal();
  const { disconnect } = useDisconnect();
  const [open, setOpen] = useState(false);

  if (!mounted) return <Skeleton className="h-10 w-28" />;
  if (!w.isConnected || !w.address) {
    return (
      <button type="button" className={btn} onClick={() => openConnectModal?.()}>
        Connect wallet
      </button>
    );
  }
  return (
    <div className="relative">
      <button type="button" className={`${btn} num font-mono`} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        {shortAddress(w.address)}
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-1 w-48 border border-line bg-surface text-sm shadow-[0_6px_24px_rgba(0,0,0,0.12)]">
          <a
            href={addressUrl(w.address)}
            target="_blank"
            rel="noreferrer"
            className="block px-3 py-2 hover:bg-bg"
            onClick={() => setOpen(false)}
          >
            View on explorer
          </a>
          <button
            type="button"
            className="block w-full px-3 py-2 text-left hover:bg-bg"
            onClick={() => {
              setOpen(false);
              disconnect();
            }}
          >
            Disconnect
          </button>
        </div>
      )}
    </div>
  );
}
