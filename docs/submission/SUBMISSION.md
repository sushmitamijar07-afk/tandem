# Tandem — AKINDO / Mezo Buildathon submission answers

Same questions, same order as the AKINDO forms: team form, product form, wave form.
Every fact comes from the live site (tandem-mezo.vercel.app), the deployed contracts, or the transactions in `docs/DEPLOYMENT.md`.

Before you submit:

1. Make `https://github.com/sushmitamijar07-afk/tandem` **public**. It is private now, so judges would see a 404.
2. Upload the demo video (`tandem-demo.mp4`, 2:13, kept on your machine and not in the repo) to YouTube as **Public** and paste the link in Video.
3. Fill in the grant recipient and social links yourself.

---

## PART 1 — Create team

**Icon**
Upload `docs/submission/tandem-logo-1024.png` (1024×1024).

**Team name**

```
Tandem
```

**About this team** (Markdown)

```markdown
**Tandem** swaps MUSD and BTC on Mezo in short rounds. People swapping in opposite directions are matched with each other first, at the pool price, with no pool fee.

On a normal exchange, every swap goes through the pool alone. Each one pays the pool fee and moves the price, even when someone else wants the exact opposite trade a few seconds later. Tandem fixes that:

- **Two-minute rounds:** swaps join a round. When it closes, anyone can settle it.
- **Matched first:** BTC sellers and MUSD sellers in the same round are matched at the pool's price. Matched amounts pay no pool fee.
- **One trip to the pool:** only what is left over goes to the Mezo MUSD/BTC pool, in one swap for the whole round.
- **Your minimum always holds:** every swap sets the least it will accept. If the round can't give that, the funds come back in full.
- **Price checks:** a round only settles when the pool price is close to its own average and inside a band around Mezo's price feed.
- **No one holds the keys:** the owner can pause new swaps and nothing else.

Live on Mezo testnet:
- App: <https://tandem-mezo.vercel.app>
- IntentBook contract (verified): <https://explorer.test.mezo.org/address/0x91713e27E072Bb058973e802807B66E4BD06ba80>
- A real three-wallet round settled on-chain: <https://explorer.test.mezo.org/tx/0xda77597a1bbb67e8837d4a7dd05cbc26c825a3bb7a62317d3c737a2888b81e1a>
```

**Buildathon Grant Recipient:** fill in yourself (the person receiving the grant).

**GitHub or Website**

```
https://github.com/sushmitamijar07-afk/tandem
```

(Make it public first, or use `https://tandem-mezo.vercel.app`.)

**X / Telegram / Discord:** your own links, or leave empty.

**Recruiting Members:** leave it unchecked.

---

## PART 2 — Register product

**Product icon**
Upload `docs/submission/tandem-logo-1024.png`.

**Product name**

```
Tandem
```

**Tagline** (50 characters or fewer)

```
Swap MUSD and BTC in rounds, matched first
```

(42 characters.) Alternatives:

- `MUSD and BTC swaps, matched in short rounds` (43)
- `Swap in rounds. Match first, pool second.` (41)

**Describe your product in 100 words or less**

```
Tandem swaps MUSD and BTC on Mezo in two-minute rounds. Everyone who joins a round sets the least they will accept. When the round closes, swaps in opposite directions are matched with each other at the pool price, with no pool fee. Only the leftover goes to the Mezo MUSD/BTC pool, in one swap for the whole round. A swap whose minimum can't be met is refunded in full. A round settles only when the pool price is close to its average and to Mezo's price feed. Anyone can settle a round. Live on Mezo testnet with Mezo Passport.
```

(99 words.)

**Product type**
Functional. It is live on Vercel, with three source-verified contracts on Mezo testnet and a real three-wallet round settled on-chain.

**Image gallery** (5 images, 2560×1440, upload in this order from `docs/submission/`)

1. `1-landing.png`: the swap page with the live round and prices
2. `2-swap-form.png`: selling 0.001 BTC, with the minimum and the "swapping alone" comparison
3. `3-round-result.png`: round #53 settled, with what was matched and what went to the pool
4. `4-how-it-works.png`: how a round works
5. `5-prices-and-contracts-dark.png`: live prices, the testnet note and the contracts, in dark mode

**About** (Markdown)

