import { txUrl } from "@/lib/contracts";
import { shortHash } from "@/lib/format";

/** Explorer link for a transaction hash. */
export function TxLink({ hash, label }: { hash: string; label?: string }) {
  return (
    <a
      href={txUrl(hash)}
      target="_blank"
      rel="noreferrer"
      title={hash}
      className="num font-mono text-xs underline underline-offset-2 hover:text-ink"
    >
      {label ?? shortHash(hash)}
    </a>
  );
}
