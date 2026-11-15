# Batch Swap — implementation spec (FROZEN after P1)

Source of truth, in order: **this file** → frozen interfaces (`contracts/src/interfaces/*.sol`, `contracts/src/external/*.sol`, `web/lib/contracts.ts`) → `docs/BUILD_PROMPT.md` (the brief) → `docs/FACTS.md`. Where this file and the brief disagree, this file wins. "Brief §x" means the project brief in `docs/BUILD_PROMPT.md` (starts at line 416); "shared §x" means the shared part (lines 1–412).

## 1. Contracts

| Contract | Holds funds | Owner | Responsibility | Interface |
|---|---|---|---|---|
| `PriceGuard` | no | none | Reads pool spot, pool TWAP (`quote`), factory fee, PriceFeed. `read()` never reverts on bands; `checked()` enforces them. | `IPriceGuard.sol` |
| `BatchSettler` | no | none | Pure clearing engine (brief §5.2 + D10–D17). Only external call: `pool.getAmountOut`. | `IBatchSettler.sol` |
| `IntentBook` | **yes, all of it** | Ownable2Step, `setPaused` only | Rounds, escrow, cancel, settle (Router leg), expire, push payouts with `claimable` fallback. | `IIntentBook.sol` |

Mezo calls (exact signatures in `contracts/src/external/`, copied from Appendix A): brief §2 table. Mezo addresses: shared §3.1 only. IntentBook inherits `Ownable2Step`, `ReentrancyGuard` (OZ 5); uses `SafeERC20`, `SafeCast`, `Math`. Deploy order: PriceGuard → BatchSettler → IntentBook (brief §11.3).

Where to read the algorithms: round timing brief §5.1 (l.717) · clearing §5.2 (l.725) · settle §5.3 (l.761) · other functions §5.4 (l.795) · PriceGuard §5.5 (l.805) · worked numbers §6 (l.820) · edge cases §7 (l.890) · invariants + handler §8 (l.917) · threats §9 (l.938) · tests §10 (l.960) · params §11.2 (l.1013) · frontend §13 (l.1085).

## 2. Parameters (testnet deploy)

`batchDuration` 120 · `settleTimeout` 7200 · `maxIntents` 40 · `minMusdIn` 10e18 · `minBtcIn` 1e14 · `granularity` 2 · `maxSpotTwapBps` 50 · `oracleBandBps` = `min(3000, gapBps + 400)` re-measured right before deploy (FACTS.md: gap 1,714 → **2,114**; stop if gap > 2,600) · `startTime` = deploy time rounded up to the next minute · `owner` = deployer.

## 3. Decisions (resolve every ambiguity in the brief)

**Math and rounding**

1. **All `a*b/c` use OZ `Math.mulDiv` (floor)** unless stated. Results equal the brief's naive formulas wherever those don't overflow; mulDiv just removes overflow (e.g. `Sb*P` with 64 × uint128 inputs).
2. **PriceGuard prices:** `spot = mulDiv(r0, 1e18, r1)` (0 if `r1 == 0`); `twap = mulDiv(pool.quote(BTC, PROBE, G), 1e18, PROBE)` (= quote × 100). `spotTwapBps = mulDiv(|spot−twap|, 1e4, twap, Ceil)`, `type(uint256).max` if `spot == 0 || twap == 0`. `twapOracleBps = mulDiv(|twap−oracle|, 1e4, oracle, Ceil)`, `type(uint256).max` if `oracle == 0`. `feeBps = factory.getFee(pool, false)`.
3. **`checked()` order:** `SpotTwapDeviation` if `spotTwapBps > MAX_SPOT_TWAP_BPS` → `OracleUnavailable` if `oracle == 0` → `OracleDeviation` if `twapOracleBps > ORACLE_BAND_BPS`. Equality passes.
4. **Oracle read:** `try IPriceFeedLike(PRICE_SOURCE).fetchPrice() returns (uint256 o) { oracle = o; } catch { oracle = 0; }` inside the view.
5. **uint128 downcasts:** submit reverts `AmountTooLarge` if `amountIn > type(uint128).max`, `minOut > type(uint128).max`, or the new `Batch.totalBtcIn/totalMusdIn` would exceed uint128. Every other downcast in settle (prices, routed amounts, `amountOut`, `refundIn`) uses `SafeCast.toUint128` (unreachable in practice).