```markdown
## What it does
Tandem swaps MUSD and BTC on Mezo in short rounds instead of one swap at a time.

**You join a round.** Pick a side (sell BTC or sell MUSD), enter an amount, and set the least you will accept. The app shows what swapping alone on the pool would give you right now, so you can compare. Rounds last two minutes, and you can cancel until the round closes.

**The round is matched.** When it closes, BTC sellers and MUSD sellers are matched with each other at the pool's price. Matched amounts never touch the pool, so they pay no pool fee and move no price.

**Only the leftover goes to the pool.** If one side is bigger, the difference is sent to the Mezo MUSD/BTC pool in a single swap, and that side shares the result in proportion.

**Your minimum always holds.** If the round can't give a swap its minimum, that swap is taken out and refunded in full, and the rest of the round is recalculated without it.

**Anyone can settle.** Settling is one public transaction. If nobody settles within two hours, every swap in the round is refunded.

**Price checks.** A round only settles when the pool price is within 0.5% of the pool's own average and the average is inside a band around Mezo's price feed.

## The problem it solves
On a pool, every swap trades alone. Two people who want opposite trades a minute apart both pay the pool fee and both move the price against themselves, and the pool keeps the difference. Small swaps also pay for a full pool trade each.

Tandem lets opposite swaps cancel each other out first. In the demo round, 60 MUSD of a BTC seller's order was filled directly by a MUSD seller, and only the remaining 0.000229 BTC went to the pool.

## Challenges I ran into
- **"Never worse than swapping alone" was false.** The first design claimed it for everyone. Fuzz testing showed it only holds per swap on the smaller side, and as a group on the bigger side. The app and docs now say exactly that; the minimum is what always holds.
- **Removing unfillable swaps fairly.** An AI security audit (Pashov solidity-auditor, two passes) found that one swap with an impossible minimum could push fillable swaps into a refund. The contract now removes one swap per pass, the one furthest from its minimum, then recalculates.
- **Blocking a round for free.** The same audit found that cancelled swaps kept their slot, so one caller could fill a round and lock everyone out. Cancelling now frees the slot.
- **A stale refund.** A swap that changed sides during recalculation kept an old refund amount, which could make settle fail. Fixed and covered by a test.
- **The testnet pool is far from the price feed.** It trades about 19% above Mezo's feed because it is thin and not arbitraged. The band is measured at deploy and set to 23% on testnet; the app says so in plain words. A real launch would use about 3%.
- **Native BTC as a token.** BTC on Mezo is also an ERC-20 at a fixed address. Approving it for the Router and paying it out inside settle had to be proven on testnet, not assumed.
- **Reading the chain in the browser.** The app first showed nothing because the chain setup was missing Mezo's Multicall3 address.

## Technologies I used
Mezo testnet (MUSD, native BTC, the MUSD/BTC pool and Router, Mezo's price feed), Mezo Passport, Solidity and Foundry, OpenZeppelin, Next.js, TypeScript, Tailwind, wagmi and viem, RainbowKit, Vercel.

## How we built it
I checked every Mezo fact on-chain first: token and pool addresses, the Router's swap signature, the pool's average price, and the gap between the pool and the price feed. Then I wrote a spec with 40 fixed decisions and froze the contract interfaces before any code.

There are three contracts. **IntentBook** holds the rounds, takes swaps, settles and pays out. **BatchSettler** does the matching maths and has no funds. **PriceGuard** reads the pool price, the pool average and the price feed, and refuses to settle outside the limits. The owner can only pause new swaps.

The app reads everything from the chain: the live round, prices, each round's result and its transactions. There is no database.

Tests: 96 contract tests (unit, fuzz, stateful invariants and fork tests against the real pool). All three contracts are deployed and source-verified on Mezo testnet. A three-wallet round ran on-chain: one wallet sold 0.001 BTC and received 77.83 MUSD, one sold 60 MUSD and received 0.000771 BTC, and one with a minimum set too high got its 20 MUSD back.

## What we learned
- Fuzz your marketing claims, not just your code. A claim that sounds obviously true can be false for one side of the trade.
- A minimum the user sets is a stronger promise than any average-case saving, because it can be enforced on-chain.
- Fair removal matters as much as fair pricing. How you drop one bad order decides who else gets hurt.
- Testnet prices are not real prices. Measure them, set limits from the measurement, and tell the user.

## What's next for Tandem
- An automatic settler, so rounds close without anyone clicking.
- A small reward for whoever settles a round.
- More pairs on Mezo, starting with MUSD and other Mezo assets.
- Clearing at an average price, to cut the settler's influence on the price further.
- A professional audit, then a mainnet release with a 3% price band.
```

**Deliverable URL**

```
https://github.com/sushmitamijar07-afk/tandem
```

