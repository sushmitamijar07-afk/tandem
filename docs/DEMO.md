# Tandem — 3-wallet demo and shot list

> Recorded run: round #53 on 2026-11-15. Real transactions and results are in [DEPLOYMENT.md](DEPLOYMENT.md). The steps below still show the larger amounts from the brief in places; the script (`contracts/script/Demo.s.sol`) uses the small amounts in the table.

Brief §12 + §6.3, with the SPEC D35 copy fix ("pool average", not "1-hour average"). Values in `{BRACES}` are read live on the day; never type in a number that wasn't read from the chain or the screen.

## Wallets (keys only via env for the one command; never in files)

| Wallet | Role | Funding (testnet-faucet size; the brief used 50x larger amounts) |
|---|---|---|
| W1 | A — sells 0.001 BTC | 0.00105 BTC |
| W2 | B — sells 60 MUSD | 0.00005 BTC + 60 MUSD bought on the pool |
| W3 | C — sells 20 MUSD with a minimum set too high | 0.00005 BTC + 20 MUSD bought on the pool |

Addresses: W1 `{W1_ADDRESS}` · W2 `{W2_ADDRESS}` · W3 `{W3_ADDRESS}`. Contracts: IntentBook `{INTENT_BOOK}` · PriceGuard `{PRICE_GUARD}` · BatchSettler `{BATCH_SETTLER}` (from `contracts/deployments/31611.json`).

## Before recording (script, SPEC D39)

```bash
R=https://rpc.test.mezo.org
FLAGS="--rpc-url $R --broadcast --skip-simulation --gas-estimate-multiplier 150"
# 1. W2 opens a trove for 4,000 MUSD (0.12 BTC collateral) and sends 1,000 MUSD to W3
PHASE=fund W2_KEY=0x… W3_ADDR={W3_ADDRESS} forge script script/Demo.s.sol $FLAGS
# 2. sanity: price guard passes right now
cast call --rpc-url $R {PRICE_GUARD} "checked()((uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256))"
```

Record: trove tx `{TX_OPEN_TROVE}`, MUSD transfer tx `{TX_MUSD_TO_W3}`.

## The round (live app, recorded)

All three submits must land in **one** round (120 s). Start right after a new round opens.

| Step | Who | Action in the app | Minimum typed | Tx |
|---|---|---|---|---|
| 1 | W1 (A) | Sell BTC 0.05 → Join round | 3,880 MUSD | `{TX_A_SUBMIT}` |
| 2 | W2 (B) | Sell MUSD 3,000 → Approve MUSD → Join round | 0.038 BTC | `{TX_B_APPROVE}`, `{TX_B_SUBMIT}` |
| 3 | W3 (C) | Sell MUSD 1,000 → Approve MUSD → Join round | **0.0128 BTC** ("too greedy") | `{TX_C_APPROVE}`, `{TX_C_SUBMIT}` |

Fallback if the browser path stalls: `PHASE=submit W1_KEY=… W2_KEY=… W3_KEY=… forge script script/Demo.s.sol $FLAGS` (refuses if < 60 s left in the round; prints the round id).

4. Round panel shows round `#{BATCH_ID}`, countdown, "Selling BTC: 0.050000 BTC (1)", "Selling MUSD: 4,000.00 MUSD (2)", pool price `{SPOT}`, pool average `{TWAP}` (window `{TWAP_WINDOW}`), Mezo price feed `{ORACLE}`, and the testnet sentence with gap `{GAP_PCT}` and limit `{BAND_PCT}`.
5. At 0:00 click **Settle round** (any wallet; or the keeper). Fallback: `PHASE=settle BATCH_ID={BATCH_ID} PRIVATE_KEY=… forge script script/Demo.s.sol $FLAGS`. Settle tx `{TX_SETTLE}`, gas `{SETTLE_GAS}`.

## Expected result (brief §6.3; exact at the 2026-11-14 reserves, drifts slightly if reserves move)

| | Result | Kept vs alone |
|---|---|---|
| C | refunded 1,000.00 MUSD (minimum not met) | — |
| B | ≈ 0.038352 BTC at mid ≈ 78,222.48 | ≈ +0.000016 BTC ≈ +1.29 MUSD |
| A | ≈ 3,910.75 MUSD at ≈ 78,215.03 | ≈ +1.34 MUSD |
| Router | one swap ≈ 0.011648 BTC → ≈ 910.75 MUSD inside `{TX_SETTLE}` | |

Read the real figures from the `BatchSettled` / `IntentFilled` / `IntentRefunded` events of `{TX_SETTLE}`: B `{B_OUT}` BTC (+`{B_KEPT}`), A `{A_OUT}` MUSD (+`{A_KEPT}`), C refund `{C_REFUND}`, rounds `{ROUNDS}` (expect 2). Copy all hashes into `docs/DEPLOYMENT.md`.

If settle reverts `SpotTwapDeviation` / `OracleUnavailable`, wait and retry (the UI says so); do not cut it from the video if it happens — show the plain-words message.

## Shot list (≈ 2 min, 1080p, voiceover + subtitles)

| t | Shot | Voiceover |
|---|---|---|
| 0:00 | Swap box | "Every MUSD to BTC swap on Mezo pays the pool fee and moves the price. But at any moment someone is often swapping the other way." |
| 0:15 | Three wallets submit | "Tandem collects swaps into two-minute rounds. Here one wallet sells BTC and two sell MUSD. One of them sets a minimum that can't be met." |
| 0:40 | Round panel, both prices | "Matching uses the pool's live mid price, checked against the pool's own average price and Mezo's BTC price feed. On testnet the pool sits about {GAP_PCT_ROUNDED} above the feed; we show both." |
| 1:00 | Settle → explorer `{TX_SETTLE}` | "Anyone can settle. Opposite swaps are matched with no fee and no price impact. Only the leftover goes through the Mezo Router, in one swap." |
| 1:20 | Results panel | "Each side gets one price. The greedy order is refunded in full. Both other wallets got more than swapping alone at the same moment." |
| 1:40 | Footer contracts + README calls table | "It calls the Mezo Router, the MUSD/BTC pool's TWAP and quotes, the pool factory fee, and the MUSD price feed." |
| 1:50 | Example 2 table (brief §6.4, labelled "math, not run on testnet") | "The bigger the swap, the more it saves. Next: more pairs, and wallets sending swaps here by default." |
