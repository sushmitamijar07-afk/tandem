// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {Fixture} from "./Fixture.sol";
import {Side} from "../src/interfaces/IBatchTypes.sol";
import {IBatchSettler} from "../src/interfaces/IBatchSettler.sol";

contract BatchSettlerTest is Fixture {
    function _o(uint256 id, Side s, uint256 amt, uint256 minOut) internal pure returns (IBatchSettler.Order memory) {
        return IBatchSettler.Order({id: id, side: s, amountIn: amt, minOut: minOut});
    }

    // ------------------------------------------------------------------ unit
    function test_clear_example1_atClearingLevel() public view {
        IBatchSettler.Order[] memory o = new IBatchSettler.Order[](3);
        o[0] = _o(1, Side.SellBtc, 0.05e18, 3880e18);
        o[1] = _o(2, Side.SellMusd, 3000e18, 0.038e18);
        o[2] = _o(3, Side.SellMusd, 1000e18, 0.0128e18);
        IBatchSettler.Clearing memory c = settler.clear(o, _spot());
        assertEq(c.rounds, 2);
        assertTrue(c.routeBtc);
        assertEq(c.routeIn, 11647855853969101);
        assertEq(c.routeOut, 910751662331430998202);
        assertTrue(c.fills[0].filled);
        assertEq(c.fills[0].amountOut, 3910751662331430998202);
        assertTrue(c.fills[1].filled);
        assertEq(c.fills[1].amountOut, 38352144146030899);
        assertFalse(c.fills[2].filled);
        assertEq(c.fills[2].refundIn, 1000e18);
        assertEq(c.fills[2].amountOut, 0);
        assertEq(c.fills[0].id, 1);
        assertEq(c.fills[2].id, 3);
        assertEq(c.priceMusdSide, _spot()); // Y side exactly refPrice
        // X side: BTC seller got out/in rounded down
        assertEq(c.priceBtcSide, Math.mulDiv(3910751662331430998202, 1e18, 0.05e18));
        assertLt(c.priceBtcSide, _spot());
    }

    function test_clear_revertsTooManyOrdersAndZeroPrice() public {
        IBatchSettler.Order[] memory o = new IBatchSettler.Order[](65);
        for (uint256 i; i < 65; ++i) {
            o[i] = _o(i + 1, Side.SellBtc, 1e18, 1);
        }
        uint256 p = _spot();
        vm.expectRevert(abi.encodeWithSelector(IBatchSettler.TooManyOrders.selector, uint256(65), uint256(64)));
        settler.clear(o, p);
        IBatchSettler.Order[] memory o2 = new IBatchSettler.Order[](64);
        for (uint256 i; i < 64; ++i) {
            o2[i] = _o(i + 1, Side.SellBtc, 1e18, 1);
        }
        settler.clear(o2, p); // 64 is fine
        vm.expectRevert(IBatchSettler.ZeroPrice.selector);
        settler.clear(o2, 0);
    }

    function test_clear_emptyInput_oneRound() public view {
        IBatchSettler.Order[] memory o = new IBatchSettler.Order[](0);
        IBatchSettler.Clearing memory c = settler.clear(o, _spot());
        assertEq(c.rounds, 1);
        assertEq(c.fills.length, 0);
        assertEq(c.routeIn, 0);
        assertFalse(c.routeBtc);
    }

    function test_clear_allFail_oneRemovalPerPass_andZeroedState() public view {
        IBatchSettler.Order[] memory o = new IBatchSettler.Order[](2);
        o[0] = _o(1, Side.SellBtc, 1e18, type(uint128).max);
        o[1] = _o(2, Side.SellMusd, 1000e18, type(uint128).max);
        IBatchSettler.Clearing memory c = settler.clear(o, _spot());
        assertEq(c.rounds, 3); // one removal per pass: 2 removals + the final empty pass
        assertFalse(c.routeBtc);
        assertEq(c.routeIn, 0);
        assertEq(c.routeOut, 0);
        assertEq(c.priceBtcSide, 0);
        assertEq(c.priceMusdSide, 0);
        assertEq(c.fills[0].refundIn, 1e18);
        assertEq(c.fills[1].refundIn, 1000e18);
    }

    function test_clear_immutables() public view {
        assertEq(settler.MAX_ORDERS(), 64);
        assertEq(settler.POOL(), address(pool));
        assertEq(settler.MUSD(), address(musd));
        assertEq(settler.BTC(), address(btc));
    }

    function test_clear_exactEqualityTakesBtcExcessBranch() public view {
        uint256 p = _spot();
        IBatchSettler.Order[] memory o = new IBatchSettler.Order[](2);
        o[0] = _o(1, Side.SellBtc, 1e18, 1);
        o[1] = _o(2, Side.SellMusd, p, 1);
        IBatchSettler.Clearing memory c = settler.clear(o, p);
        assertTrue(c.routeBtc);
        assertEq(c.routeIn, 0);
        assertEq(c.rounds, 1);
        assertEq(c.fills[0].amountOut, p);
        assertEq(c.fills[1].amountOut, 1e18);
    }

    // ------------------------------------------------------------------ fuzz
    function _build(uint96[8] memory amts, bool[8] memory sides, uint16 minBps)
        internal
        view
        returns (IBatchSettler.Order[] memory o)
    {
        o = new IBatchSettler.Order[](8);
        for (uint256 i; i < 8; ++i) {
            bool btcSide = sides[i];
            uint256 amt = btcSide ? bound(uint256(amts[i]), 1e14, 50e18) : bound(uint256(amts[i]), 10e18, 4e24);
            uint256 alone = pool.getAmountOut(amt, btcSide ? address(btc) : address(musd));
            // minOut between 96% and 101% of the alone quote, varying per order
            uint256 f = 10_100 - ((uint256(minBps) * (i + 3) * 2654435761) % 500);
            uint256 mo = alone * f / 10_000;
            o[i] = _o(i + 1, btcSide ? Side.SellBtc : Side.SellMusd, amt, mo == 0 ? 1 : mo);
        }
    }

    function testFuzz_clear_sumOutLeAvailable(uint96[8] memory amts, bool[8] memory sides, uint16 minBps) public view {
        IBatchSettler.Order[] memory o = _build(amts, sides, minBps);
        IBatchSettler.Clearing memory c = settler.clear(o, _spot());
        uint256 inM;
        uint256 inB;
        uint256 usedM;
        uint256 usedB;
        for (uint256 i; i < 8; ++i) {
            if (o[i].side == Side.SellBtc) {
                inB += o[i].amountIn;
                usedM += c.fills[i].amountOut;
                usedB += c.fills[i].refundIn;
            } else {
                inM += o[i].amountIn;
                usedB += c.fills[i].amountOut;
                usedM += c.fills[i].refundIn;
            }
        }
        if (c.routeIn > 0) {
            if (c.routeBtc) usedB += c.routeIn;
            else usedM += c.routeIn;
        }
        uint256 haveM = inM + ((c.routeIn > 0 && c.routeBtc) ? c.routeOut : 0);
        uint256 haveB = inB + ((c.routeIn > 0 && !c.routeBtc) ? c.routeOut : 0);
        assertLe(usedM, haveM);
        assertLe(usedB, haveB);
        assertLe(haveM - usedM, 8);
        assertLe(haveB - usedB, 8);
        assertEq(c.routeIn > 0, c.routeOut > 0);
        assertLe(c.rounds, 9);
    }

    function testFuzz_clear_filledMeetMinOut(uint96[8] memory amts, bool[8] memory sides, uint16 minBps) public view {
        IBatchSettler.Order[] memory o = _build(amts, sides, minBps);
        IBatchSettler.Clearing memory c = settler.clear(o, _spot());
        for (uint256 i; i < 8; ++i) {
            assertEq(c.fills[i].id, o[i].id);
            if (c.fills[i].filled) {
                assertGe(c.fills[i].amountOut, o[i].minOut);
            } else {
                assertEq(c.fills[i].amountOut, 0);
                assertEq(c.fills[i].refundIn, o[i].amountIn);
            }
        }
    }

    function testFuzz_clear_uniformPricePerSide(uint96[8] memory amts, bool[8] memory sides, uint16 minBps)
        public
        view
    {
        IBatchSettler.Order[] memory o = _build(amts, sides, minBps);
        IBatchSettler.Clearing memory c = settler.clear(o, _spot());
        for (uint256 i; i < 8; ++i) {
            for (uint256 j = i + 1; j < 8; ++j) {
                if (!c.fills[i].filled || !c.fills[j].filled || o[i].side != o[j].side) continue;
                uint256 l = c.fills[i].amountOut * o[j].amountIn;
                uint256 r = c.fills[j].amountOut * o[i].amountIn;
                uint256 d = l > r ? l - r : r - l;
                // each out is floor(in * rate): the cross difference is below max(in_i, in_j)
                assertLe(d, o[i].amountIn > o[j].amountIn ? o[i].amountIn : o[j].amountIn);
            }
        }
    }

    function testFuzz_clear_xNeverBetterThanMid_yExactlyMid(uint96[8] memory amts, bool[8] memory sides, uint16 minBps)
        public
        view
    {
        uint256 p = _spot();
        IBatchSettler.Order[] memory o = _build(amts, sides, minBps);
        IBatchSettler.Clearing memory c = settler.clear(o, p);
        bool xIsBtc = c.routeBtc; // excess side is BTC sellers
        for (uint256 i; i < 8; ++i) {
            if (!c.fills[i].filled) continue;
            bool isBtc = o[i].side == Side.SellBtc;
            uint256 eff = o[i].amountIn - c.fills[i].refundIn;
            uint256 mid = isBtc ? Math.mulDiv(eff, p, 1e18) : Math.mulDiv(eff, 1e18, p);
            if (isBtc == xIsBtc) {
                assertLe(c.fills[i].amountOut, mid); // X: never better than mid
            } else {
                // Y: exactly mid on the full amount
                uint256 full = isBtc ? Math.mulDiv(o[i].amountIn, p, 1e18) : Math.mulDiv(o[i].amountIn, 1e18, p);
                assertEq(c.fills[i].amountOut, full);
                assertEq(c.fills[i].refundIn, 0);
            }
        }
    }

    /// @dev Y fills are paid at mid, which is >= the pool's fee-and-impact-net quote, per fill. X fills share one
    ///      uniform price, so a tiny X order can price below its own alone-quote while a large one prices above it
    ///      (see docs: per-fill "never worse than alone" holds only for Y; for X it holds for the side as a whole).
    function testFuzz_clear_neverWorseThanAlone(uint96[8] memory amts, bool[8] memory sides, uint16 minBps)
        public
        view
    {
        IBatchSettler.Order[] memory o = _build(amts, sides, minBps);
        IBatchSettler.Clearing memory c = settler.clear(o, _spot());
        uint256 xIn;
        uint256 xOut;
        uint256 nX;
        address xTokenIn = c.routeBtc ? address(btc) : address(musd);
        for (uint256 i; i < 8; ++i) {
            if (!c.fills[i].filled) continue;
            address tin = o[i].side == Side.SellBtc ? address(btc) : address(musd);
            if (tin == xTokenIn) {
                xIn += o[i].amountIn - c.fills[i].refundIn;
                xOut += c.fills[i].amountOut;
                ++nX;
            } else {
                assertGe(c.fills[i].amountOut, pool.getAmountOut(o[i].amountIn, tin));
            }
        }
        if (xIn > 0) assertGe(xOut + nX, pool.getAmountOut(xIn, xTokenIn));
    }

    function testFuzz_clear_cascadeTerminates(uint96[8] memory amts, bool[8] memory sides, uint16 minBps) public view {
        IBatchSettler.Order[] memory o = _build(amts, sides, minBps);
        IBatchSettler.Clearing memory c = settler.clear(o, _spot());
        assertLe(c.rounds, o.length + 1);
        assertGe(c.rounds, 1);
    }

    // ------------------------------------------------------------------ audit regressions
    /// @dev Finding 3: an unfillable large order must not take a fillable order down with it.
    function test_audit_unfillableOrderDoesNotRefundFillable() public {
        _deployAll(6_000_000e18, 100e18, 300); // spot 60,000, fee 4 bps
        uint256 p = _spot();
        IBatchSettler.Order[] memory o = new IBatchSettler.Order[](3);
        o[0] = _o(1, Side.SellBtc, 1e18, 59_000e18); // B
        o[1] = _o(2, Side.SellMusd, 60_000e18, 0.996e18); // A
        o[2] = _o(3, Side.SellMusd, 60_000e18, 1.5e18); // D, cannot be met
        IBatchSettler.Clearing memory c = settler.clear(o, p);
        assertTrue(c.fills[0].filled);
        assertTrue(c.fills[1].filled, "A must fill");
        assertFalse(c.fills[2].filled);
        assertEq(c.fills[2].refundIn, 60_000e18);
        // A and B match exactly at mid
        assertEq(c.fills[1].amountOut, 1e18);
        assertEq(c.fills[0].amountOut, 60_000e18);
        assertEq(c.routeIn, 0);
    }

    /// @dev Finding 2 at the settler: the flipped order has no leftover dust refund.
    function test_audit_staleRefund_clearedOnFlip() public {
        _deployAll(7_800_000e18, 100e18, 300);
        uint256 p = _spot();
        IBatchSettler.Order[] memory o = new IBatchSettler.Order[](3);
        o[0] = _o(1, Side.SellBtc, 2.6e14, 1);
        o[1] = _o(2, Side.SellMusd, 1e19, 1);
        o[2] = _o(3, Side.SellMusd, 1.028e19 + 5e4, 2e14);
        // pass-1 net is 5e4 MUSD wei: below the pool's zero-output threshold
        assertEq(pool.getAmountOut(5e4, address(musd)), 0);
        IBatchSettler.Clearing memory c = settler.clear(o, p);
        assertFalse(c.fills[2].filled);
        assertTrue(c.fills[1].filled);
        assertEq(c.fills[1].refundIn, 0);
    }

    /// @dev Removal order: the largest relative shortfall goes first; ties go to the lowest index.
    function test_audit_worstShortfallFirst() public {
        _deployAll(6_000_000e18, 100e18, 300);
        uint256 p = _spot();
        // three MUSD sellers only (X side, routed). out/in is the same for all, so shortfall ratio is set by minOut.
        // Order 2 asks for far more than the others, so it must be the one removed first and the rest still fill.
        IBatchSettler.Order[] memory o = new IBatchSettler.Order[](3);
        o[0] = _o(1, Side.SellMusd, 1000e18, 0.0166e18);
        o[1] = _o(2, Side.SellMusd, 1000e18, 5e18);
        o[2] = _o(3, Side.SellMusd, 1000e18, 0.0166e18);
        IBatchSettler.Clearing memory c = settler.clear(o, p);
        assertTrue(c.fills[0].filled);
        assertFalse(c.fills[1].filled);
        assertTrue(c.fills[2].filled);
        assertEq(c.rounds, 2);
        // tie: identical failing orders, lowest index is removed first, so the later one gets the better rate
        o[0] = _o(1, Side.SellMusd, 1000e18, 1e18);
        o[1] = _o(2, Side.SellMusd, 1000e18, 1e18);
        o[2] = _o(3, Side.SellMusd, 1000e18, 1e18);
        c = settler.clear(o, p);
        assertEq(c.rounds, 4);
        assertFalse(c.fills[0].filled);
        assertFalse(c.fills[1].filled);
        assertFalse(c.fills[2].filled);
    }
}
