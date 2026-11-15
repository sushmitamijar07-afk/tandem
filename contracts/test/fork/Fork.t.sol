// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Side, IntentStatus, Intent, Batch} from "../../src/interfaces/IBatchTypes.sol";
import {IPriceGuard} from "../../src/interfaces/IPriceGuard.sol";
import {IMezoPool} from "../../src/external/IMezoPool.sol";
import {IMezoRouter} from "../../src/external/IMezoRouter.sol";
import {PriceGuard} from "../../src/PriceGuard.sol";
import {IBatchSettler} from "../../src/interfaces/IBatchSettler.sol";
import {BatchSettler} from "../../src/BatchSettler.sol";
import {IntentBook} from "../../src/IntentBook.sol";
import {MockNativeBtc} from "../mocks/MockNativeBtc.sol";

/// @notice Fork tests against Mezo testnet: `forge test --match-path "test/fork/*" --fork-url https://rpc.test.mezo.org`.
///         The BTC precompile is stub bytecode on a fork, so MockNativeBtc is etched over it (the pool's forked native
///         balance already equals reserve1, so the real Pool.swap K-check works), and the MUSD PriceFeed is mocked
///         because it reads the oracle precompile. Test names say so.
contract ForkTest is Test {
    address internal constant MUSD = 0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503;
    address internal constant BTC = 0x7b7C000000000000000000000000000000000000;
    address internal constant POOL = 0xd16A5Df82120ED8D626a1a15232bFcE2366d6AA9;
    address internal constant ROUTER = 0x9a1ff7FE3a0F69959A3fBa1F1e5ee18e1A9CD7E9;
    address internal constant FACTORY = 0x4947243CC818b627A5D06d14C4eCe7398A23Ce1A;
    address internal constant PRICE_FEED = 0x86bCF0841622a5dAC14A313a15f96A95421b9366;
    address internal constant STABILITY_POOL = 0x1CCA7E410eE41739792eA0A24e00349Dd247680e;

    uint256 internal constant MOCK_ORACLE = 67_642e18;
    uint32 internal constant DURATION = 120;

    PriceGuard internal guard;
    BatchSettler internal settler;
    IntentBook internal book;
    uint64 internal start;

    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal carol = makeAddr("carol");
    address internal keeper = makeAddr("keeper");
    address internal owner = makeAddr("owner");

    /// @notice which funding route worked: 1 = forge-std deal(), 2 = StabilityPool prank transfer
    uint256 public musdFundingMethod;

    function setUp() public {
        // BTC precompile -> MockNativeBtc code (no constructor state)
        vm.etch(BTC, address(new MockNativeBtc()).code);
        vm.allowCheatcodes(BTC); // the mock moves native balance through vm.deal
        // PriceFeed reads the oracle precompile, which reverts on a fork
        vm.mockCall(PRICE_FEED, abi.encodeWithSignature("fetchPrice()"), abi.encode(MOCK_ORACLE));

        _deploy(2500);
        _fund(alice, 10e18, 50_000e18);
        _fund(bob, 10e18, 50_000e18);
        _fund(carol, 10e18, 50_000e18);
    }

    function _deploy(uint256 bandBps) internal {
        guard = new PriceGuard(POOL, FACTORY, PRICE_FEED, MUSD, BTC, 2, 50, bandBps);
        settler = new BatchSettler(POOL, MUSD, BTC);
        start = uint64(block.timestamp);
        book = new IntentBook(
            IntentBook.Params({
                musd: MUSD,
                btc: BTC,
                router: ROUTER,
                factory: FACTORY,
                pool: POOL,
                guard: address(guard),
                settler: address(settler),
                startTime: start,
                batchDuration: DURATION,
                settleTimeout: 7200,
                maxIntents: 40,
                minMusdIn: 10e18,
                minBtcIn: 1e14,
                owner: owner
            })
        );
    }

    function dealWrapper(address to, uint256 amt) external {
        deal(MUSD, to, amt);
    }

    function _fund(address who, uint256 btcAmt, uint256 musdAmt) internal {
        vm.deal(who, btcAmt);
        uint256 before = IERC20(MUSD).balanceOf(who);
        try this.dealWrapper(who, before + musdAmt) {
            if (IERC20(MUSD).balanceOf(who) == before + musdAmt) musdFundingMethod = 1;
        } catch {}
        if (musdFundingMethod != 1) {
            vm.prank(STABILITY_POOL);
            IERC20(MUSD).transfer(who, musdAmt);
            musdFundingMethod = 2;
        }
        assertEq(IERC20(MUSD).balanceOf(who), before + musdAmt, "musd funding failed");
        vm.prank(who);
        IERC20(MUSD).approve(address(book), type(uint256).max);
    }

    function _sellBtc(address who, uint256 amt, uint256 minOut) internal returns (uint256) {
        vm.prank(who);
        return book.submitSellBtc{value: amt}(minOut);
    }

    function _sellMusd(address who, uint256 amt, uint256 minOut) internal returns (uint256) {
        vm.prank(who);
        return book.submitSellMusd(amt, minOut);
    }

    function _closeAndSettle() internal {
        (, uint256 closeAt,) = book.batchTimes(0);
        vm.warp(closeAt);
        vm.mockCall(PRICE_FEED, abi.encodeWithSignature("fetchPrice()"), abi.encode(MOCK_ORACLE));
        vm.prank(keeper);
        book.settle(0);
    }

    function _alone(uint256 amt, address tokenIn) internal view returns (uint256) {
        return IMezoPool(POOL).getAmountOut(amt, tokenIn);
    }

    // ------------------------------------------------------------------ tests
    function testFork_guardReadsLiveTwapAndSpot_mockedOracle() public {
        emit log_named_uint("MUSD funding method (1=deal, 2=StabilityPool prank)", musdFundingMethod);
        IPriceGuard.Prices memory p = guard.read();
        (uint256 r0, uint256 r1,) = IMezoPool(POOL).getReserves();
        assertEq(p.spot, r0 * 1e18 / r1);
        assertEq(p.reserveMusd, r0);
        assertEq(p.reserveBtc, r1);
        assertGt(p.twap, 50_000e18);
        assertLt(p.twap, 120_000e18);
        assertEq(p.oracle, MOCK_ORACLE);
        assertEq(p.feeBps, 4);
        assertLe(p.spotTwapBps, 50);
        uint256 diff = p.twap > MOCK_ORACLE ? p.twap - MOCK_ORACLE : MOCK_ORACLE - p.twap;
        assertEq(p.twapOracleBps, (diff * 1e4 + MOCK_ORACLE - 1) / MOCK_ORACLE);
        emit log_named_uint("live spot", p.spot);
        emit log_named_uint("live twap", p.twap);
        emit log_named_uint("twapOracleBps (mocked oracle)", p.twapOracleBps);
        guard.checked(); // band 2500 passes
    }

    function testFork_constructorChecksPassOnLivePool() public view {
        assertEq(IMezoRouter(ROUTER).poolFor(MUSD, BTC, false, FACTORY), POOL);
        assertEq(book.POOL(), POOL);
        assertEq(address(book.GUARD()), address(guard));
        assertEq(address(book.SETTLER()), address(settler));
        assertEq(guard.GRANULARITY(), 2);
        assertEq(IMezoPool(POOL).token0(), MUSD);
        assertEq(IMezoPool(POOL).token1(), BTC);
        assertFalse(IMezoPool(POOL).stable());
    }

    function testFork_settleMixedBatch_realRouter_mockedOracle_etchedBtc() public {
        uint256 aloneA = _alone(0.05e18, BTC);
        uint256 aloneB = _alone(3000e18, MUSD);
        uint256 a = _sellBtc(alice, 0.05e18, aloneA * 99 / 100);
        uint256 b = _sellMusd(bob, 3000e18, aloneB * 99 / 100);
        uint256 c = _sellMusd(carol, 1000e18, 1e18); // absurdly greedy: wants 1 BTC for 1000 MUSD
        uint256 aM = IERC20(MUSD).balanceOf(alice);
        uint256 bB = bob.balance;
        uint256 cM = IERC20(MUSD).balanceOf(carol);
        _closeAndSettle();

        Intent memory ia = book.getIntent(a);
        Intent memory ib = book.getIntent(b);
        Intent memory ic = book.getIntent(c);
        assertEq(uint8(ia.status), uint8(IntentStatus.Filled));
        assertEq(uint8(ib.status), uint8(IntentStatus.Filled));
        assertEq(uint8(ic.status), uint8(IntentStatus.Refunded));
        assertEq(IERC20(MUSD).balanceOf(alice) - aM, ia.amountOut);
        assertEq(bob.balance - bB, ib.amountOut);
        assertEq(IERC20(MUSD).balanceOf(carol) - cM, 1000e18);
        Batch memory bt = book.getBatch(0);
        assertGt(bt.routedIn, 0);
        // nothing meaningful stays in the book (dust only)
        assertLe(address(book).balance, 8);
        assertLe(IERC20(MUSD).balanceOf(address(book)), 8);
    }

    function testFork_routerOutEqualsPoolGetAmountOut() public {
        uint256 expected = _alone(500e18, MUSD);
        uint256 id = _sellMusd(bob, 500e18, expected * 99 / 100);
        uint256 before = bob.balance;
        _closeAndSettle();
        Batch memory bt = book.getBatch(0);
        assertEq(bt.routedIn, 500e18);
        assertEq(bt.routedOut, expected); // the real Router delivered exactly pool.getAmountOut
        assertEq(book.getIntent(id).amountOut, expected);
        assertEq(bob.balance - before, expected);
    }

    function testFork_btcExcess_routesBtc_etchedBtc() public {
        uint256 a = _sellBtc(alice, 1e18, 1);
        uint256 b = _sellMusd(bob, 10_000e18, 1);
        uint256 aM = IERC20(MUSD).balanceOf(alice);
        _closeAndSettle();
        Batch memory bt = book.getBatch(0);
        assertTrue(bt.routedBtc);
        assertGt(bt.routedIn, 0);
        assertEq(IERC20(BTC).allowance(address(book), ROUTER), 0);
        assertEq(uint8(book.getIntent(a).status), uint8(IntentStatus.Filled));
        assertEq(uint8(book.getIntent(b).status), uint8(IntentStatus.Filled));
        assertGt(IERC20(MUSD).balanceOf(alice) - aM, 10_000e18);
    }

    function testFork_tightBand_revertsOracleDeviation_mockedOracle() public {
        _deploy(300); // real gap vs the mocked 67,642 is ~1,565 bps
        _fund(alice, 1e18, 0);
        _sellBtc(alice, 0.01e18, 1);
        (, uint256 closeAt,) = book.batchTimes(0);
        vm.warp(closeAt);
        vm.mockCall(PRICE_FEED, abi.encodeWithSignature("fetchPrice()"), abi.encode(MOCK_ORACLE));
        vm.expectPartialRevert(IPriceGuard.OracleDeviation.selector);
        book.settle(0);
    }

    function testFork_savedVsAlone_positive_mockedOracle() public {
        uint256 aloneA = _alone(0.05e18, BTC);
        uint256 aloneB = _alone(3000e18, MUSD);
        uint256 a = _sellBtc(alice, 0.05e18, aloneA);
        uint256 b = _sellMusd(bob, 3000e18, aloneB);
        _sellMusd(carol, 1000e18, 0.0128e18);
        _closeAndSettle();
        uint256 outA = book.getIntent(a).amountOut;
        uint256 outB = book.getIntent(b).amountOut;
        assertGt(outA, aloneA);
        assertGt(outB, aloneB);
        emit log_named_uint("A kept vs alone (MUSD wei)", outA - aloneA);
        emit log_named_uint("B kept vs alone (BTC wei)", outB - aloneB);
    }

    /// @dev Longest clearing cascade (40 orders, all fail, one removal per pass = 41 passes) against the live pool's
    ///      getAmountOut. Measures BatchSettler.clear alone; settle adds the payouts on top (about 1.4M on the mock).
    function testFork_worstCaseCascade_clearGas() public {
        (uint256 r0, uint256 r1,) = IMezoPool(POOL).getReserves();
        uint256 p = r0 * 1e18 / r1;
        IBatchSettler.Order[] memory o = new IBatchSettler.Order[](40);
        for (uint256 i; i < 40; ++i) {
            if (i % 2 == 0) {
                uint256 amt = 0.01e18 + i * 1e12;
                o[i] = IBatchSettler.Order({
                    id: i + 1, side: Side.SellBtc, amountIn: amt, minOut: (amt * p / 1e18) * (200 + i) / 100
                });
            } else {
                uint256 amt = 700e18 + i * 1e15;
                o[i] = IBatchSettler.Order({
                    id: i + 1, side: Side.SellMusd, amountIn: amt, minOut: (amt * 1e18 / p) * (200 + i) / 100
                });
            }
        }
        uint256 g = gasleft();
        IBatchSettler.Clearing memory c = settler.clear(o, p);
        uint256 used = g - gasleft();
        assertEq(c.rounds, 41);
        emit log_named_uint("fork: clear gas, 40 orders, 41 passes", used);
        assertLt(used, 5_000_000);
    }
}
