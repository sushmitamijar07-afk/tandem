import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "How it works" };

function Diagram() {
  return (
    <svg viewBox="0 0 640 220" role="img" aria-labelledby="diag-t diag-d" className="w-full max-w-2xl border border-line bg-surface">
      <title id="diag-t">How a round works</title>
      <desc id="diag-d">
        BTC sellers and MUSD sellers swap with each other in the middle. Only the leftover goes to the Mezo pool.
      </desc>
      <g fontFamily="ui-sans-serif, system-ui, sans-serif" fontSize="14" fill="currentColor">
        <rect x="20" y="30" width="150" height="50" fill="none" stroke="currentColor" />
        <text x="95" y="60" textAnchor="middle">People selling BTC</text>
        <rect x="20" y="140" width="150" height="50" fill="none" stroke="currentColor" />
        <text x="95" y="170" textAnchor="middle">People selling MUSD</text>
        <rect x="245" y="85" width="150" height="50" fill="var(--brand)" stroke="none" />
        <text x="320" y="115" textAnchor="middle" fill="var(--on-brand)">Matched, no fee</text>
        <rect x="470" y="140" width="150" height="50" fill="none" stroke="currentColor" strokeDasharray="5 4" />
        <text x="545" y="170" textAnchor="middle">Mezo pool</text>
        <g stroke="currentColor" strokeWidth="1.6" fill="none">
          <path d="M170 55 L245 100" />
          <path d="M170 165 L245 120" />
          <path d="M395 125 L470 155" strokeDasharray="5 4" />
        </g>
        <text x="445" y="112" fontSize="12" fill="var(--muted)">only the leftover</text>
      </g>
    </svg>
  );
}

export default function How() {
  return (
    <article className="max-w-2xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">How Tandem works</h1>
        <p className="mt-3 text-muted">
          Rounds last two minutes. Everyone who joins a round gets the same price. When a round ends, anyone can settle it.
        </p>
      </div>

      <Diagram />

      <ol className="list-decimal space-y-2 pl-5">
        <li>You join a round with BTC or MUSD, and set the least you will accept.</li>
        <li>The round closes. Swaps in opposite directions are matched with each other at the pool&apos;s price.</li>
        <li>Only what is left over is sent to the Mezo pool, in one swap.</li>
        <li>You get your tokens. If your minimum can&apos;t be met, you get your money back instead.</li>
      </ol>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Which price do matched swaps get?</h2>
        <p className="text-muted">
          The price a tiny swap on the pool would get at that moment. Example: the pool jumped 0.40% above its average.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[34rem] border border-line text-left text-sm">
            <thead className="bg-bg text-muted">
              <tr>
                <th className="p-2 font-medium">Option</th>
                <th className="p-2 font-medium">BTC seller gets</th>
                <th className="p-2 font-medium">MUSD seller pays</th>
                <th className="p-2 font-medium">Problem</th>
              </tr>
            </thead>
            <tbody className="num align-top">
              <tr className="border-t border-line">
                <td className="p-2">Match at the pool average</td>
                <td className="p-2">78,224.80</td>
                <td className="p-2">78,224.80</td>
                <td className="p-2">BTC sellers do 0.36% worse than swapping alone, and others can profit from it.</td>
              </tr>
              <tr className="border-t border-line">
                <td className="p-2">Worst price for each side</td>
                <td className="p-2">78,224.80</td>
                <td className="p-2">78,537.70</td>
                <td className="p-2">The gap has no owner, so it turns into a hidden fee.</td>
              </tr>
              <tr className="border-t border-line bg-bg font-medium">
                <td className="p-2">Pool price at settle (what we use)</td>
                <td className="p-2">78,537.70</td>
                <td className="p-2">78,537.70</td>
                <td className="p-2">The matched side gets the exact mid price. Each side as a group does at least as well as one pool swap, and your minimum always holds.</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-muted">
          A round only settles if the pool price is close to its pool average (TWAP), and the average is close to Mezo&apos;s
          price feed. If it can&apos;t settle in time, everyone is refunded.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Good to know</h2>
        <ul className="list-disc space-y-1 pl-5 text-muted">
          <li>This is a testnet. The pool is thin and the price feed can differ from it a lot.</li>
          <li>Nobody holds an admin key that can move your funds. The owner can only pause new swaps.</li>
          <li>If no one swaps the other way, your swap goes to the pool as usual.</li>
        </ul>
      </section>

      <p>
        <Link href="/" className="underline underline-offset-2">
          Start a swap
        </Link>
      </p>
    </article>
  );
}
