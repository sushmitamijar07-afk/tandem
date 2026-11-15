# FACTS — P0 re-check on Mezo testnet (chain 31611)

Re-run on 2026-11-14 at block timestamp 1794627849 with `cast` against `https://rpc.test.mezo.org`.
Every shared §3.8 check and every brief §11.1 check matched. No address or signature changed.

## Shared §3.8 checklist

| Check | Expected | Read | OK |
|---|---|---|---|
| `MUSD.mintList(BorrowerOperations)` | true | true | yes |
| `BorrowerOperations.minNetDebt()` | 1800e18 | 1800e18 | yes |
| `BorrowerOperations.MUSD_GAS_COMPENSATION()` | 200e18 | 200e18 | yes |
| `TroveManager.MCR()` | 1.1e18 | 1.1e18 | yes |
| `PriceFeed.fetchPrice()` | ~6.7e22 | 66,781.92051e18 | yes |
| `StabilityPool.getTotalMUSDDeposits()` | > 0 | 86,209,954.60 MUSD | yes |
| `sMUSD.yieldToken()` | MUSD | 0x1189…C503 | yes |
| `Router.defaultFactory()` | 0x4947…Ce1A | 0x4947…Ce1A | yes |
| `Pool.token0()` | MUSD | 0x1189…C503 | yes |
| pool native balance == BTC precompile `balanceOf(pool)` | equal | 1307259994017371489267 both | yes |

## Brief §11.1 (Batch Swap)

| Fact | Value |
|---|---|
| `getReserves()` | r0 = 102257124585249121862151778 MUSD, r1 = 1307259994017371489267 BTC, ts 1794603474 (unchanged since the brief was written) |
| spot mid r0/r1 | 78,222.48 MUSD/BTC |
| `quote(BTC, 1e16, 2)` × 100 (TWAP, G=2) | 78,224.80 MUSD/BTC |
| spot vs TWAP | 0.30 bps (limit 50) |
| `PriceFeed.fetchPrice()` | 66,781.92 USD/BTC |
| **gapBps** = ceil(\|twap − oracle\| · 1e4 / oracle) | **1,714** (was 1,565 when the brief was written; the oracle moved, the pool did not) |
| **Testnet `ORACLE_BAND_BPS`** = min(3000, gapBps + 400) | **2,114** — re-measured again right before deploy; stop if gapBps > 2,600 |
| `lastObservation().timestamp` | 1794603474 → age 24,375 s (≈6.8 h) |
| `observationLength()` | 3048 |
| `PoolFactory.getFee(pool, false)` | 4 |
| `PoolFactory.isPaused()` | false |
| `Pool.stable()` | false |
| `Router.poolFor(MUSD, BTC, false, FACTORY)` | 0xd16A5Df82120ED8D626a1a15232bFcE2366d6AA9 (the pool) |
| block gas limit / gas price | 10,000,000 / 146 wei |

## VERIFY items (resolved in P3)

- [ ] BTC precompile `approve` + Router `transferFrom` on BTC received as `msg.value` (smoke settle).
- [ ] Passport orangekit smart account can call a payable function with value (browser test).
- [ ] Gas of a BTC precompile `transfer` inside settle (smoke/demo receipts).
- [ ] `deal(MUSD, …)` on a fork (fork tests).
