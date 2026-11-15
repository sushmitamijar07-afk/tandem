// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {Side, IntentStatus, BatchStatus, Intent, Batch} from "../../src/interfaces/IBatchTypes.sol";
import {IBatchSettler} from "../../src/interfaces/IBatchSettler.sol";
import {IPriceGuard} from "../../src/interfaces/IPriceGuard.sol";
import {IntentBook} from "../../src/IntentBook.sol";
import {MockERC20} from "../mocks/MockERC20.sol";
import {MockNativeBtc} from "../mocks/MockNativeBtc.sol";
import {MockPool} from "../mocks/MockPool.sol";
import {MockPriceFeed} from "../mocks/MockPriceFeed.sol";

/// @notice Drives IntentBook with random but mostly-valid actions and records ghost state for BatchInvariants
///         (brief §8). Expected reverts (guard bands, timing) are swallowed with try/catch.
contract BatchHandler is Test {
    IntentBook public immutable book;
    MockPool public immutable pool;
    MockPriceFeed public immutable feed;
    MockERC20 public immutable musd;
    MockNativeBtc public immutable btc;
    address public immutable owner;

    address[5] public actors;

    // ---- ghosts
    uint256 public ghostDustMusd;
    uint256 public ghostDustBtc;
    uint256 public ghostDonMusd;
    uint256 public ghostDonBtc;
    uint256[] internal cancelledIds;
    mapping(uint256 => uint256) public cancelTs;
    mapping(uint256 => bytes32) internal termHash; // intentId => hash of its terminal state
    mapping(uint256 => uint8) internal batchTerm; // batchId => status + 1 once terminal
    mapping(uint256 => bool) internal settledOnce;

    // ---- violation counters (all must stay 0)
    uint256 public vUniform; // I3
    uint256 public vMid; // I4
    uint256 public vConserve; // I5
    uint256 public vTerminal; // I6
    uint256 public vOwner; // I8

    // ---- coverage counters (informational)
    uint256 public nSettled;
    uint256 public nRouted;
    uint256 public nRefunds;
    uint256 public nExpired;
    uint256 public nDeferred;
    uint256 public nCancelled;

    constructor(
        IntentBook b,
        MockPool p,
        MockPriceFeed f,
        MockERC20 m,
        MockNativeBtc bt,
        address ownr,
        address[5] memory a
    ) {
        book = b;
        pool = p;
        feed = f;
        musd = m;
        btc = bt;
        owner = ownr;
        actors = a;
    }

    modifier track() {
        _;
        _snapshot();
    }

    // ------------------------------------------------------------------ actions
    function submitBtc(uint256 actorSeed, uint256 amt, uint256 minBps) external track {
        address a = actors[actorSeed % 5];
        amt = bound(amt, 1e14, 5e18);
        uint256 minOut = _minOut(pool.getAmountOut(amt, address(btc)), minBps);
        vm.deal(a, a.balance + amt);
        vm.prank(a);
        try book.submitSellBtc{value: amt}(minOut) {} catch {}
    }

    function submitMusd(uint256 actorSeed, uint256 amt, uint256 minBps) external track {
        address a = actors[actorSeed % 5];
        amt = bound(amt, 10e18, 4e5 * 1e18);
        uint256 minOut = _minOut(pool.getAmountOut(amt, address(musd)), minBps);
        if (musd.balanceOf(a) < amt) musd.mint(a, amt);
        vm.prank(a);
        try book.submitSellMusd(amt, minOut) {} catch {}
    }

    /// @dev minBps in [-50, 300]: minOut = alone-quote * (1 - minBps/1e4); negative values demand more than alone.
    function _minOut(uint256 est, uint256 raw) internal pure returns (uint256) {
        int256 mb = int256(bound(raw, 0, 350)) - 50;
        uint256 f = uint256(int256(10_000) - mb);
        uint256 m = est * f / 10_000;
        return m == 0 ? 1 : m;
    }

    function cancel(uint256 seed) external track {
        uint256 n = book.intentCount();
        if (n == 0) return;
        uint256 id = (seed % n) + 1;
        Intent memory it = book.getIntent(id);
        vm.prank(it.owner);
        try book.cancel(id) {
            cancelTs[id] = block.timestamp;
            cancelledIds.push(id);
            ++nCancelled;
        } catch {}
    }

    function warp(uint256 secs) external track {
        vm.warp(block.timestamp + bound(secs, 1, 300));
        // (brief: 1..300 s) the same action also nudges nothing else
    }

    function settle(uint256 seed) external track {
        uint256 cur = book.currentBatchId();
        if (cur == 0) return;
        uint256 span = cur < 6 ? cur : 6;
        uint256 id = cur - 1 - (seed % span);
        // prefer a recent round that still has live intents so the run actually exercises clearing
        for (uint256 k; k < span; ++k) {
            uint256 cand = cur - 1 - ((seed + k) % span);
            if (book.getBatch(cand).live > 0) {
                id = cand;
                break;
            }
        }
        IBatchSettler.Clearing memory c;
        IPriceGuard.Prices memory p;
        try book.preview(id) returns (IBatchSettler.Clearing memory c_, IPriceGuard.Prices memory p_) {
            c = c_;
            p = p_;
        } catch {
            // still try the real call: it may revert too, or settle an empty round
        }
        vm.prank(address(0xBEEF));
        try book.settle(id) {
            if (settledOnce[id]) ++vTerminal;
            settledOnce[id] = true;
            ++nSettled;
            if (c.fills.length > 0) _checkSettled(id, c, p);
        } catch {}
    }

    function expire(uint256 seed) external track {
        uint256 cur = book.currentBatchId();
        if (cur == 0) return;
        uint256 id = seed % cur;
        try book.expire(id) {
            ++nExpired;
        } catch {}
    }

    function claim(uint256 actorSeed) external track {
        address a = actors[actorSeed % 5];
        vm.prank(a);
        try book.claim(address(musd)) {} catch {}
        vm.prank(a);
        try book.claim(address(btc)) {} catch {}
    }

    /// @dev Spot moves relative to the TWAP (not cumulatively) so most settles stay inside the 50 bps band.
    function moveSpot(uint256 raw) external track {
        int256 d = int256(bound(raw, 0, 120)) - 60;
        (, uint256 r1,) = pool.getReserves();
        uint256 target = pool.twapPrice() * uint256(int256(10_000) + d) / 10_000;
        pool.setReserves(target * r1 / 1e18, r1);
    }

    function setTwap(uint256 raw) external track {
        int256 d = int256(bound(raw, 0, 120)) - 60;
        (uint256 r0, uint256 r1,) = pool.getReserves();
        uint256 spot = r0 * 1e18 / r1;
        pool.setTwap(spot * uint256(int256(10_000) + d) / 10_000);
    }

    function setOracle(uint256 raw) external track {
        int256 d = int256(bound(raw, 0, 700)) - 350;
        feed.setPrice(pool.twapPrice() * uint256(int256(10_000) + d) / 10_000);
    }

    function breakReceiver(uint256 actorSeed, bool flag) external track {
        musd.setBlocked(actors[actorSeed % 5], flag);
    }

    function donate(uint256 tokenSeed, uint256 amt) external track {
        amt = bound(amt, 1, 1e20);
        if (tokenSeed % 2 == 0) {
            musd.mint(address(book), amt);
            ghostDonMusd += amt;
        } else {
            vm.deal(address(book), address(book).balance + amt);
            ghostDonBtc += amt;
        }
    }

    /// @dev I8: owner can only flip the flag; nothing else moves.
    function togglePause(uint256 raw) external track {
        bytes32 before = _fundsHash();
        vm.prank(owner);
        book.setPaused(raw % 6 == 0); // paused only ~1/6 of the time so submits keep flowing
        if (_fundsHash() != before) ++vOwner;
    }

    // ------------------------------------------------------------------ checks
    function _fundsHash() internal view returns (bytes32) {
        return keccak256(
            abi.encode(
                address(book).balance,
                musd.balanceOf(address(book)),
                book.escrowed(address(btc)),
                book.escrowed(address(musd)),
                book.totalClaimable(address(btc)),
                book.totalClaimable(address(musd)),
                book.intentCount()
            )
        );
    }

    struct Ctx {
        bool xIsBtc;
        uint256 sx;
        uint256 avail;
        uint256 spot;
        uint256 usedM;
        uint256 usedB;
    }

    function _checkSettled(uint256 id, IBatchSettler.Clearing memory c, IPriceGuard.Prices memory p) internal {
        Batch memory b = book.getBatch(id);
        Ctx memory x;
        x.xIsBtc = c.routeBtc;
        x.spot = p.spot;
        uint256 n = c.fills.length;

        // ghosts: S_X and the Y-side token total over filled orders, then avail
        uint256 sy;
        for (uint256 i; i < n; ++i) {
            if (!c.fills[i].filled) continue;
            Intent memory it = book.getIntent(c.fills[i].id);
            if ((it.side == Side.SellBtc) == x.xIsBtc) x.sx += it.amountIn;
            else sy += it.amountIn;
        }
        x.avail = sy + c.routeOut; // routeOut is 0 whenever nothing was routed
        if (c.routeIn > 0) ++nRouted;

        for (uint256 i; i < n; ++i) {
            _checkFill(book.getIntent(c.fills[i].id), c.fills[i].filled, x);
        }
        if (c.routeIn > 0) {
            if (c.routeBtc) x.usedB += c.routeIn;
            else x.usedM += c.routeIn;
        }
        uint256 haveM = b.totalMusdIn + ((c.routeIn > 0 && c.routeBtc) ? b.routedOut : 0);
        uint256 haveB = b.totalBtcIn + ((c.routeIn > 0 && !c.routeBtc) ? b.routedOut : 0);
        if (x.usedM > haveM || x.usedB > haveB) {
            ++vConserve;
            return;
        }
        uint256 dM = haveM - x.usedM;
        uint256 dB = haveB - x.usedB;
        if (dM > n || dB > n) ++vConserve; // I5: dust <= number of fills, wei
        ghostDustMusd += dM;
        ghostDustBtc += dB;
    }

    function _checkFill(Intent memory it, bool filled, Ctx memory x) internal {
        bool isBtc = it.side == Side.SellBtc;
        if (isBtc) {
            x.usedM += it.amountOut;
            x.usedB += it.refundIn;
        } else {
            x.usedB += it.amountOut;
            x.usedM += it.refundIn;
        }
        if (!filled) {
            ++nRefunds;
            return;
        }
        uint256 eff = it.amountIn - it.refundIn;
        uint256 mid = isBtc ? Math.mulDiv(eff, x.spot, 1e18) : Math.mulDiv(eff, 1e18, x.spot);
        if (isBtc == x.xIsBtc) {
            if (it.amountOut != Math.mulDiv(it.amountIn, x.avail, x.sx)) ++vUniform; // I3 (X side)
            if (it.amountOut > mid) ++vMid; // I4 (X never better than mid)
        } else {
            uint256 full = isBtc ? Math.mulDiv(it.amountIn, x.spot, 1e18) : Math.mulDiv(it.amountIn, 1e18, x.spot);
            if (it.amountOut != full) ++vMid; // I4 (Y exactly at mid)
            if (it.refundIn != 0) ++vMid;
        }
    }

    /// @dev I6: once an intent or round is terminal its stored state must never change.
    function _snapshot() internal {
        uint256 n = book.intentCount();
        for (uint256 id = 1; id <= n; ++id) {
            Intent memory it = book.getIntent(id);
            bool terminal = it.status == IntentStatus.Cancelled || it.status == IntentStatus.Filled
                || it.status == IntentStatus.Refunded;
            bytes32 h = keccak256(abi.encode(it));
            if (termHash[id] == 0) {
                if (terminal) termHash[id] = h;
            } else if (termHash[id] != h) {
                ++vTerminal;
            }
        }
        uint256 cur = book.currentBatchId();
        for (uint256 b = 0; b <= cur; ++b) {
            Batch memory bt = book.getBatch(b);
            uint8 s = uint8(bt.status);
            if (batchTerm[b] == 0) {
                if (bt.status != BatchStatus.Open) batchTerm[b] = s + 1;
            } else if (batchTerm[b] != s + 1) {
                ++vTerminal;
            }
        }
    }

    function cancelledCount() external view returns (uint256) {
        return cancelledIds.length;
    }

    function cancelledAt(uint256 i) external view returns (uint256) {
        return cancelledIds[i];
    }
}
