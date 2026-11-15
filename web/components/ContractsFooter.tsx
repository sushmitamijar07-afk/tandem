import { CONTRACTS, MEZO, addressUrl, isDeployed } from "@/lib/contracts";
import { shortAddress } from "@/lib/format";
import { SITE } from "@/lib/site";

const LIST = [
  { label: "IntentBook", address: CONTRACTS.intentBook },
  { label: "PriceGuard", address: CONTRACTS.priceGuard },
  { label: "BatchSettler", address: CONTRACTS.batchSettler },
  { label: "MUSD/BTC pool", address: MEZO.pool },
  { label: "Mezo Router", address: MEZO.router },
  { label: "MUSD", address: MEZO.musd },
];

export function ContractsFooter() {
  return (
    <footer className="mt-16 border-t border-line">
      <div className="mx-auto max-w-5xl px-4 py-8 text-sm">
        <h2 className="text-base font-semibold">Contracts</h2>
        <ul className="mt-3 grid gap-x-8 gap-y-1 sm:grid-cols-2">
          {LIST.map((c) => (
            <li key={c.label} className="flex items-baseline justify-between gap-3 border-b border-line/60 py-1.5">
              <span className="text-muted">{c.label}</span>
              {isDeployed(c.address) ? (
                <a
                  href={addressUrl(c.address)}
                  target="_blank"
                  rel="noreferrer"
                  title={c.address}
                  className="num font-mono underline-offset-2 hover:underline"
                >
                  {shortAddress(c.address)}
                </a>
              ) : (
                <span className="text-muted">Not deployed yet</span>
              )}
            </li>
          ))}
        </ul>
        <p className="mt-6 flex flex-wrap gap-x-6 gap-y-1 text-muted">
          <a href={SITE.github} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-ink">
            GitHub
          </a>
          <span>Testnet only. No real funds.</span>
        </p>
      </div>
    </footer>
  );
}
