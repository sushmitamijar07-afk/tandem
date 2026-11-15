"use client";

import { useState } from "react";
import { useConfig } from "wagmi";
import type { Hash } from "viem";
import { USE_MOCKS } from "@/lib/contracts";
import { describeError } from "@/lib/errors";
import { pushToast } from "@/lib/toast";
import { executeWrite, type WriteSpec } from "@/lib/writes";
import { useRefresh } from "@/hooks/use-data";

interface RunOptions {
  /** Plain-words toast on success. */
  success: string;
  onSuccess?: () => void;
}

/** One write at a time per component: pending key, tx hash, toast, refresh after confirmation. */
export function useTx() {
  const config = useConfig();
  const refresh = useRefresh();
  const [pending, setPending] = useState<string | null>(null);
  const [hash, setHash] = useState<Hash | undefined>();

  async function run(key: string, spec: WriteSpec, o: RunOptions): Promise<boolean> {
    if (pending) return false;
    setPending(key);
    setHash(undefined);
    try {
      let h: Hash;
      if (USE_MOCKS) {
        h = ("0x" + "cd".repeat(32)) as Hash;
        setHash(h);
        await new Promise((r) => setTimeout(r, 900));
      } else {
        ({ hash: h } = await executeWrite(config, spec, setHash));
      }
      pushToast({ kind: "success", title: o.success, hash: h });
      o.onSuccess?.();
      await refresh();
      return true;
    } catch (err) {
      const d = describeError(err);
      const h = (err as { hash?: string }).hash;
      pushToast({ kind: d.kind === "rejected" ? "info" : "error", title: d.message, hash: h });
      return false;
    } finally {
      setPending(null);
    }
  }

  return { run, pending, hash };
}
