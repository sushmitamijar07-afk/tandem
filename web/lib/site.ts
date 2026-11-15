export const SITE = {
  name: "Tandem",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "https://tandem-mezo.vercel.app",
  description: "Swap MUSD and BTC in short rounds. Opposite swaps are matched first; only the rest goes to the pool.",
  github: "https://github.com/sushmitamijar07-afk/tandem",
} as const;
