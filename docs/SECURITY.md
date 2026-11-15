# Security

Status: pre-audit. Testnet only. This file lists what we assume, what the owner can do, what is known to be limited, and the threats we considered. It is not an audit report.

## Trust assumptions

- The Mezo MUSD/BTC pool, Router, PoolFactory and PriceFeed behave as their verified source says. We read them on-chain on 2026-11-14.
- The BTC precompile (`0x7b7C…0000`) behaves like an ERC-20 for `balanceOf`, `transfer` and `approve`, and accepts native value in. A transfer to a contract with no `receive()` succeeds (measured on testnet).
- MUSD is a plain OpenZeppelin ERC-20 with no hooks and no proxy.
- The PriceFeed returns a price that is at most 60 s old, or it reverts.
- The Mezo testnet is not adversarial in the way mainnet is. Testnet has little arbitrage, so prices can be held away from the market for hours.

## Owner powers

- `setPaused(bool)` on `IntentBook`. While paused, new submits revert. Cancel, settle, expire and claim still work.
- `renounceOwnership` is kept. Renouncing only freezes the pause flag.
- The owner cannot move user funds, cannot change the pool, the router or the guards, and cannot sweep balances.
- The owner is `Ownable2Step`. Ownership transfers need an accept step.

## Known limits

- Up to 64 wei per token per round of rounding dust stays in the contract.
- Direct donations (plain transfers, not submits) cannot be withdrawn.
- No fee is charged.
- One pair only (MUSD/BTC).
- On testnet the oracle band is wide (about 21%), so the oracle check is weak. On mainnet the planned band is about 3%.
- The TWAP on a quiet testnet pool lags. It can be held away from the market.
- Settle time is not fixed. A round can wait or expire if the guards fail.

## Threats

| Threat | Who | Mitigation | Residual |
|---|---|---|---|
| Spot sandwich of settle (moving the price) | MEV searcher who also trades in the round | spot vs TWAP ≤ 50 bps; per-intent minOut; the cost to move the price is high | profitable only with a large matched volume; the UI default minOut caps victims at 0.5% |
| Sandwich of the Router leg | searcher | the leg is only the net amount; minOut on X fills | normal AMM exposure on the net only |
| TWAP drag on a quiet pool | patient attacker (testnet has no arbitrage) | the TWAP needs several observations to move; oracle band | weak on testnet (wide band), documented |
| Settler picks a favourable moment | any settler | settle is permissionless; the window ends at `expireAt`; guards apply | small timing option, inside the guards |
| Lag arbitrage by submitters | any user | the matched part clears at settle-time spot, not the TWAP | price risk between submit and settle, bounded by minOut |
| Round stuffing (fill all slots) | griefer | minimum sizes (10 MUSD, 0.0001 BTC); losers are refunded | other users wait one round |
| Forced cascade or refund of a round | griefer with crafted minOuts | bounded rounds; honest users are refunded | the attacker pays gas and locks capital |
| Re-entrancy on payouts | malicious receiver | precompile `transfer` runs no code; MUSD has no hooks; `nonReentrant`; checks-effects-interactions | none known |
| Failing receiver blocks settle | owner of an intent contract | push, then `claimable` fallback | none |
| Oracle stale or down | infra | `OracleUnavailable`; retry, or expire after the timeout | liveness only |
| Pool paused or fee raised | Mezo admin | `PoolPaused` check; fee included in quotes; minOut | liveness only |
| Owner abuse | owner | only `setPaused`; everything else is fixed; no sweep | none |
| Rounding drain | anyone | floor rounding everywhere; conservation check in settle | ≤ 64 wei per round per token stays in the contract |
| Wrong pool or route | deploy error | constructor checks `poolFor(...)`, token order, `stable == false`, decimals | none |
| Precompile behaviour differs from mocks | n/a | VERIFY items; smoke test on testnet | to be confirmed at deploy |

## Audit findings and fixes

Tool: Pashov solidity-auditor v4.1, 12 Haiku agents x 2 passes, commit 8d192ea. This is an automated scan, not a human audit.

| # | Finding | Status | Test |
|---|---|---|---|
| 1 | Cancel does not free a batch slot | Fixed. Cancel removes the intent from the round (swap-and-pop) and lowers `count`. History in `intentsOf` is kept. | `test_audit_cancelFreesSlot`, `test_audit_cancelMiddle_settlePaysRightOwners` |
| 2 | Old dust refund kept when an order changes side | Fixed. `_yOuts` clears the refund. The BTC-side mirror is not reachable: one wei of BTC always quotes more than zero MUSD. | `test_audit_staleRefund_clearedOnFlip`, `test_audit_staleRefundAfterFlip_settles` |
| 3 | Fillable orders refunded because of an unfillable order | Fixed. Each pass removes only the order furthest below its minimum (ties: lowest index), then recomputes. Worst case is 41 passes for 40 orders. | `test_audit_unfillableOrderDoesNotRefundFillable`, `test_audit_worstShortfallFirst`, `test_gas_worstCaseCascade` |
| 4 | Cap counts cancelled intents; one address can hold every slot | Fixed for cancelled intents (same fix as 1). No per-address cap: 40 open intents still fill a round, and the attacker pays gas and locks capital. A round still reverts `BatchFull` at 40 open intents. | `test_audit_roundStillFullWith40OpenIntents`, `test_audit_cancelFreesSlot` |
| 5 | Settle clears at spot, up to 50 bps from the TWAP | Accepted as a known limit. Clearing at the TWAP would let submitters arbitrage the lag between the TWAP and the market (brief 6.1). On the live pool the attack needs about 250k MUSD of capital and about 200 MUSD of fees, and pays only above roughly 41k MUSD of the attacker's own matched volume. Users' minimums cap the loss. | none (design) |

Gas of the longest cascade (40 orders, 41 passes): about 4.16M for `settle` on the mock pool; `BatchSettler.clear` alone is about 2.86M against the live pool (fork test `testFork_worstCaseCascade_clearGas`). Both are under 5M.

## Leads to verify on testnet

- BTC precompile `transfer` return data: `_push` accepts an empty return and a bool return. A non-bool 32-byte word would revert settle and expire.
- The live price feed called without a mock (the fork tests mock it).
- Worst-case clearing gas on the real pool, measured end to end through `settle`.
- The 0.01 BTC TWAP probe on shallow pools: below about 2 BTC of reserve its own price impact exceeds 50 bps and settle reverts.
- The guard does not check the age of the TWAP.
