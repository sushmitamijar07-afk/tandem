// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title Batch Swap shared types (file-level, FROZEN in P1)
/// @notice Imported by IIntentBook, IBatchSettler and the implementations. See docs/SPEC.md.

/// @notice SellBtc: BTC in -> MUSD out. SellMusd: MUSD in -> BTC out.
enum Side {
    SellBtc,
    SellMusd
}

/// @notice None = id never existed. Cancelled, Filled and Refunded are terminal.
enum IntentStatus {
    None,
    Open,
    Cancelled,
    Filled,
    Refunded
}

/// @notice "Open" in storage also covers closed-but-not-yet-settled (and never-touched) rounds.
///         The phase (open / closed / expirable) is derived from batchTimes(). Settled and Expired are terminal.
enum BatchStatus {
    Open,
    Settled,
    Expired
}

/// @notice Why an intent was refunded in full.
enum RefundReason {
    MinOutNotMet,
    Expired
}

/// @notice One swap request. Packed into 3 slots.
struct Intent {
    address owner; // who gets paid
    uint64 batchId; // round it belongs to
    Side side;
    IntentStatus status;
    uint128 amountIn; // tokenIn escrowed (BTC: wei of native BTC; MUSD: wei)
    uint128 minOut; // least tokenOut accepted; > 0 enforced
    uint128 amountOut; // tokenOut paid on fill
    uint128 refundIn; // tokenIn returned (full refund, or a share of an unroutable remainder)
}

/// @notice Result of one round. Prices are MUSD per 1 BTC, 1e18-scaled.
/// @dev totalBtcIn / totalMusdIn track live escrow while the round is Open (down on cancel) and are
///      FROZEN at settle/expire (they then equal the round's settled/refunded input). live is 0 once terminal.
struct Batch {
    BatchStatus status;
    uint32 count; // intents in the round's id array; a cancel removes its intent, so this counts non-cancelled intents
    uint32 live; // intents still Open
    uint128 totalBtcIn; // live BTC escrow (frozen once terminal)
    uint128 totalMusdIn; // live MUSD escrow (frozen once terminal)
    uint128 refPrice; // spot mid at settle (clearing price for the matched part)
    uint128 twapPrice;
    uint128 oraclePrice;
    uint128 priceBtcSide; // MUSD received per BTC by filled BTC sellers
    uint128 priceMusdSide; // MUSD paid per BTC by filled MUSD sellers
    uint128 routedIn; // Router amountIn (0 if fully matched or unroutable)
    uint128 routedOut;
    bool routedBtc; // true: excess side was BTC (Router sold / would sell BTC for MUSD)
}
