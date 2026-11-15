// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {Side, IntentStatus, BatchStatus, RefundReason, Intent, Batch} from "./interfaces/IBatchTypes.sol";
import {IIntentBook} from "./interfaces/IIntentBook.sol";
import {IPriceGuard} from "./interfaces/IPriceGuard.sol";
import {IBatchSettler} from "./interfaces/IBatchSettler.sol";
import {IMezoRouter} from "./external/IMezoRouter.sol";
import {IMezoPoolFactory} from "./external/IMezoPoolFactory.sol";

/// @title IntentBook
/// @notice Escrow, rounds, settle, expire and payouts for MUSD<->BTC batch swaps on Mezo. Holds all funds. The only
///         owner power is `setPaused` (blocks new submits). No `receive()`. See docs/SPEC.md.
contract IntentBook is IIntentBook, Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using SafeCast for uint256;

    address public immutable MUSD;
    address public immutable BTC;
    address public immutable ROUTER;
    address public immutable FACTORY;
    address public immutable POOL;
    IPriceGuard public immutable GUARD;
    IBatchSettler public immutable SETTLER;
    uint64 public immutable START;
    uint32 public immutable DURATION;
    uint32 public immutable SETTLE_TIMEOUT;
    uint16 public immutable MAX_INTENTS;
    uint128 public immutable MIN_MUSD_IN;
    uint128 public immutable MIN_BTC_IN;

    Intent[] internal intents;
    mapping(uint256 => Batch) internal batches;
    mapping(uint256 => uint256[]) internal batchIds;
    mapping(address => uint256[]) internal userIds;

    mapping(address => uint256) public escrowed;
    mapping(address => mapping(address => uint256)) public claimable;
    mapping(address => uint256) public totalClaimable;
    bool public paused;

    /// @dev Constructor arguments as one static struct. A static struct is ABI-encoded exactly like its members
    ///      concatenated, so the wire format equals the flat 14-argument constructor documented in IIntentBook
    ///      (`cast abi-encode "constructor(address,...,address)"` works unchanged). It exists only because the ABI
    ///      decoder of 14 flat arguments overflows the stack with via_ir = false.
    struct Params {
        address musd;
        address btc;
        address router;
        address factory;
        address pool;
        address guard;
        address settler;
        uint64 startTime;
        uint32 batchDuration;
        uint32 settleTimeout;
        uint16 maxIntents;
        uint128 minMusdIn;
        uint128 minBtcIn;
        address owner;
    }

    constructor(Params memory a) Ownable(_nz(a.owner)) {
        MUSD = _nz(a.musd);
        BTC = _nz(a.btc);
        ROUTER = _nz(a.router);
        FACTORY = _nz(a.factory);
        POOL = _nz(a.pool);
        GUARD = IPriceGuard(_nz(a.guard));
        SETTLER = IBatchSettler(_nz(a.settler));
        if (a.batchDuration < 30 || a.batchDuration > 3600) revert InvalidParam("batchDuration");
        if (a.settleTimeout < 600 || a.settleTimeout > 86400) revert InvalidParam("settleTimeout");
        if (a.maxIntents < 2 || a.maxIntents > 64) revert InvalidParam("maxIntents");
        if (a.minMusdIn == 0) revert InvalidParam("minMusdIn");
        if (a.minBtcIn == 0) revert InvalidParam("minBtcIn");
        if (a.startTime == 0 || a.startTime > block.timestamp + 30 days) revert InvalidParam("startTime");
        START = a.startTime;
        DURATION = a.batchDuration;
        SETTLE_TIMEOUT = a.settleTimeout;
        MAX_INTENTS = a.maxIntents;
        MIN_MUSD_IN = a.minMusdIn;
        MIN_BTC_IN = a.minBtcIn;
        _checkWiring(a.musd, a.btc, a.router, a.factory, a.pool, IPriceGuard(a.guard), IBatchSettler(a.settler));
    }

    function _nz(address a) private pure returns (address) {
        if (a == address(0)) revert ZeroAddress();
        return a;
    }

    function _checkWiring(
        address musd,
        address btc,
        address router,
        address factory,
        address pool,
        IPriceGuard guard,
        IBatchSettler settler
    ) private view {
        if (IMezoRouter(router).poolFor(musd, btc, false, factory) != pool) {
            revert InvalidParam("pool");
        }
        if (guard.POOL() != pool || guard.MUSD() != musd || guard.BTC() != btc) revert InvalidParam("guard");
        if (settler.POOL() != pool || settler.MUSD() != musd || settler.BTC() != btc) revert InvalidParam("settler");
    }

    // ------------------------------------------------------------------ user actions

    /// @inheritdoc IIntentBook
    function submitSellBtc(uint256 minMusdOut) external payable nonReentrant returns (uint256 intentId) {
        intentId = _submit(Side.SellBtc, msg.value, minMusdOut);
    }

    /// @inheritdoc IIntentBook
    function submitSellMusd(uint256 amountIn, uint256 minBtcOut) external nonReentrant returns (uint256 intentId) {
        // Non-payable (frozen interface): native value is rejected by the ABI dispatcher itself, so the
        // ValueMismatch error is declared but cannot be reached on this path.
        intentId = _submit(Side.SellMusd, amountIn, minBtcOut);
    }

    function _submit(Side side, uint256 amountIn, uint256 minOut) internal returns (uint256 intentId) {
        if (paused) revert SubmitsPaused();
        if (block.timestamp < START) revert NotStarted(START);
        uint256 min = side == Side.SellBtc ? MIN_BTC_IN : MIN_MUSD_IN;
        if (amountIn < min) revert BelowMinimum(amountIn, min);
        if (amountIn > type(uint128).max || minOut > type(uint128).max) revert AmountTooLarge();
        uint256 batchId = currentBatchId();
        Batch storage b = batches[batchId];
        if (side == Side.SellBtc) {
            if (uint256(b.totalBtcIn) + amountIn > type(uint128).max) revert AmountTooLarge();
        } else {
            if (uint256(b.totalMusdIn) + amountIn > type(uint128).max) revert AmountTooLarge();
        }
        if (minOut == 0) revert ZeroMinOut();
        if (b.count >= MAX_INTENTS) revert BatchFull(batchId, MAX_INTENTS);

        // effects
        intents.push(
            Intent({
                owner: msg.sender,
                batchId: uint64(batchId),
                side: side,
                status: IntentStatus.Open,
                amountIn: uint128(amountIn),
                minOut: uint128(minOut),
                amountOut: 0,
                refundIn: 0
            })
        );
        intentId = intents.length;
        batchIds[batchId].push(intentId);
        userIds[msg.sender].push(intentId);
        b.count += 1;
        b.live += 1;
        if (side == Side.SellBtc) {
            b.totalBtcIn += uint128(amountIn);
            escrowed[BTC] += amountIn;
        } else {
            b.totalMusdIn += uint128(amountIn);
            escrowed[MUSD] += amountIn;
        }

        // interactions
        if (side == Side.SellMusd) {
            uint256 before = IERC20(MUSD).balanceOf(address(this));
            IERC20(MUSD).safeTransferFrom(msg.sender, address(this), amountIn);
            if (IERC20(MUSD).balanceOf(address(this)) - before != amountIn) revert Conservation(MUSD);
        }
        emit IntentSubmitted(intentId, batchId, msg.sender, side, amountIn, minOut);
    }

    /// @inheritdoc IIntentBook
    function cancel(uint256 intentId) external nonReentrant {
        if (intentId == 0 || intentId > intents.length) revert IntentNotOpen(IntentStatus.None);
        Intent storage it = intents[intentId - 1];
        if (it.status != IntentStatus.Open) revert IntentNotOpen(it.status);
        if (it.owner != msg.sender) revert NotIntentOwner();
        (, uint256 closeAt,) = batchTimes(it.batchId);
        if (block.timestamp >= closeAt) revert BatchClosed(it.batchId, closeAt);

        Batch storage b = batches[it.batchId];
        it.status = IntentStatus.Cancelled;
        it.refundIn = it.amountIn;
        b.live -= 1;
        _freeSlot(it.batchId, intentId, b);
        address tokenIn;
        if (it.side == Side.SellBtc) {
            tokenIn = BTC;
            b.totalBtcIn -= it.amountIn;
        } else {
            tokenIn = MUSD;
            b.totalMusdIn -= it.amountIn;
        }
        escrowed[tokenIn] -= it.amountIn;

        _push(tokenIn, msg.sender, it.amountIn);
        emit IntentCancelled(intentId, it.batchId, msg.sender);
    }

    /// @dev Remove a cancelled intent from its round (swap-and-pop) so `count` equals the id array length and the
    ///      cap counts only intents that are not cancelled. History stays in `intents` and `userIds`.
    function _freeSlot(uint256 batchId, uint256 intentId, Batch storage b) private {
        uint256[] storage ids = batchIds[batchId];
        uint256 len = ids.length;
        for (uint256 i; i < len; ++i) {
            if (ids[i] == intentId) {
                ids[i] = ids[len - 1];
                ids.pop();
                break;
            }
        }
        b.count -= 1;
    }

    // ------------------------------------------------------------------ settle

    struct Totals {
        uint256 outMusd;
        uint256 outBtc;
        uint256 refMusd;
        uint256 refBtc;
    }

    /// @inheritdoc IIntentBook
    function settle(uint256 batchId) external nonReentrant {
        (, uint256 closeAt, uint256 expireAt) = batchTimes(batchId);
        Batch storage b = batches[batchId];
        if (b.status != BatchStatus.Open) revert BatchNotOpen(b.status);
        if (block.timestamp < closeAt) revert BatchNotClosed(batchId, closeAt);
        if (block.timestamp >= expireAt) revert SettleWindowOver(batchId, expireAt);

        if (b.live == 0) {
            b.status = BatchStatus.Settled;
            emit BatchSettled(batchId, msg.sender, 0, 0, 0, 0, 0, 0, false, 0, 0, 0, 0, 0);
            return;
        }

        (, IBatchSettler.Clearing memory c, IPriceGuard.Prices memory p) = _plan(batchId);

        // ---- effects
        _applyFills(c);
        escrowed[MUSD] -= b.totalMusdIn;
        escrowed[BTC] -= b.totalBtcIn;
        b.status = BatchStatus.Settled;
        b.live = 0;
        b.refPrice = p.spot.toUint128();
        b.twapPrice = p.twap.toUint128();
        b.oraclePrice = p.oracle.toUint128();
        b.priceBtcSide = c.priceBtcSide.toUint128();
        b.priceMusdSide = c.priceMusdSide.toUint128();
        b.routedBtc = c.routeBtc;
        b.routedIn = c.routeIn.toUint128();

        // ---- interactions: the one Router leg
        uint256 got;
        if (c.routeIn > 0) {
            got = _route(c);
        }
        b.routedOut = got.toUint128();

        _checkConservation(c, b, got);

        // ---- payouts
        _payout(c, batchId);

        _emitSettled(batchId, p, c, got);
    }

    /// @dev BatchSettled has 14 arguments; the stock ABI encoder runs out of stack without via_ir, so the 12
    ///      data words are staged in memory and logged by hand. Layout equals the declared event exactly.
    function _emitSettled(uint256 batchId, IPriceGuard.Prices memory p, IBatchSettler.Clearing memory c, uint256 got)
        private
    {
        uint256[12] memory d;
        d[0] = p.spot;
        d[1] = p.twap;
        d[2] = p.oracle;
        d[3] = p.reserveMusd;
        d[4] = p.reserveBtc;
        d[5] = p.feeBps;
        d[6] = c.routeBtc ? 1 : 0;
        d[7] = c.routeIn;
        d[8] = got;
        d[9] = c.priceBtcSide;
        d[10] = c.priceMusdSide;
        d[11] = c.rounds;
        bytes32 sig = BatchSettled.selector;
        address settler = msg.sender;
        assembly ("memory-safe") {
            log3(d, 384, sig, batchId, settler)
        }
    }

    function _applyFills(IBatchSettler.Clearing memory c) private {
        for (uint256 i; i < c.fills.length; ++i) {
            IBatchSettler.Fill memory f = c.fills[i];
            Intent storage it = intents[f.id - 1];
            if (f.filled) {
                it.status = IntentStatus.Filled;
                it.amountOut = f.amountOut.toUint128();
                it.refundIn = f.refundIn.toUint128();
            } else {
                it.status = IntentStatus.Refunded;
                it.refundIn = it.amountIn;
            }
        }
    }

    function _route(IBatchSettler.Clearing memory c) private returns (uint256 got) {
        (address tokenIn, address tokenOut) = c.routeBtc ? (BTC, MUSD) : (MUSD, BTC);
        IERC20(tokenIn).forceApprove(ROUTER, c.routeIn);
        uint256 before = IERC20(tokenOut).balanceOf(address(this));
        IMezoRouter.Route[] memory routes = new IMezoRouter.Route[](1);
        routes[0] = IMezoRouter.Route({from: tokenIn, to: tokenOut, stable: false, factory: FACTORY});
        IMezoRouter(ROUTER).swapExactTokensForTokens(c.routeIn, c.routeOut, routes, address(this), block.timestamp);
        got = IERC20(tokenOut).balanceOf(address(this)) - before;
        if (got < c.routeOut) revert RouterOutMismatch(c.routeOut, got);
    }

    function _checkConservation(IBatchSettler.Clearing memory c, Batch storage b, uint256 got) private view {
        Totals memory t;
        for (uint256 i; i < c.fills.length; ++i) {
            IBatchSettler.Fill memory f = c.fills[i];
            Intent storage it = intents[f.id - 1];
            uint256 out = it.amountOut; // 0 for refunded
            uint256 ref = it.refundIn;
            if (it.side == Side.SellBtc) {
                t.outMusd += out;
                t.refBtc += ref;
            } else {
                t.outBtc += out;
                t.refMusd += ref;
            }
        }
        bool routed = c.routeIn > 0;
        uint256 musdUsed = t.outMusd + t.refMusd + ((routed && !c.routeBtc) ? c.routeIn : 0);
        uint256 musdHave = b.totalMusdIn + ((routed && c.routeBtc) ? got : 0);
        if (musdUsed > musdHave) revert Conservation(MUSD);
        uint256 btcUsed = t.outBtc + t.refBtc + ((routed && c.routeBtc) ? c.routeIn : 0);
        uint256 btcHave = b.totalBtcIn + ((routed && !c.routeBtc) ? got : 0);
        if (btcUsed > btcHave) revert Conservation(BTC);
    }

    function _payout(IBatchSettler.Clearing memory c, uint256 batchId) private {
        for (uint256 i; i < c.fills.length; ++i) {
            uint256 id = c.fills[i].id;
            Intent storage it = intents[id - 1];
            address tokenIn = it.side == Side.SellBtc ? BTC : MUSD;
            address tokenOut = it.side == Side.SellBtc ? MUSD : BTC;
            address to = it.owner;
            _push(tokenOut, to, it.amountOut);
            _push(tokenIn, to, it.refundIn);
            if (c.fills[i].filled) {
                emit IntentFilled(id, batchId, to, it.amountOut, it.refundIn);
            } else {
                emit IntentRefunded(id, batchId, to, it.amountIn, RefundReason.MinOutNotMet);
            }
        }
    }

    /// @inheritdoc IIntentBook
    function expire(uint256 batchId) external nonReentrant {
        (,, uint256 expireAt) = batchTimes(batchId);
        Batch storage b = batches[batchId];
        if (b.status != BatchStatus.Open) revert BatchNotOpen(b.status);
        if (block.timestamp < expireAt) revert SettleWindowNotOver(batchId, expireAt);

        uint256[] storage ids = batchIds[batchId];
        uint256 len = ids.length;
        for (uint256 i; i < len; ++i) {
            Intent storage it = intents[ids[i] - 1];
            if (it.status == IntentStatus.Open) {
                it.status = IntentStatus.Refunded;
                it.refundIn = it.amountIn;
            }
        }
        escrowed[MUSD] -= b.totalMusdIn;
        escrowed[BTC] -= b.totalBtcIn;
        b.status = BatchStatus.Expired;
        b.live = 0;

        for (uint256 i; i < len; ++i) {
            Intent storage it = intents[ids[i] - 1];
            if (it.status != IntentStatus.Refunded) continue;
            _push(it.side == Side.SellBtc ? BTC : MUSD, it.owner, it.amountIn);
            emit IntentRefunded(ids[i], batchId, it.owner, it.amountIn, RefundReason.Expired);
        }
        emit BatchExpired(batchId, msg.sender);
    }

    /// @inheritdoc IIntentBook
    function claim(address token) external nonReentrant returns (uint256 amount) {
        amount = claimable[msg.sender][token];
        if (amount == 0) revert NothingToClaim();
        claimable[msg.sender][token] = 0;
        totalClaimable[token] -= amount;
        IERC20(token).safeTransfer(msg.sender, amount);
        emit Claimed(msg.sender, token, amount);
    }

    /// @inheritdoc IIntentBook
    function setPaused(bool paused_) external onlyOwner {
        paused = paused_;
        emit PausedSet(paused_);
    }

    // ------------------------------------------------------------------ views

    /// @inheritdoc IIntentBook
    function currentBatchId() public view returns (uint256) {
        if (block.timestamp < START) return 0;
        return (block.timestamp - START) / DURATION;
    }

    /// @inheritdoc IIntentBook
    function batchTimes(uint256 batchId) public view returns (uint256 openAt, uint256 closeAt, uint256 expireAt) {
        if (batchId > type(uint64).max) revert InvalidParam("batchId");
        openAt = uint256(START) + batchId * DURATION;
        closeAt = openAt + DURATION;
        expireAt = closeAt + SETTLE_TIMEOUT;
    }

    /// @inheritdoc IIntentBook
    function getBatch(uint256 batchId) external view returns (Batch memory) {
        return batches[batchId];
    }

    /// @inheritdoc IIntentBook
    function getIntent(uint256 intentId) external view returns (Intent memory it) {
        if (intentId == 0 || intentId > intents.length) return it;
        return intents[intentId - 1];
    }

    /// @inheritdoc IIntentBook
    function batchIntentIds(uint256 batchId) external view returns (uint256[] memory) {
        return batchIds[batchId];
    }

    /// @inheritdoc IIntentBook
    function intentsOf(address who) external view returns (uint256[] memory) {
        return userIds[who];
    }

    /// @inheritdoc IIntentBook
    function intentCount() external view returns (uint256) {
        return intents.length;
    }

    /// @inheritdoc IIntentBook
    function preview(uint256 batchId)
        external
        view
        returns (IBatchSettler.Clearing memory c, IPriceGuard.Prices memory p)
    {
        if (batchId > type(uint64).max) revert InvalidParam("batchId");
        Batch storage b = batches[batchId];
        if (b.status != BatchStatus.Open) revert BatchNotOpen(b.status);
        if (b.live == 0) return (c, p);
        (, c, p) = _plan(batchId);
    }

    // ------------------------------------------------------------------ internals

    function _plan(uint256 batchId)
        internal
        view
        returns (IBatchSettler.Order[] memory orders, IBatchSettler.Clearing memory c, IPriceGuard.Prices memory p)
    {
        orders = _liveOrders(batchId);
        p = GUARD.checked();
        c = SETTLER.clear(orders, p.spot);
        if (c.routeIn > 0 && IMezoPoolFactory(FACTORY).isPaused()) revert PoolPaused();
    }

    function _liveOrders(uint256 batchId) internal view returns (IBatchSettler.Order[] memory orders) {
        uint256[] storage ids = batchIds[batchId];
        orders = new IBatchSettler.Order[](batches[batchId].live);
        uint256 k;
        for (uint256 i; i < ids.length; ++i) {
            Intent storage it = intents[ids[i] - 1];
            if (it.status != IntentStatus.Open) continue;
            orders[k++] = IBatchSettler.Order({id: ids[i], side: it.side, amountIn: it.amountIn, minOut: it.minOut});
        }
    }

    /// @dev Push a payout; on failure credit `claimable`. Zero amount is a no-op.
    function _push(address token, address to, uint256 amt) internal {
        if (amt == 0) return;
        (bool ok, bytes memory ret) = token.call(abi.encodeCall(IERC20.transfer, (to, amt)));
        if (ok && (ret.length == 0 || (ret.length >= 32 && abi.decode(ret, (bool))))) return;
        claimable[to][token] += amt;
        totalClaimable[token] += amt;
        emit PayoutDeferred(to, token, amt);
    }
}
