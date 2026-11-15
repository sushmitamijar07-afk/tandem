import { createConfig, http, type Config, type CreateConfigParameters } from "wagmi";
import type { WalletList } from "@rainbow-me/rainbowkit";
import { injectedWallet, metaMaskWallet, rabbyWallet, walletConnectWallet } from "@rainbow-me/rainbowkit/wallets";
import { mezoTestnet } from "@/lib/contracts";
import { SITE } from "@/lib/site";

const transports = {
  [mezoTestnet.id]: http(mezoTestnet.rpcUrls.default.http[0], { retryCount: 3, retryDelay: 400, timeout: 20_000 }),
};

const walletConnectProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "";

type PassportConfigModule = typeof import("@mezo-org/passport/dist/src/config");

/**
 * Bitcoin wallets (Unisat, OKX, Xverse) connect through Mezo Passport: a Mezo smart account holds the
 * EVM address (connector type "orangekit"). Ethereum wallets connect directly.
 */
function buildWallets(passport: PassportConfigModule): WalletList {
  const evm = walletConnectProjectId
    ? [metaMaskWallet, rabbyWallet, walletConnectWallet, injectedWallet]
    : [metaMaskWallet, rabbyWallet, injectedWallet];
  return [
    {
      groupName: "Bitcoin wallets",
      wallets: [passport.unisatWalletMezoTestnet, passport.okxWalletMezoTestnet, passport.xverseWalletMezoTestnet],
    },
    { groupName: "Ethereum wallets", wallets: evm },
  ];
}

/** Server render: no connectors. `ssr: true` lets wagmi hydrate the real connection in the browser. */
function serverConfig() {
  return createConfig({ chains: [mezoTestnet], transports, connectors: [], ssr: true });
}

/** Browser: the Passport config, loaded from the deep module (the package root breaks SSR). */
function browserConfig(): Config {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const passport = require("@mezo-org/passport/dist/src/config") as PassportConfigModule;
  return passport.getConfig({
    appName: SITE.name,
    appDescription: SITE.description,
    appUrl: SITE.url,
    mezoNetwork: "testnet",
    walletConnectProjectId: walletConnectProjectId || "batch-swap-no-walletconnect",
    wallets: buildWallets(passport),
    chains: [mezoTestnet],
    transports: transports as unknown as Pick<CreateConfigParameters, "transports">,
    ssr: true,
  });
}

export const wagmiConfig: ReturnType<typeof serverConfig> =
  typeof window === "undefined" ? serverConfig() : (browserConfig() as ReturnType<typeof serverConfig>);

/** Passport Bitcoin wallets act through a Mezo smart account. No permits; transactions are relayed. */
export function isSmartAccountConnector(connector: { type?: string } | undefined | null): boolean {
  return connector?.type === "orangekit";
}

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
