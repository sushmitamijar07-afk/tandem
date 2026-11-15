"use client";

import { useState } from "react";
import { USE_MOCKS } from "@/lib/contracts";
import { describeError } from "@/lib/errors";
import { SCENARIOS } from "@/lib/mocks";
import { useScenario } from "@/hooks/use-scenario";
import { useWallet } from "@/hooks/use-wallet";

export function WrongNetworkBanner() {
  const w = useWallet();
  const [err, setErr] = useState<string | null>(null);
  if (!w.wrongNetwork) return null;
  return (
    <div role="alert" className="border-b border-warn-line bg-warn-bg text-warn-ink">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-3 px-4 py-2 text-sm">
        <span>Switch to Mezo Testnet.</span>
        <button
          type="button"
          disabled={w.isSwitching}
          onClick={() => w.switchToMezo().catch((e) => setErr(describeError(e).message))}
          className="border border-current px-3 py-1 font-medium hover:bg-black/5 disabled:opacity-50"
        >
          Switch
        </button>
        {err && <span>{err}</span>}
      </div>
    </div>
  );
}

/** Only with USE_MOCKS: says so, and lists the states you can open with ?state=. */
export function MockBanner() {
  const s = useScenario();
  if (!USE_MOCKS) return null;
  return (
    <div role="status" className="border-b border-line bg-bg text-sm text-muted">
      <div className="mx-auto max-w-5xl px-4 py-2">
        Mock data (state: <b className="text-ink">{s}</b>). Add <code>?state=</code> with one of {SCENARIOS.join(", ")}; add{" "}
        <code>&amp;as=1</code> to act as a connected wallet.
      </div>
    </div>
  );
}