**Identifiers and timing**

6. **`intentId = index + 1`** in `Intent[] intents`; id 0 never exists. `getIntent(0 or > length)` returns a zero struct (status `None`). `cancel` on such an id reverts `IntentNotOpen(None)` (checked before the owner check). `intentCount()` = `intents.length`.
7. **Batch ids are 0-based:** round 0 opens at `START`. The web must not treat id 0 as "none".
8. **`currentBatchId()` before `START` returns 0.** `batchTimes(id)` is pure arithmetic (brief §5.1) for any id ≤ `type(uint64).max`; larger ids revert `InvalidParam("batchId")` in `batchTimes`, `settle`, `expire`, `preview`.
9. **Untouched rounds:** `batches[id]` defaults to status `Open`, so `settle`/`expire` work on any past round, touched or not. `settle` on a round with `live == 0` (never used, or all cancelled) takes the empty path (D19). `expire` on a round with `live == 0` is allowed: marks it `Expired`, emits only `BatchExpired`. The current round can never be settled/expired (timing forbids it), so submits always land in an `Open` round.

**Clearing (`BatchSettler.clear`) — brief §5.2 plus:**

10. `MAX_ORDERS = 64`; `n > 64` → `TooManyOrders(n, 64)`; `refPrice == 0` → `ZeroPrice()`. Orders are not validated (IntentBook guarantees `amountIn ≥ min`, `minOut > 0`).
11. **`rounds`** = loop iterations, including a final iteration that finds no active orders. Example 1 → 2. All orders failing in iteration 1 → 2. Empty input → 1 (IntentBook never passes empty).
12. **Branch:** `if (Sm > mulDiv(Sb, P, 1e18))` X = MUSD sellers, `routeBtc = false`; else X = BTC sellers, `routeBtc = true` (includes exact equality and `Sm == 0`). Y outputs: SellBtc `mulDiv(in, P, 1e18)`, SellMusd `mulDiv(in, 1e18, P)`. `net = S_X − Σ out_Y` (MUSD case `Sm − Σ out_j`, BTC case `Sb − Σ out_j`), tokenIn = X's token. `netOut = net > 0 ? pool.getAmountOut(net, tokenIn) : 0`.
13. **Routable:** if `netOut > 0`: `avail = S_Y + netOut`, `refundShare = 0`, `Clearing.routeIn = net`, `routeOut = netOut`. **Unroutable dust** (`net > 0 && netOut == 0`) or `net == 0`: `avail = S_Y`, X `refundShare_i = mulDiv(in_i, net, S_X)`, and **`Clearing.routeIn = routeOut = 0`** (no Router call; the net is returned through `refundIn`). Hence `routeIn > 0 ⇔ routeOut > 0`. X outputs `out_i = mulDiv(in_i, avail, S_X)`. MinOut is checked on `out_i` only (refundShare is not counted).
14. **Failures:** `failed = {k : out_k < minOut_k}` across both sides; remove all at once. Removed orders → `Fill{filled:false, amountOut:0, refundIn: amountIn}`.
15. **Final state:** Clearing fields come from the last iteration that had active orders. If the loop ends with none active: `routeBtc=false`, `routeIn=routeOut=0`, both side prices 0.
16. **Side prices** (informational, never used for payouts): the **Y side price is exactly `refPrice`** (every Y fill got `floor(in·P)`); the X side price is BTC sellers `mulDiv(Σout, 1e18, Σ(in−refundIn))` (floor) or MUSD sellers `mulDiv(Σ(in−refundIn), 1e18, Σout, Ceil)` (ceil; 0 if `Σout == 0`). A side with no filled order → 0. Rounding is chosen so the displayed price is never better for the user than reality.
17. **I3/I4 are checked per intent, not from the stored price:** Y fill `amountOut == mid formula` exactly; X fill `amountOut ≤ mid formula(in − refundIn)` and `amountOut == mulDiv(in, avail, S_X)` (handler recomputes `avail`/`S_X` as ghosts).

