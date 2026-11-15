"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import type { Address, PublicClient } from "viem";
import { USE_MOCKS, mezoTestnet } from "@/lib/contracts";
import { aloneOut } from "@/lib/amm";
import {
  contractsDeployed,
  fetchAccount,
  fetchAloneQuote,
  fetchRoundDetail,
  fetchSnapshot,
} from "@/lib/reads";
import { mockAccount, mockRoundDetail, mockSnapshot } from "@/lib/mocks";
import { useScenario } from "@/hooks/use-scenario";
import type { Snapshot } from "@/lib/types";

/** Polling interval. Brief: 15 s at most. */
export const POLL_MS = 15_000;

function useClient() {
  return usePublicClient({ chainId: mezoTestnet.id }) as PublicClient | undefined;
}

/** Chain-corrected unix seconds, ticking every second. */
export function useNow(snap: Snapshot | undefined): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);
  void tick;
  if (!snap) return Math.floor(Date.now() / 1000);
  return snap.chainTime + Math.floor((Date.now() - snap.fetchedAt) / 1000);
}

export function useSnapshot() {
  const client = useClient();
  const scenario = useScenario();
  const deployed = contractsDeployed();
  return useQuery<Snapshot>({
    queryKey: ["snapshot", USE_MOCKS ? scenario : "live", deployed],
    enabled: USE_MOCKS || (deployed && !!client),
    refetchInterval: POLL_MS,
    queryFn: async () => {
      if (USE_MOCKS) {
        if (scenario === "loading") return new Promise<Snapshot>(() => {});
        return mockSnapshot(scenario, Math.floor(Date.now() / 1000));
      }
      return fetchSnapshot(client as PublicClient);
    },
  });
}

export function useAccountData(address: Address | undefined) {
  const client = useClient();
  const scenario = useScenario();
  return useQuery({
    queryKey: ["account", address, USE_MOCKS ? scenario : "live"],
    enabled: !!address && (USE_MOCKS || (contractsDeployed() && !!client)),
    refetchInterval: POLL_MS,
    queryFn: async () => {
      if (USE_MOCKS) return mockAccount(scenario, Math.floor(Date.now() / 1000));
      return fetchAccount(client as PublicClient, address as Address);
    },
  });
}

export function useRoundDetail(id: bigint | null) {
  const client = useClient();
  const scenario = useScenario();
  return useQuery({
    queryKey: ["round", id?.toString(), USE_MOCKS ? scenario : "live"],
    enabled: id !== null && (USE_MOCKS || (contractsDeployed() && !!client)),
    refetchInterval: POLL_MS,
    queryFn: async () => {
      if (USE_MOCKS) return mockRoundDetail(id as bigint, scenario, Math.floor(Date.now() / 1000));
      return fetchRoundDetail(client as PublicClient, id as bigint);
    },
  });
}

/** Swapping alone now, via Router.getAmountsOut. Mock mode uses the amm helper on mock reserves. */
export function useAloneQuote(sellBtc: boolean, amountIn: bigint | null, snap: Snapshot | undefined) {
  const client = useClient();
  return useQuery({
    queryKey: ["alone", sellBtc, amountIn?.toString(), USE_MOCKS],
    enabled: !!amountIn && amountIn > 0n && (USE_MOCKS || !!client),
    refetchInterval: POLL_MS,
    queryFn: async () => {
      if (USE_MOCKS && snap?.prices) {
        return aloneOut(sellBtc, amountIn as bigint, snap.prices);
      }
      return fetchAloneQuote(client as PublicClient, sellBtc, amountIn as bigint);
    },
  });
}

/** Refresh everything after a confirmed write. */
export function useRefresh() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries();
}
