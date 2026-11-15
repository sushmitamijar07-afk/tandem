// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {Fixture} from "./Fixture.sol";
import {IPriceGuard} from "../src/interfaces/IPriceGuard.sol";
import {PriceGuard} from "../src/PriceGuard.sol";
import {MockPool} from "./mocks/MockPool.sol";

contract PriceGuardTest is Fixture {
    function _g(address p, address f, address src, address m, address b, uint256 gr, uint256 ms, uint256 ob)
        internal
        returns (PriceGuard)
    {
        return new PriceGuard(p, f, src, m, b, gr, ms, ob);
    }

    function test_constructor_revertsOnZeroAddress() public {
        address pl = address(pool);
        address f = address(factory);
        address src = address(feed);
        address m = address(musd);
        address b = address(btc);
        vm.expectRevert(abi.encodeWithSelector(IPriceGuard.InvalidParam.selector, bytes32("pool")));
        _g(address(0), f, src, m, b, 2, 50, 300);
        vm.expectRevert(abi.encodeWithSelector(IPriceGuard.InvalidParam.selector, bytes32("factory")));
        _g(pl, address(0), src, m, b, 2, 50, 300);
        vm.expectRevert(abi.encodeWithSelector(IPriceGuard.InvalidParam.selector, bytes32("priceSource")));
        _g(pl, f, address(0), m, b, 2, 50, 300);
        vm.expectRevert(abi.encodeWithSelector(IPriceGuard.InvalidParam.selector, bytes32("musd")));
        _g(pl, f, src, address(0), b, 2, 50, 300);
        vm.expectRevert(abi.encodeWithSelector(IPriceGuard.InvalidParam.selector, bytes32("btc")));
        _g(pl, f, src, m, address(0), 2, 50, 300);
    }

    function test_constructor_revertsOnParamBounds() public {
        address pl = address(pool);
        address f = address(factory);
        address src = address(feed);
        address m = address(musd);
        address b = address(btc);
        uint256[2] memory badG = [uint256(0), 9];
        for (uint256 i; i < 2; ++i) {
            vm.expectRevert(abi.encodeWithSelector(IPriceGuard.InvalidParam.selector, bytes32("granularity")));
            _g(pl, f, src, m, b, badG[i], 50, 300);
        }
        uint256[2] memory badS = [uint256(0), 501];
        for (uint256 i; i < 2; ++i) {
            vm.expectRevert(abi.encodeWithSelector(IPriceGuard.InvalidParam.selector, bytes32("maxSpotTwapBps")));
            _g(pl, f, src, m, b, 2, badS[i], 300);
        }
        uint256[2] memory badB = [uint256(0), 3001];
        for (uint256 i; i < 2; ++i) {
            vm.expectRevert(abi.encodeWithSelector(IPriceGuard.InvalidParam.selector, bytes32("oracleBandBps")));
            _g(pl, f, src, m, b, 2, 50, badB[i]);
        }
        // bounds are inclusive
        _g(pl, f, src, m, b, 1, 1, 1);
        _g(pl, f, src, m, b, 8, 500, 3000);
    }

    function test_constructor_revertsOnWrongPoolOrder() public {
        address pl = address(pool);
        address f = address(factory);
        address src = address(feed);
        // tokens swapped
        vm.expectRevert(IPriceGuard.BadPool.selector);
        _g(pl, f, src, address(btc), address(musd), 2, 50, 300);
        // stable pool
        MockPool st = new MockPool(address(musd), address(btc), f);
        st.setStable(true);
        vm.expectRevert(IPriceGuard.BadPool.selector);
        _g(address(st), f, src, address(musd), address(btc), 2, 50, 300);
        // non-18 decimals
        MockPool d6 = new MockPool(address(musd), address(btc), f);
        d6.setDecimals(1e18, 1e6);
        vm.expectRevert(IPriceGuard.BadPool.selector);
        _g(address(d6), f, src, address(musd), address(btc), 2, 50, 300);
        d6.setDecimals(1e6, 1e18);
        vm.expectRevert(IPriceGuard.BadPool.selector);
        _g(address(d6), f, src, address(musd), address(btc), 2, 50, 300);
    }

    function test_read_returnsAllPrices() public view {
        IPriceGuard.Prices memory p = guard.read();
        assertEq(p.reserveMusd, R0);
        assertEq(p.reserveBtc, R1);
        assertEq(p.spot, 78222484473804130513824);
        assertEq(p.twap, p.spot - (p.spot % 100));
        assertEq(p.oracle, 78_222e18);
        assertEq(p.feeBps, 4);
        assertEq(guard.PROBE(), 1e16);
        assertEq(guard.GRANULARITY(), 2);
        assertEq(guard.MAX_SPOT_TWAP_BPS(), 50);
        assertEq(guard.ORACLE_BAND_BPS(), 300);
        guard.checked();
    }

    function test_read_neverRevertsOnBands_checkedDoes() public {
        feed.setPrice(1e18);
        IPriceGuard.Prices memory p = guard.read();
        assertGt(p.twapOracleBps, 300);
        vm.expectPartialRevert(IPriceGuard.OracleDeviation.selector);
        guard.checked();

        feed.setStale(true);
        p = guard.read();
        assertEq(p.oracle, 0);
        assertEq(p.twapOracleBps, type(uint256).max);
        vm.expectRevert(IPriceGuard.OracleUnavailable.selector);
        guard.checked();
    }

    function test_checked_orderAndEquality() public {
        // spot/twap breach is reported before the oracle problem
        feed.setStale(true);
        pool.setTwap(_spot() * 98 / 100);
        vm.expectPartialRevert(IPriceGuard.SpotTwapDeviation.selector);
        guard.checked();
        // equality passes: build twap so ceil(|spot-twap|*1e4/twap) == 50
        feed.setStale(false);
        pool.setReserves(1e24, 1e19); // spot = 1e5 e18 exactly
        feed.setPrice(1e23);
        // a twap that puts spot 50.25 bps above it -> ceil 51, one that gives 49.2 -> 50
        pool.setTwap(1e23 * 9950 / 10_000);
        IPriceGuard.Prices memory p = guard.read();
        assertEq(p.spotTwapBps, 51);
        vm.expectPartialRevert(IPriceGuard.SpotTwapDeviation.selector);
        guard.checked();
        pool.setTwap(1e23 * 9951 / 10_000); // 49.2 bps -> 50
        p = guard.read();
        assertEq(p.spotTwapBps, 50);
        feed.setPrice(1e23);
        guard.checked();
    }

    function test_read_emptyPool_spotZero() public {
        pool.setReserves(1e24, 0);
        IPriceGuard.Prices memory p = guard.read();
        assertEq(p.spot, 0);
        assertEq(p.spotTwapBps, type(uint256).max);
        vm.expectPartialRevert(IPriceGuard.SpotTwapDeviation.selector);
        guard.checked();
    }

    function testFuzz_priceGuard_bpsSymmetricAndCeil(uint256 s, uint256 t, uint256 o) public {
        s = bound(s, 1e18, 1e26);
        t = bound(t, 1e18, 1e26);
        o = bound(o, 1e18, 1e26);
        pool.setReserves(s * 1000, 1e21); // spot == s exactly
        pool.setTwap(t);
        feed.setPrice(o);
        IPriceGuard.Prices memory p = guard.read();
        assertEq(p.spot, s);
        uint256 tw = (t / 100) * 100; // quote(1e16)*100 granularity of the probe
        assertEq(p.twap, tw);
        uint256 d1 = s > tw ? s - tw : tw - s;
        assertEq(p.spotTwapBps, Math.mulDiv(d1, 1e4, tw, Math.Rounding.Ceil));
        uint256 d2 = tw > o ? tw - o : o - tw;
        assertEq(p.twapOracleBps, Math.mulDiv(d2, 1e4, o, Math.Rounding.Ceil));
        // ceil: bps * denom >= diff * 1e4 > (bps - 1) * denom
        assertGe(p.spotTwapBps * tw, d1 * 1e4);
        if (p.spotTwapBps > 0) assertLt((p.spotTwapBps - 1) * tw, d1 * 1e4);
        // symmetric numerator: swapping the two inputs (same denominator) gives the same bps
        pool.setReserves(tw * 1000, 1e21);
        pool.setTwap(s);
        IPriceGuard.Prices memory q = guard.read();
        uint256 sw = (s / 100) * 100;
        uint256 d3 = tw > sw ? tw - sw : sw - tw;
        assertEq(q.spotTwapBps, Math.mulDiv(d3, 1e4, sw, Math.Rounding.Ceil));
    }
}
