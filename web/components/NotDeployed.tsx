import Link from "next/link";
import { Panel } from "@/components/ui";

/** Shown when no contract addresses are configured and mocks are off. */
export function NotDeployed() {
  return (
    <Panel className="max-w-xl">
      <h1 className="text-xl font-semibold">Not deployed yet</h1>
      <p className="mt-2 text-sm text-muted">
        Tandem&apos;s contracts aren&apos;t live on Mezo Testnet yet, so there is nothing to swap. Check back soon.
      </p>
      <p className="mt-4 text-sm">
        <Link href="/how" className="underline underline-offset-2">
          Read how it works
        </Link>
      </p>
    </Panel>
  );
}

export function LoadError({ what }: { what: string }) {
  return (
    <Panel className="max-w-xl">
      <p className="text-sm">Couldn&apos;t load {what}. We&apos;ll keep trying.</p>
    </Panel>
  );
}
