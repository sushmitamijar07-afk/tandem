# Deployment record (Mezo testnet, chain 31611)

Deployed 2026-11-15. Web app: https://tandem-mezo.vercel.app. No keys or secrets belong in this file.

## Addresses

| Contract | Address | Verified |
|---|---|---|
| PriceGuard | [`0x68B5007d9BbDCc01441047454a8A99a0F3e552b6`](https://explorer.test.mezo.org/address/0x68B5007d9BbDCc01441047454a8A99a0F3e552b6) | yes (Blockscout) |
| BatchSettler | [`0xACE4757a57Cf061A8B8eA09Bc8BEa34B6f284e5c`](https://explorer.test.mezo.org/address/0xACE4757a57Cf061A8B8eA09Bc8BEa34B6f284e5c) | yes (Blockscout) |
| IntentBook | [`0x91713e27E072Bb058973e802807B66E4BD06ba80`](https://explorer.test.mezo.org/address/0x91713e27E072Bb058973e802807B66E4BD06ba80) | yes (Blockscout) |

Also in `contracts/deployments/31611.json` (written by `script/Deploy.s.sol`).

## Constructor parameters

| Parameter | Value |
|---|---|
| `batchDuration` | 120 s |
| `settleTimeout` | 7200 s |
| `maxIntents` | 40 |
| `minMusdIn` | 10e18 |
| `minBtcIn` | 1e14 |
| `granularity` | 2 |
| `maxSpotTwapBps` | 50 |
| `gapBps` (measured at deploy) | 1,900 |
| `oracleBandBps` = min(3000, gapBps + 400) | 2,300 |
| `startTime` | 1794737340 |
| `owner` | `0xaf93fB565592D2B51bd9CBa525FF12FAcC5151b8` (can only pause new swaps) |

## Transactions

| Step | Tx | Block | Gas used |
|---|---|---|---|
| Deploy PriceGuard | [`0xaf1d9ee3…`](https://explorer.test.mezo.org/tx/0xaf1d9ee3ac095679cdf82c87197c3d771f7db54360e45f7ffcdad56c703ff591) | 16794084 | 662,789 |
| Deploy BatchSettler | [`0x0b0cc550…`](https://explorer.test.mezo.org/tx/0x0b0cc5502a8fbc1074809c79c5fd4ce3700bc5353253c7e3df471ed502fc1bb5) | 16794085 | 1,049,938 |
| Deploy IntentBook | [`0x1f9c7d3e…`](https://explorer.test.mezo.org/tx/0x1f9c7d3e815f21a73174af69361dba1dcc414635f00b6fcc4feea7d42ce1336b) | 16794086 | 3,913,724 |
| Buy demo MUSD on the pool (0.0011 BTC to 85.60 MUSD) | [`0x0563b1af…`](https://explorer.test.mezo.org/tx/0x0563b1afe619fedba20e474445100b852b94a1834db62f844aab390a46d9dd02) | | 180,240 |
| Smoke round #4: submit 0.0002 BTC | [`0x2ca5e24f…`](https://explorer.test.mezo.org/tx/0x2ca5e24f8cadd51979a05ea2a4b6f9b9e6f487829f61573c5f891aa0ac71a050) | | 234,581 |
| Smoke round #4: settle (15.56 MUSD paid) | [`0xdee64285…`](https://explorer.test.mezo.org/tx/0xdee64285d2c88fb8d1445d508e813ab184b61aa41bb502910c96f69d12ba7bac) | | see note |
| Demo round #53: A sells 0.001 BTC, minimum 77 MUSD | [`0x6518d0c4…`](https://explorer.test.mezo.org/tx/0x6518d0c44f3e94c9b016d79368ca005321e01ea1600b7889084391e8ccffc66b) | | |
| Demo round #53: B sells 60 MUSD, minimum 0.00076 BTC | [`0x886067fb…`](https://explorer.test.mezo.org/tx/0x886067fb4041acaca338ed5f65d49239b002f23b60bcfce9667afa22c1c97fec) | | |
| Demo round #53: C sells 20 MUSD, minimum 0.00026 BTC | [`0xd57f45bf…`](https://explorer.test.mezo.org/tx/0xd57f45bfbf4f76e9dd533a501aea3e03db1a91107d01aea0014ef51666980b11) | | |
| Demo round #53: settle | [`0xda77597a…`](https://explorer.test.mezo.org/tx/0xda77597a1bbb67e8837d4a7dd05cbc26c825a3bb7a62317d3c737a2888b81e1a) | | see note |

## Demo round #53 result (read from the chain)

- A (BTC seller): filled, received 77.831917 MUSD for 0.001 BTC.
- B (MUSD seller): filled, received 0.000770821 BTC for 60 MUSD, matched against A with no pool fee.
- C (MUSD seller): refunded 20 MUSD in full. Its minimum needed a better price than the round's.
- Matched: 0.000771 BTC against 60 MUSD. Sent to the pool once: 0.000229 BTC for 17.83 MUSD.

## What testnet confirmed

- BTC precompile `approve` plus Router `transferFrom` works (the routed leg in both settles).
- BTC payouts through the precompile `transfer` inside settle succeed (B was paid in BTC).
- `PriceGuard.checked()` passes against the live price feed, with no mock.

## Not measured or not done

- Exact settle gas. Mezo reports at least half of the gas limit as used, so the receipts (750,000 and 1,250,000) show the floor of the limit sent, not real usage. Real usage is at or below those numbers.
- Worst-case 40-swap settle on the real pool.
- A browser swap with a connected wallet, including a Passport smart account. The demo swaps were sent by script from three test wallets.
- The automatic settle job (docs/KEEPER.md). Rounds are settled by anyone clicking "Settle round".