**Post-audit changes (2026-11-15):** (a) `cancel` removes the intent from its round (swap-and-pop) and lowers `Batch.count`, so the cap counts non-cancelled intents and "live intents in submit order" may be reordered after a cancel (fills are mapped by id); (b) `clear` removes one failing order per pass (largest shortfall relative to its minimum, ties lowest index) instead of all at once, so D11 `rounds` can reach n+1 and D14's "remove all at once" no longer applies.

**Settle (`IntentBook.settle`, nonReentrant) — brief §5.3 plus:**

18. **Check order:** `InvalidParam("batchId")` → `BatchNotOpen(status)` → `BatchNotClosed(id, closeAt)` if `now < closeAt` → `SettleWindowOver(id, expireAt)` if `now ≥ expireAt`. Orders = `batchIds[id]` filtered to status `Open`, in submit order; `Order.id = intentId`.
19. **Empty round** (`live == 0`): status `Settled`; no guard/settler/factory/pool reads; emit `BatchSettled(id, msg.sender, 0,0,0,0,0,0, false, 0,0, 0,0, 0)` (all numbers 0, `rounds = 0`). Stored Batch price/route fields stay 0.
20. **Shared planner:** `settle` and `preview` use one internal view `_plan(id)` → `(orders, Clearing c, Prices p)`: `p = GUARD.checked()`; `c = SETTLER.clear(orders, p.spot)`; `if (c.routeIn > 0 && IMezoPoolFactory(FACTORY).isPaused()) revert PoolPaused()`.
21. **Effects** (before any external write): per fill set status/`amountOut`/`refundIn` (Refunded: `refundIn = amountIn`, `amountOut = 0`); `escrowed[MUSD] −= totalMusdIn`, `escrowed[BTC] −= totalBtcIn`; Batch: `status=Settled`, `live=0`, `refPrice=p.spot`, `twapPrice=p.twap`, `oraclePrice=p.oracle`, side prices, `routedBtc=c.routeBtc`, `routedIn=c.routeIn`, `routedOut=c.routeOut` (overwritten with `got`, D22). **`totalBtcIn`/`totalMusdIn` are frozen** (not zeroed) — they are the round's input for I5 and the UI.
22. **Router leg** iff `c.routeIn > 0`: `forceApprove(ROUTER, routeIn)` on tokenIn (BTC = precompile ERC-20); `before = tokenOut.balanceOf(this)`; `swapExactTokensForTokens(c.routeIn, c.routeOut, [Route(tokenIn, tokenOut, false, FACTORY)], address(this), block.timestamp)`; `got = balanceOf − before`; `got < c.routeOut` → `RouterOutMismatch(c.routeOut, got)`. Store and emit `routedOut = got`; any `got − routeOut` stays as excess (counted as dust for I7).
23. **Conservation** (after the Router leg, before pushes), per token T ∈ {MUSD, BTC}: `Σ amountOut where tokenOut(intent)==T + Σ refundIn where tokenIn(intent)==T + (c.routeIn if T == route tokenIn) ≤ totalIn_T + (got if T == route tokenOut)`, where `totalIn_T` = frozen `totalMusdIn`/`totalBtcIn`. Breach → `Conservation(T)`. Pure arithmetic on the fills; no extra `balanceOf` reads.
24. **Payout + event order:** for each fill in order: `_push(tokenOut, owner, amountOut)`, `_push(tokenIn, owner, refundIn)` (PayoutDeferred, if any, is emitted inside `_push`), then `IntentFilled(id, batchId, owner, amountOut, refundIn)` or `IntentRefunded(id, batchId, owner, amountIn, MinOutNotMet)`. **`BatchSettled` is emitted last**, with `reserveMusd/reserveBtc/feeBps` from `p` and `rounds = c.rounds`. `_push` is exactly brief §5.3 (low-level `transfer`, zero amount = no-op, failure → `claimable`).

