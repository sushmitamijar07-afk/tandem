"use client";

import { useState, type ReactNode } from "react";
import { RainbowKitProvider, darkTheme, lightTheme } from "@rainbow-me/rainbowkit";
import "@rainbow-me/rainbowkit/styles.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import { ThemeProvider, useTheme } from "next-themes";
import { mezoTestnet } from "@/lib/contracts";
import { wagmiConfig } from "@/lib/wagmi";
import { TxToast } from "@/components/tx-toast";

const rkLight = lightTheme({ accentColor: "#14508a", accentColorForeground: "#f5f9ff", borderRadius: "small", fontStack: "system" });
const rkDark = darkTheme({ accentColor: "#6fb0ee", accentColorForeground: "#07121e", borderRadius: "small", fontStack: "system" });

function WalletModalProvider({ children }: { children: ReactNode }) {
  const { resolvedTheme } = useTheme();
  return (
    <RainbowKitProvider theme={resolvedTheme === "dark" ? rkDark : rkLight} initialChain={mezoTestnet} modalSize="compact">
      {children}
    </RainbowKitProvider>
  );
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: (n) => n < 2,
            retryDelay: (n) => Math.min(800 * 2 ** n, 4000),
            refetchOnWindowFocus: true,
            staleTime: 5_000,
          },
        },
      }),
  );
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} disableTransitionOnChange>
      <WagmiProvider config={wagmiConfig}>
        <QueryClientProvider client={queryClient}>
          <WalletModalProvider>
            {children}
            <TxToast />
          </WalletModalProvider>
        </QueryClientProvider>
      </WagmiProvider>
    </ThemeProvider>
  );
}
