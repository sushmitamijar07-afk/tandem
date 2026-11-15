"use client";

import { useAccount, useSwitchChain } from "wagmi";
import { isSmartAccountConnector } from "@/lib/wagmi";
import { USE_MOCKS, mezoTestnet } from "@/lib/contracts";
import { MOCK_USER } from "@/lib/mocks";
import { useMockWallet } from "@/hooks/use-scenario";

/** Connected wallet and network state. Falls back to wallet_addEthereumChain when the switch fails. */
export function useWallet() {
  const conn = useAccount();
  const { switchChainAsync, isPending: isSwitching } = useSwitchChain();
  const mockOn = useMockWallet();
  const fake = USE_MOCKS && mockOn;
  const wrongNetwork = !fake && conn.isConnected && conn.chainId !== mezoTestnet.id;

  async function switchToMezo() {
    try {
      await switchChainAsync({ chainId: mezoTestnet.id });
    } catch (err) {
      const provider = (await conn.connector?.getProvider?.()) as
        | { request: (a: { method: string; params?: unknown[] }) => Promise<unknown> }
        | undefined;
      const code = (err as { code?: number; cause?: { code?: number } }).cause?.code ?? (err as { code?: number }).code;
      if (!provider || (code !== 4902 && code !== -32603 && code !== undefined)) throw err;
      await provider.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: `0x${mezoTestnet.id.toString(16)}`,
            chainName: mezoTestnet.name,
            nativeCurrency: mezoTestnet.nativeCurrency,
            rpcUrls: mezoTestnet.rpcUrls.default.http,
            blockExplorerUrls: [mezoTestnet.blockExplorers.default.url],
          },
        ],
      });
    }
  }

  const isConnected = fake || conn.isConnected;
  return {
    address: fake ? MOCK_USER : conn.address,
    isConnected,
    connector: conn.connector,
    fake,
    /** Passport Bitcoin wallet (Mezo smart account): no permits, approvals take one extra step. */
    isSmartAccount: isSmartAccountConnector(conn.connector),
    wrongNetwork,
    isReady: isConnected && !wrongNetwork,
    isSwitching,
    switchToMezo,
  };
}
