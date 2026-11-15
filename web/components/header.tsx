"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { WalletButton } from "@/components/wallet-button";
import { ThemeToggle } from "@/components/theme-toggle";

export function Logo() {
  return (
    <span className="flex items-center gap-2">
      <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden>
        <rect width="32" height="32" fill="var(--brand)" />
        <path d="M7 11h15M7 11l4-4M25 21H10M25 21l-4 4" fill="none" stroke="var(--on-brand)" strokeWidth="2.6" />
      </svg>
      <span className="text-lg font-semibold tracking-tight">Tandem</span>
    </span>
  );
}

const NAV = [
  { href: "/", label: "Swap" },
  { href: "/history", label: "My swaps" },
  { href: "/how", label: "How it works" },
];

export function Header() {
  const path = usePathname();
  return (
    <header className="border-b border-line">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        <Link href="/" aria-label="Tandem home">
          <Logo />
        </Link>
        <span className="border border-line px-2 py-0.5 text-xs text-muted">Mezo Testnet</span>
        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
          <WalletButton />
        </div>
        <nav className="order-last flex w-full gap-5 text-sm sm:order-none sm:ml-4 sm:w-auto" aria-label="Main">
          {NAV.map((n) => {
            const active = n.href === "/" ? path === "/" : path.startsWith(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={active ? "page" : undefined}
                className={`py-1 ${active ? "border-b-2 border-brand text-ink" : "text-muted hover:text-ink"}`}
              >
                {n.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
