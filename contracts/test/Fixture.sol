// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {Side, IntentStatus, Intent, Batch} from "../src/interfaces/IBatchTypes.sol";
import {PriceGuard} from "../src/PriceGuard.sol";
import {BatchSettler} from "../src/BatchSettler.sol";
import {IntentBook} from "../src/IntentBook.sol";
import {IPriceGuard} from "../src/interfaces/IPriceGuard.sol";
import {IBatchSettler} from "../src/interfaces/IBatchSettler.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {MockNativeBtc} from "./mocks/MockNativeBtc.sol";
import {MockPool} from "./mocks/MockPool.sol";
import {MockRouter} from "./mocks/MockRouter.sol";
import {MockFactory} from "./mocks/MockFactory.sol";
import {MockPriceFeed} from "./mocks/MockPriceFeed.sol";

/// @notice Shared wiring for unit tests: mocks, real reserves from docs/FACTS.md, three real contracts.
abstract contract Fixture is Test {
    // real testnet reserves (docs/FACTS.md) and fee
    uint256 internal constant R0 = 102257124585249121862151778;
    uint256 internal constant R1 = 1307259994017371489267;

    uint64 internal constant START = 1_000_000;
    uint32 internal constant DURATION = 120;
    uint32 internal constant TIMEOUT = 7200;
    uint16 internal constant MAX_INTENTS = 40;
    uint128 internal constant MIN_MUSD = 10e18;
    uint128 internal constant MIN_BTC = 1e14;

    MockERC20 internal musd;
    MockNativeBtc internal btc;
    MockFactory internal factory;
    MockPool internal pool;
    MockRouter internal router;
    MockPriceFeed internal feed;
    PriceGuard internal guard;
    BatchSettler internal settler;
    IntentBook internal book;

    address internal owner = makeAddr("owner");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal carol = makeAddr("carol");
    address internal keeper = makeAddr("keeper");

    function setUp() public virtual {
        vm.warp(START);
        _deployAll(R0, R1, 300);
        _fund(alice);
        _fund(bob);
        _fund(carol);
    }

    function _deployAll(uint256 r0, uint256 r1, uint256 bandBps) internal {
        musd = new MockERC20("Mezo USD", "MUSD");
        btc = new MockNativeBtc();
        factory = new MockFactory();
        pool = new MockPool(address(musd), address(btc), address(factory));
        pool.setReserves(r0, r1);
        uint256 spot = r0 * 1e18 / r1;
        pool.setTwap(spot);
        router = new MockRouter(pool);
        feed = new MockPriceFeed(spot - (spot % 1e18)); // oracle ~ spot
        guard =
            new PriceGuard(address(pool), address(factory), address(feed), address(musd), address(btc), 2, 50, bandBps);
        settler = new BatchSettler(address(pool), address(musd), address(btc));
        book = new IntentBook(_params());
    }

    function _params() internal view returns (IntentBook.Params memory a) {
        a = IntentBook.Params({
            musd: address(musd),
            btc: address(btc),
            router: address(router),
            factory: address(factory),
            pool: address(pool),
            guard: address(guard),
            settler: address(settler),
            startTime: START,
            batchDuration: DURATION,
            settleTimeout: TIMEOUT,
            maxIntents: MAX_INTENTS,
            minMusdIn: MIN_MUSD,
            minBtcIn: MIN_BTC,
            owner: owner
        });
    }

    function _fund(address who) internal {
        vm.deal(who, 1000e18);
        musd.mint(who, 10_000_000e18);
        vm.prank(who);
        musd.approve(address(book), type(uint256).max);
    }

    // ------------------------------------------------------------------ helpers
    function _sellBtc(address who, uint256 amt, uint256 minOut) internal returns (uint256 id) {
        vm.prank(who);
        id = book.submitSellBtc{value: amt}(minOut);
    }

    function _sellMusd(address who, uint256 amt, uint256 minOut) internal returns (uint256 id) {
        vm.prank(who);
        id = book.submitSellMusd(amt, minOut);
    }

    function _closeAt(uint256 batchId) internal view returns (uint256 c) {
        (, c,) = book.batchTimes(batchId);
    }

    function _expireAt(uint256 batchId) internal view returns (uint256 e) {
        (,, e) = book.batchTimes(batchId);
    }

    function _warpToClose(uint256 batchId) internal {
        vm.warp(_closeAt(batchId));
    }

    function _settle(uint256 batchId) internal {
        vm.prank(keeper);
        book.settle(batchId);
    }

    function _spot() internal view returns (uint256) {
        (uint256 r0, uint256 r1,) = pool.getReserves();
        return r0 * 1e18 / r1;
    }
}
