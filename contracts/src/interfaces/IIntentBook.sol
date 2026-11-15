// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Side, IntentStatus, BatchStatus, RefundReason, Intent, Batch} from "./IBatchTypes.sol";
import {IPriceGuard} from "./IPriceGuard.sol";
import {IBatchSettler} from "./IBatchSettler.sol";

/// @title IIntentBook (FROZEN in P1)
/// @notice Escrow, rounds, settle and payouts for MUSD<->BTC batch swaps on Mezo. The only contract that holds
///         or moves funds. Owner (Ownable2Step) can only pause new submits. See docs/SPEC.md.
/// @dev constructor(address musd, address btc, address router, address factory, address pool,
///        IPriceGuard guard, IBatchSettler settler, uint64 startTime, uint32 batchDuration /*[30,3600]*/,
///        uint32 settleTimeout /*[600,86400]*/, uint16 maxIntents /*[2,64]*/, uint128 minMusdIn, uint128 minBtcIn,
///        address owner)
///      Checks: no zero addresses (ZeroAddress); bounds and startTime/min sizes (InvalidParam);
///      IMezoRouter(router).poolFor(musd, btc, false, factory) == pool (InvalidParam("pool"));
///      guard.POOL()==pool && guard.MUSD()==musd && guard.BTC()==btc (InvalidParam("guard"));
///      settler.POOL()==pool && settler.MUSD()==musd && settler.BTC()==btc (InvalidParam("settler")).
interface IIntentBook {
    // ------------------------------------------------------------------ events
    event IntentSubmitted(
        uint256 indexed intentId,
        uint256 indexed batchId,
        address indexed owner,
        Side side,
        uint256 amountIn,
        uint256 minOut
    );
    event IntentCancelled(uint256 indexed intentId, uint256 indexed batchId, address indexed owner);
    event IntentFilled(
        uint256 indexed intentId, uint256 indexed batchId, address indexed owner, uint256 amountOut, uint256 refundIn
    );
    event IntentRefunded(
        uint256 indexed intentId, uint256 indexed batchId, address indexed owner, uint256 amountIn, RefundReason reason
    );
    event BatchSettled(
        uint256 indexed batchId,
        address indexed settler,
        uint256 refPrice,
        uint256 twapPrice,
        uint256 oraclePrice,
        uint256 reserveMusd,
        uint256 reserveBtc,
        uint256 feeBps,
        bool routedBtc,
        uint256 routedIn,
        uint256 routedOut,
        uint256 priceBtcSide,
        uint256 priceMusdSide,
        uint256 rounds
    );
    event BatchExpired(uint256 indexed batchId, address indexed caller);
    event PayoutDeferred(address indexed to, address indexed token, uint256 amount);
    event Claimed(address indexed to, address indexed token, uint256 amount);
    event PausedSet(bool paused);

    // ------------------------------------------------------------------ errors
    error ZeroAddress();
    error InvalidParam(bytes32 which);
    error NotStarted(uint256 startTime);
    error SubmitsPaused();
    error BelowMinimum(uint256 amountIn, uint256 minimum);
    error ZeroMinOut();
    error AmountTooLarge(); // amountIn or minOut > uint128, or a round total would exceed uint128
    error ValueMismatch(); // msg.value != 0 on the MUSD path
    error BatchFull(uint256 batchId, uint256 max);
    error NotIntentOwner();
    error IntentNotOpen(IntentStatus status);
    error BatchClosed(uint256 batchId, uint256 closedAt);
    error BatchNotClosed(uint256 batchId, uint256 closesAt);
    error BatchNotOpen(BatchStatus status);
    error SettleWindowNotOver(uint256 batchId, uint256 expiresAt);
    error SettleWindowOver(uint256 batchId, uint256 expiredAt); // call expire()
    error PoolPaused();
    error RouterOutMismatch(uint256 expected, uint256 received);
    error Conservation(address token);
    error NothingToClaim();

    // ------------------------------------------------------------------ user actions
    /// @notice Sell native BTC (amountIn = msg.value) for MUSD in the current round. One tx, no approval.
    function submitSellBtc(uint256 minMusdOut) external payable returns (uint256 intentId);

    /// @notice Sell MUSD for BTC in the current round. Needs MUSD.approve(this, amountIn) first.
    function submitSellMusd(uint256 amountIn, uint256 minBtcOut) external returns (uint256 intentId);

    /// @notice Owner only, and only while the round is still open (now < closeTime). Full refund, pushed.
    function cancel(uint256 intentId) external;

    /// @notice Permissionless once now >= closeTime and before closeTime + SETTLE_TIMEOUT.
    function settle(uint256 batchId) external;

    /// @notice Permissionless once now >= closeTime + SETTLE_TIMEOUT on an unsettled round: refunds everyone.
    function expire(uint256 batchId) external;

    /// @notice Pull any payout whose push failed.
    function claim(address token) external returns (uint256 amount);

    // ------------------------------------------------------------------ owner (Ownable2Step)
    /// @notice ONLY owner power. Blocks new submits, nothing else.
    function setPaused(bool paused) external;

    // ------------------------------------------------------------------ views
    /// @notice (block.timestamp - START) / DURATION; 0 before START.
    function currentBatchId() external view returns (uint256);

    /// @notice Pure arithmetic for any batchId <= type(uint64).max (else InvalidParam("batchId")).
    function batchTimes(uint256 batchId) external view returns (uint256 openAt, uint256 closeAt, uint256 expireAt);

    /// @notice Zero struct (status Open) for a never-touched round.
    function getBatch(uint256 batchId) external view returns (Batch memory);

    /// @notice Zero struct (status None) for intentId == 0 or > total intents.
    function getIntent(uint256 intentId) external view returns (Intent memory);

    /// @notice Every intent ever added to the round, in submit order (cancelled ones included).
    function batchIntentIds(uint256 batchId) external view returns (uint256[] memory);

    /// @notice Every intent ever submitted by owner, in submit order.
    function intentsOf(address owner) external view returns (uint256[] memory);

    function claimable(address owner, address token) external view returns (uint256);

    /// @notice What settle() would do right now, ignoring the time window. Reverts BatchNotOpen if terminal,
    ///         and with the same guard / PoolPaused errors settle() would. Empty round: all-zero structs, no reads.
    function preview(uint256 batchId) external view returns (IBatchSettler.Clearing memory, IPriceGuard.Prices memory);

    /// @notice Live Open escrow of token (MUSD or BTC).
    function escrowed(address token) external view returns (uint256);

    function totalClaimable(address token) external view returns (uint256);

    // ------------------------------------------------------------------ immutables / state getters
    function MUSD() external view returns (address);
    function BTC() external view returns (address);
    function ROUTER() external view returns (address);
    function FACTORY() external view returns (address);
    function POOL() external view returns (address);
    function GUARD() external view returns (IPriceGuard);
    function SETTLER() external view returns (IBatchSettler);
    function START() external view returns (uint64);
    function DURATION() external view returns (uint32);
    function SETTLE_TIMEOUT() external view returns (uint32);
    function MAX_INTENTS() external view returns (uint16);
    function MIN_MUSD_IN() external view returns (uint128);
    function MIN_BTC_IN() external view returns (uint128);
    function paused() external view returns (bool);
    function intentCount() external view returns (uint256);
}
