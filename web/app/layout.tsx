import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { Providers } from "@/components/providers";
import { Header } from "@/components/header";
import { ContractsFooter } from "@/components/ContractsFooter";
import { MockBanner, WrongNetworkBanner } from "@/components/banners";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: { default: "Tandem: MUSD and BTC in short rounds", template: "%s | Tandem" },
  description: SITE.description,
  manifest: "/manifest.json",
  openGraph: { title: "Tandem", description: SITE.description, siteName: "Tandem", type: "website" },
  twitter: { card: "summary_large_image", title: "Tandem", description: SITE.description },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f5f7" },
    { media: "(prefers-color-scheme: dark)", color: "#0e1218" },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen">
        <Providers>
          <Header />
          <WrongNetworkBanner />
          <MockBanner />
          <main className="mx-auto max-w-5xl px-4 pt-8 sm:pt-12">{children}</main>
          <ContractsFooter />
        </Providers>
      </body>
    </html>
  );
}
