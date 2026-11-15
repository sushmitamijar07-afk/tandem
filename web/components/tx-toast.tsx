"use client";

import { dismissToast, useToasts } from "@/lib/toast";
import { txUrl } from "@/lib/contracts";
import { shortHash } from "@/lib/format";

/** Plain-word toasts with an explorer link. */
export function TxToast() {
  const toasts = useToasts();
  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-stretch gap-2 p-4 sm:inset-x-auto sm:right-4 sm:w-96"
      aria-live="polite"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          role={t.kind === "error" ? "alert" : "status"}
          className="rise pointer-events-auto flex items-start gap-3 border border-line bg-surface p-3 text-sm shadow-[0_6px_24px_rgba(0,0,0,0.12)]"
        >
          <span
            aria-hidden
            className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
            style={{ background: t.kind === "error" ? "var(--bad)" : t.kind === "success" ? "var(--good)" : "var(--muted)" }}
          />
          <div className="min-w-0 flex-1">
            <p className="text-ink">{t.title}</p>
            {t.hash && (
              <a
                href={txUrl(t.hash)}
                target="_blank"
                rel="noreferrer"
                className="num mt-0.5 inline-block text-xs text-muted underline underline-offset-2 hover:text-ink"
              >
                View {shortHash(t.hash)} on the explorer
              </a>
            )}
          </div>
          <button type="button" onClick={() => dismissToast(t.id)} className="px-1 text-muted hover:text-ink" aria-label="Dismiss">
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