**Other functions**

25. **Submit check order:** `SubmitsPaused` → `NotStarted(START)` if `now < START` → (MUSD path) `ValueMismatch` if `msg.value != 0` → `BelowMinimum(amountIn, min)` → `AmountTooLarge` → `ZeroMinOut` → `BatchFull(id, MAX_INTENTS)` if `count ≥ MAX_INTENTS`. `batchId = currentBatchId()`. Effects: push Intent{status Open}, `batchIds`, `userIds`, `count++`, `live++`, total += amountIn, `escrowed += amountIn`. MUSD path then `safeTransferFrom` and requires the balance delta `== amountIn` (else `Conservation(MUSD)`). `IntentSubmitted` emitted last.
26. **Cancel:** `IntentNotOpen(status)` (covers unknown id, D6) → `NotIntentOwner` → `BatchClosed(batchId, closeAt)` if `now ≥ closeAt`. Effects: `Cancelled`, `refundIn = amountIn`, totals/`live`/escrow down. Then `_push(tokenIn, owner, amountIn)`, then `IntentCancelled`. Works while paused.
27. **Expire:** `InvalidParam("batchId")` → `BatchNotOpen(status)` → `SettleWindowNotOver(id, expireAt)` if `now < expireAt`. Effects: every Open intent → `Refunded`, `refundIn = amountIn`; escrow down by the totals; Batch `status=Expired`, `live=0`, totals frozen. Then per intent `_push` + `IntentRefunded(…, Expired)`; `BatchExpired(id, msg.sender)` last.
28. **Claim:** `NothingToClaim` if 0; zero it, `totalClaimable −= amt`, `safeTransfer` (BTC via the precompile ERC-20), emit `Claimed`. Any token address is accepted (non-MUSD/BTC simply has 0).
29. **`preview(id)`:** `InvalidParam("batchId")` → `BatchNotOpen` if terminal → **no time checks** (the UI calls it during an open round for "Matched if settled now") → if `live == 0` return two zero structs with no external reads → else `_plan(id)` (reverts with the guard errors / `PoolPaused` exactly as settle). The UI shows prices from `GUARD.read()`, never from preview.
30. **`setPaused(bool)`:** `onlyOwner`, sets `paused`, emits `PausedSet` (even if unchanged). OZ `renounceOwnership` is kept (renouncing just freezes the pause flag).
31. **Constructor errors:** IntentBook zero address → `ZeroAddress()`; bounds → `InvalidParam("batchDuration"|"settleTimeout"|"maxIntents"|"minMusdIn"|"minBtcIn"|"startTime")`; `startTime` must be `> 0` and `≤ block.timestamp + 30 days` (past values allowed so a slow broadcast can't brick the deploy); `poolFor` mismatch → `InvalidParam("pool")`; guard/settler POOL/MUSD/BTC mismatch → `InvalidParam("guard")` / `InvalidParam("settler")`. PriceGuard: `InvalidParam(<arg name>)` for zero/bounds, `BadPool()` for token order / stable / decimals. BatchSettler: `ZeroAddress()`.
32. **No `receive()`/`fallback()`** on IntentBook. Direct sends that do arrive (precompile transfer, MUSD transfer) are unwithdrawable excess (brief §7 #19).

**Interface additions to brief §4** (needed by the web and tests; everything else is verbatim):

33. `IIntentBook`: getters `MUSD, BTC, ROUTER, FACTORY, POOL, GUARD, SETTLER, START (uint64), DURATION (uint32), SETTLE_TIMEOUT (uint32), MAX_INTENTS (uint16), MIN_MUSD_IN (uint128), MIN_BTC_IN (uint128), paused, intentCount`. `escrowed/claimable/totalClaimable/paused` may be implemented as `public` state. `IBatchSettler`: `MAX_ORDERS()` and `error ZeroAddress()`.
34. `web/lib/contracts.ts` `INTENT_BOOK_ABI` = IIntentBook + Ownable2Step + `SafeERC20FailedOperation`, `SafeCastOverflowedUintDowncast`, `ReentrancyGuardReentrantCall` + **all IPriceGuard and IBatchSettler errors** (they bubble through `settle`/`preview`). The P2b `pnpm abi` script must keep that merge.

**Web / honesty**

35. **"1-hour average" copy (brief §12, §13, §17) is not true** for this pool: G=2 spans ≥ 1 h but measured 4.3 h ending 5.9 h ago (brief §2, §5.5). Use **"pool average (TWAP)"** in place of "1-hour average", and show its real window from `observations(observationLength−3)` → `lastObservation()` as "over X h, ending Y h ago". Same fix in the video voiceover (docs/DEMO.md) and SUBMISSION ("the pool's TWAP").
36. The testnet sentence and the oracle-band figure are always computed live (`twapOracleBps`, `ORACLE_BAND_BPS`); "15.65%" / "20%" in brief §13 are examples (today: 17.14% / 21.14%).
37. `USE_MOCKS` = `NEXT_PUBLIC_USE_MOCKS === "1"` and not Vercel production (`NEXT_PUBLIC_VERCEL_ENV !== "production"`).
38. Round phase in the UI: `status` from `getBatch`, times from `batchTimes`: Open & `now < closeAt` → open; Open & `closeAt ≤ now < expireAt` → closed/ready (or "empty" if `live == 0`); Open & `now ≥ expireAt` → "Refund everyone" (`expire`); Settled/Expired → results.

**Scripts**

39. **`Demo.s.sol` runs in phases** (a forge script can't wait for a round to close between broadcasts), selected by env `PHASE`: `fund` (`W2_KEY`: `openTrove{value: 0.12 BTC}(4000e18, address(0), address(0))`, then 1,000 MUSD → `W3_ADDR`), `submit` (`W1_KEY`/`W2_KEY`/`W3_KEY`: A sells 0.05 BTC min 3,880e18; B approves + sells 3,000e18 min 0.038e18; C approves + sells 1,000e18 min 0.0128e18; refuses if `closeAt − now < 60 s`, printing "wait for the next round"; prints the batch id), `settle` (`BATCH_ID`, `PRIVATE_KEY`). Steps are in docs/DEMO.md. Each prints every tx hash. Always run with `--skip-simulation --gas-estimate-multiplier 150` (precompiles).
40. `Deploy.s.sol` refuses to overwrite `deployments/31611.json` unless `FORCE=1`; writes `{ "PriceGuard", "BatchSettler", "IntentBook", "deployBlock", "oracleBandBps", "gapBps" }`.

## 4. Invariants and tests

Exactly brief §8 (I1–I9, handler) and §10 (≥ 54 named tests, mocks in §10.1, fork setup in §10.3), interpreted with D11–D17, D19, D21–D24. Extra required tests: `test_preview_openRoundNoTimeCheck`, `test_settle_untouchedPastRound_empty`, `test_expire_emptyRound`, `test_cancel_unknownId_IntentNotOpen`, `test_currentBatchId_beforeStart_zero`.

## 5. Known limits (to README / SECURITY)

≤ 64 wei per token per round of rounding dust stays in the book; direct donations are unwithdrawable; no fee; one pair; TWAP lags on quiet testnet pool; oracle band wide on testnet (≈21%), mainnet ≈ 3%.