(The repo must be public.)

**Video**
YouTube link, after uploading `tandem-demo.mp4`.

**Live demo**

```
https://tandem-mezo.vercel.app
```

**Build with**
Mezo, MUSD, Mezo Passport, Bitcoin

**Product Category** (max 3)
DeFi, Trading, Market Infrastructure

**Tags** (max 10)
Solidity, Foundry, OpenZeppelin, Next.js, TypeScript, Tailwind, viem, wagmi, Mezo Passport, Vercel

**Product detail visibility**
Show

---

## PART 3 — Wave form

**Updates in this Wave** (3,000 characters or fewer)

```
Tandem is live on Mezo testnet: https://tandem-mezo.vercel.app
Code: https://github.com/sushmitamijar07-afk/tandem

What shipped this wave:
- Three contracts, deployed and source-verified on Mezo testnet:
  - IntentBook (rounds, swaps, settle, payouts): https://explorer.test.mezo.org/address/0x91713e27E072Bb058973e802807B66E4BD06ba80
  - BatchSettler (matching maths, holds no funds): https://explorer.test.mezo.org/address/0xACE4757a57Cf061A8B8eA09Bc8BEa34B6f284e5c
  - PriceGuard (price checks): https://explorer.test.mezo.org/address/0x68B5007d9BbDCc01441047454a8A99a0F3e552b6
- Two-minute rounds: join with BTC or MUSD, set a minimum, cancel any time before the round closes.
- Matching: opposite swaps are matched at the pool price with no pool fee; only the leftover goes to the Mezo MUSD/BTC pool, in one swap per round.
- Minimums enforced on-chain: a swap that can't get its minimum is refunded in full and the round is recalculated.
- Price checks: the pool price must be within 0.5% of the pool average, and the average inside a band around Mezo's price feed.
- Anyone can settle a round; an unsettled round refunds everyone after two hours. The owner can only pause new swaps.
- Web app: swap form with a "swapping alone" comparison, live round, round results with transaction links, a how-it-works page, light and dark themes, Mezo Passport for Bitcoin and Ethereum wallets.
- Real three-wallet round on testnet (round #53):
  - Sold 0.001 BTC, received 77.83 MUSD: https://explorer.test.mezo.org/tx/0x6518d0c44f3e94c9b016d79368ca005321e01ea1600b7889084391e8ccffc66b
  - Sold 60 MUSD, received 0.000771 BTC, matched with no pool fee: https://explorer.test.mezo.org/tx/0x886067fb4041acaca338ed5f65d49239b002f23b60bcfce9667afa22c1c97fec
  - Sold 20 MUSD with a minimum set too high, refunded in full: https://explorer.test.mezo.org/tx/0xd57f45bfbf4f76e9dd533a501aea3e03db1a91107d01aea0014ef51666980b11
  - Settle: https://explorer.test.mezo.org/tx/0xda77597a1bbb67e8837d4a7dd05cbc26c825a3bb7a62317d3c737a2888b81e1a
- Security: an AI audit (Pashov solidity-auditor, 2 passes) reported 5 findings. 4 are fixed, each with a regression test. The fifth is a documented limit: a round clears at the live pool price, which the settler can move by up to 0.5%.
- Tests: 96 contract tests (unit, fuzz, invariants, fork tests on the real pool).

Honest notes: the demo swaps were sent by script from three test wallets and the app shows their results from the chain; a swap from a connected browser wallet has not been tested yet. The testnet pool sits about 19% above Mezo's price feed, so the band is 23% here.
```

**Milestone — 3rd Wave** (1,000 characters or fewer). Goals for the next wave, not what is already built.

```
- Automatic settling: a hosted settler so every round closes on time without anyone clicking, plus a small on-chain reward for whoever settles.
- Wallet testing: full swaps from Bitcoin wallets through Mezo Passport and from Ethereum wallets, with fixes for anything found.
- Stronger pricing: clear rounds at an average price instead of the live price, to remove the settler's 0.5% influence.
- "My swaps" history with what each swap received compared with swapping alone.
- External security review of the three contracts, and fix every finding.
- Worst-case gas measured on the real pool with a full 40-swap round.
```

**Milestone — 4th Wave** (plan)

```
- Launch on Mezo mainnet with a 3% price band and a per-round size limit that rises over time.
- More pairs: other Mezo assets against MUSD.
- An API so wallets and other apps on Mezo can send swaps into rounds.
- Business model: a small disclosed fee on the savings from matched swaps only.
```
