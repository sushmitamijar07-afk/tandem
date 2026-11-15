// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Fixture} from "./Fixture.sol";
import {Side, IntentStatus, BatchStatus, RefundReason, Intent, Batch} from "../src/interfaces/IBatchTypes.sol";
import {IIntentBook} from "../src/interfaces/IIntentBook.sol";
import {IPriceGuard} from "../src/interfaces/IPriceGuard.sol";
import {IBatchSettler} from "../src/interfaces/IBatchSettler.sol";
import {IntentBook} from "../src/IntentBook.sol";
import {MockPool} from "./mocks/MockPool.sol";
import {MockRouter} from "./mocks/MockRouter.sol";
import {PriceGuard} from "../src/PriceGuard.sol";
import {BatchSettler} from "../src/BatchSettler.sol";

contract IntentBookTest is Fixture {
    // ------------------------------------------------------------------ constructor
    function _expectNewReverts(IntentBook.Params memory a, bytes memory err) internal {
        vm.expectRevert(err);
        new IntentBook(a);
    }

    function test_constructor_revertsOnZeroAddress() public {
        IntentBook.Params memory a;
        for (uint256 i; i < 8; ++i) {
            a = _params();
            if (i == 0) a.musd = address(0);
            if (i == 1) a.btc = address(0);
            if (i == 2) a.router = address(0);
            if (i == 3) a.factory = address(0);
            if (i == 4) a.pool = address(0);
            if (i == 5) a.guard = address(0);
            if (i == 6) a.settler = address(0);
            if (i == 7) a.owner = address(0);
            _expectNewReverts(a, abi.encodeWithSelector(IIntentBook.ZeroAddress.selector));
        }
        vm.expectRevert(abi.encodeWithSelector(IPriceGuard.InvalidParam.selector, bytes32("pool")));
        new PriceGuard(address(0), address(factory), address(feed), address(musd), address(btc), 2, 50, 300);
        vm.expectRevert(abi.encodeWithSelector(IBatchSettler.ZeroAddress.selector));
        new BatchSettler(address(0), address(musd), address(btc));
    }

    function test_constructor_revertsOnParamBounds() public {
        IntentBook.Params memory a = _params();
        a.batchDuration = 29;
        _expectNewReverts(a, abi.encodeWithSelector(IIntentBook.InvalidParam.selector, bytes32("batchDuration")));
        a.batchDuration = 3601;
        _expectNewReverts(a, abi.encodeWithSelector(IIntentBook.InvalidParam.selector, bytes32("batchDuration")));
        a = _params();
        a.settleTimeout = 599;
        _expectNewReverts(a, abi.encodeWithSelector(IIntentBook.InvalidParam.selector, bytes32("settleTimeout")));
        a.settleTimeout = 86401;
        _expectNewReverts(a, abi.encodeWithSelector(IIntentBook.InvalidParam.selector, bytes32("settleTimeout")));
        a = _params();
        a.maxIntents = 1;
        _expectNewReverts(a, abi.encodeWithSelector(IIntentBook.InvalidParam.selector, bytes32("maxIntents")));
        a.maxIntents = 65;
        _expectNewReverts(a, abi.encodeWithSelector(IIntentBook.InvalidParam.selector, bytes32("maxIntents")));
        a = _params();
        a.minMusdIn = 0;
        _expectNewReverts(a, abi.encodeWithSelector(IIntentBook.InvalidParam.selector, bytes32("minMusdIn")));
        a = _params();
        a.minBtcIn = 0;
        _expectNewReverts(a, abi.encodeWithSelector(IIntentBook.InvalidParam.selector, bytes32("minBtcIn")));
        a = _params();
        a.startTime = 0;
        _expectNewReverts(a, abi.encodeWithSelector(IIntentBook.InvalidParam.selector, bytes32("startTime")));
        a.startTime = uint64(block.timestamp + 30 days + 1);
        _expectNewReverts(a, abi.encodeWithSelector(IIntentBook.InvalidParam.selector, bytes32("startTime")));
        // edges are accepted, including a startTime in the past
        a.startTime = uint64(block.timestamp + 30 days);
        new IntentBook(a);
        a.startTime = 1;
        new IntentBook(a);
    }

    function test_constructor_revertsOnWrongPoolOrder() public {
        // router resolves a different pool -> InvalidParam("pool")
        MockPool other = new MockPool(address(musd), address(btc), address(factory));
        MockRouter r2 = new MockRouter(other);
        IntentBook.Params memory a = _params();
        a.router = address(r2);
        _expectNewReverts(a, abi.encodeWithSelector(IIntentBook.InvalidParam.selector, bytes32("pool")));

        // guard / settler built for another pool or other tokens
        PriceGuard g2 =
            new PriceGuard(address(other), address(factory), address(feed), address(musd), address(btc), 2, 50, 300);
        a = _params();
        a.guard = address(g2);
        _expectNewReverts(a, abi.encodeWithSelector(IIntentBook.InvalidParam.selector, bytes32("guard")));
        BatchSettler s2 = new BatchSettler(address(other), address(musd), address(btc));
        a = _params();
        a.settler = address(s2);
        _expectNewReverts(a, abi.encodeWithSelector(IIntentBook.InvalidParam.selector, bytes32("settler")));
        BatchSettler s3 = new BatchSettler(address(pool), address(btc), address(musd));
        a.settler = address(s3);
        _expectNewReverts(a, abi.encodeWithSelector(IIntentBook.InvalidParam.selector, bytes32("settler")));
    }

    // ------------------------------------------------------------------ submit
    function test_submitSellBtc_escrowsNativeAndEmits() public {
        vm.expectEmit(true, true, true, true, address(book));
        emit IIntentBook.IntentSubmitted(1, 0, alice, Side.SellBtc, 1e18, 77_000e18);
        uint256 id = _sellBtc(alice, 1e18, 77_000e18);
        assertEq(id, 1);
        assertEq(address(book).balance, 1e18);
        assertEq(book.escrowed(address(btc)), 1e18);
        Intent memory it = book.getIntent(1);
        assertEq(it.owner, alice);
        assertEq(uint8(it.status), uint8(IntentStatus.Open));
        assertEq(uint8(it.side), uint8(Side.SellBtc));
        assertEq(it.amountIn, 1e18);
        assertEq(it.minOut, 77_000e18);
        Batch memory b = book.getBatch(0);
        assertEq(b.count, 1);
        assertEq(b.live, 1);
        assertEq(b.totalBtcIn, 1e18);
        assertEq(book.batchIntentIds(0)[0], 1);
        assertEq(book.intentsOf(alice)[0], 1);
        assertEq(book.intentCount(), 1);
    }

    function test_submitSellMusd_pullsAndEmits() public {
        uint256 before = musd.balanceOf(bob);
        vm.expectEmit(true, true, true, true, address(book));
        emit IIntentBook.IntentSubmitted(1, 0, bob, Side.SellMusd, 1000e18, 0.012e18);
        uint256 id = _sellMusd(bob, 1000e18, 0.012e18);
        assertEq(id, 1);
        assertEq(musd.balanceOf(address(book)), 1000e18);
        assertEq(before - musd.balanceOf(bob), 1000e18);
        assertEq(book.escrowed(address(musd)), 1000e18);
        assertEq(book.getBatch(0).totalMusdIn, 1000e18);
    }

    function test_submit_revertsBelowMinimum() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(IIntentBook.BelowMinimum.selector, MIN_BTC - 1, MIN_BTC));
        book.submitSellBtc{value: MIN_BTC - 1}(1);
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(IIntentBook.BelowMinimum.selector, MIN_MUSD - 1, MIN_MUSD));
        book.submitSellMusd(MIN_MUSD - 1, 1);
        // exactly the minimum passes
        _sellBtc(alice, MIN_BTC, 1);
        _sellMusd(bob, MIN_MUSD, 1);
    }

    function test_submit_revertsZeroMinOut() public {
        vm.prank(alice);
        vm.expectRevert(IIntentBook.ZeroMinOut.selector);
        book.submitSellBtc{value: 1e18}(0);
        vm.prank(bob);
        vm.expectRevert(IIntentBook.ZeroMinOut.selector);
        book.submitSellMusd(100e18, 0);
    }

    function test_submitSellMusd_revertsWithValue() public {
        // submitSellMusd is non-payable in the frozen interface: native value is rejected outright
        vm.prank(bob);
        (bool ok,) = address(book).call{value: 1}(abi.encodeCall(IIntentBook.submitSellMusd, (100e18, 1)));
        assertFalse(ok);
        assertEq(book.intentCount(), 0);
    }

    function test_submit_revertsAmountTooLarge() public {
        vm.prank(bob);
        vm.expectRevert(IIntentBook.AmountTooLarge.selector);
        book.submitSellMusd(uint256(type(uint128).max) + 1, 1);
        vm.prank(bob);
        vm.expectRevert(IIntentBook.AmountTooLarge.selector);
        book.submitSellMusd(100e18, uint256(type(uint128).max) + 1);
        // total overflow
        musd.mint(bob, type(uint128).max);
        _sellMusd(bob, type(uint128).max - 5, 1);
        vm.prank(bob);
        vm.expectRevert(IIntentBook.AmountTooLarge.selector);
        book.submitSellMusd(100e18, 1);
    }

    function test_submit_revertsWhenPaused() public {
        vm.prank(owner);
        book.setPaused(true);
        vm.prank(alice);
        vm.expectRevert(IIntentBook.SubmitsPaused.selector);
        book.submitSellBtc{value: 1e18}(1);
        vm.prank(bob);
        vm.expectRevert(IIntentBook.SubmitsPaused.selector);
        book.submitSellMusd(100e18, 1);
    }

    function test_submit_revertsBeforeStart() public {
        vm.warp(START - 1);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(IIntentBook.NotStarted.selector, uint256(START)));
        book.submitSellBtc{value: 1e18}(1);
    }

    function test_submit_revertsWhenBatchFull() public {
        for (uint256 i; i < MAX_INTENTS; ++i) {
            _sellBtc(alice, 1e15, 1);
        }
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(IIntentBook.BatchFull.selector, uint256(0), uint256(MAX_INTENTS)));
        book.submitSellBtc{value: 1e15}(1);
        // cancelling frees the slot (audit finding 1/4); the round is full again after one more submit
        vm.prank(alice);
        book.cancel(1);
        assertEq(book.getBatch(0).count, MAX_INTENTS - 1);
        _sellBtc(alice, 1e15, 1);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(IIntentBook.BatchFull.selector, uint256(0), uint256(MAX_INTENTS)));
        book.submitSellBtc{value: 1e15}(1);
        // next round is fresh
        vm.warp(START + DURATION);
        _sellBtc(alice, 1e15, 1);
    }

    function test_submit_atCloseTimestampGoesToNextBatch() public {
        vm.warp(START + DURATION - 1);
        _sellBtc(alice, 1e18, 1);
        assertEq(book.getIntent(1).batchId, 0);
        vm.warp(START + DURATION);
        _sellBtc(alice, 1e18, 1);
        assertEq(book.getIntent(2).batchId, 1);
    }

    function test_currentBatchId_beforeStart_zero() public {
        vm.warp(START - 500);
        assertEq(book.currentBatchId(), 0);
        vm.warp(START);
        assertEq(book.currentBatchId(), 0);
        vm.warp(START + 3 * DURATION + 5);
        assertEq(book.currentBatchId(), 3);
    }

    // ------------------------------------------------------------------ cancel
    function test_cancel_refundsFullBeforeClose() public {
        uint256 balBefore = alice.balance;
        uint256 id = _sellBtc(alice, 1e18, 1);
        vm.expectEmit(true, true, true, true, address(book));
        emit IIntentBook.IntentCancelled(id, 0, alice);
        vm.warp(START + DURATION - 1);
        vm.prank(alice);
        book.cancel(id);
        assertEq(alice.balance, balBefore);
        assertEq(address(book).balance, 0);
        assertEq(book.escrowed(address(btc)), 0);
        Intent memory it = book.getIntent(id);
        assertEq(uint8(it.status), uint8(IntentStatus.Cancelled));
        assertEq(it.refundIn, 1e18);
        Batch memory b = book.getBatch(0);
        assertEq(b.live, 0);
        assertEq(b.count, 0); // cancel frees the slot
        assertEq(b.totalBtcIn, 0);
        assertEq(book.batchIntentIds(0).length, 0);
        assertEq(book.intentsOf(alice).length, 1); // history keeps cancelled intents

        uint256 mid = _sellMusd(bob, 500e18, 1);
        uint256 mb = musd.balanceOf(bob);
        vm.prank(bob);
        book.cancel(mid);
        assertEq(musd.balanceOf(bob), mb + 500e18);
        assertEq(book.escrowed(address(musd)), 0);
    }

    function test_cancel_revertsAfterClose() public {
        uint256 id = _sellBtc(alice, 1e18, 1);
        vm.warp(START + DURATION);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(IIntentBook.BatchClosed.selector, uint256(0), uint256(START + DURATION)));
        book.cancel(id);
    }

    function test_cancel_revertsNotOwner() public {
        uint256 id = _sellBtc(alice, 1e18, 1);
        vm.prank(bob);
        vm.expectRevert(IIntentBook.NotIntentOwner.selector);
        book.cancel(id);
    }

    function test_cancel_revertsTwice() public {
        uint256 id = _sellBtc(alice, 1e18, 1);
        vm.prank(alice);
        book.cancel(id);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(IIntentBook.IntentNotOpen.selector, IntentStatus.Cancelled));
        book.cancel(id);
        // a Filled intent cannot be cancelled either
        uint256 a = _sellBtc(alice, 1e18, 1);
        _sellMusd(bob, 100_000e18, 1);
        _warpToClose(0);
        _settle(0);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(IIntentBook.IntentNotOpen.selector, IntentStatus.Filled));
        book.cancel(a);
    }

    function test_cancel_unknownId_IntentNotOpen() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(IIntentBook.IntentNotOpen.selector, IntentStatus.None));
        book.cancel(0);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(IIntentBook.IntentNotOpen.selector, IntentStatus.None));
        book.cancel(99);
        assertEq(uint8(book.getIntent(0).status), uint8(IntentStatus.None));
        assertEq(uint8(book.getIntent(99).status), uint8(IntentStatus.None));
    }

    // ------------------------------------------------------------------ settle: guards
    function test_settle_revertsBeforeClose() public {
        _sellBtc(alice, 1e18, 1);
        vm.warp(START + DURATION - 1);
        vm.expectRevert(
            abi.encodeWithSelector(IIntentBook.BatchNotClosed.selector, uint256(0), uint256(START + DURATION))
        );
        book.settle(0);
    }

    function test_settle_revertsAfterExpireAt() public {
        _sellBtc(alice, 1e18, 1);
        vm.warp(_expireAt(0));
        vm.expectRevert(abi.encodeWithSelector(IIntentBook.SettleWindowOver.selector, uint256(0), _expireAt(0)));
        book.settle(0);
        // exactly one second earlier it works
        vm.warp(_expireAt(0) - 1);
        book.settle(0);
    }

    function test_settle_revertsTwice() public {
        _sellBtc(alice, 1e18, 1);
        _warpToClose(0);
        _settle(0);
        vm.expectRevert(abi.encodeWithSelector(IIntentBook.BatchNotOpen.selector, BatchStatus.Settled));
        book.settle(0);
    }

    function test_settle_emptyBatchNoPriceReads() public {
        feed.setStale(true); // oracle would revert -> OracleUnavailable if read
        vm.warp(_closeAt(0));
        vm.expectEmit(true, true, false, true, address(book));
        emit IIntentBook.BatchSettled(0, keeper, 0, 0, 0, 0, 0, 0, false, 0, 0, 0, 0, 0);
        _settle(0);
        assertEq(uint8(book.getBatch(0).status), uint8(BatchStatus.Settled));

        // all-cancelled round behaves the same
        uint256 id = _sellBtc(alice, 1e18, 1);
        vm.warp(START + DURATION + 10);
        vm.prank(alice);
        book.cancel(id);
        _warpToClose(1);
        _settle(1);
        assertEq(uint8(book.getBatch(1).status), uint8(BatchStatus.Settled));
    }

    function test_settle_untouchedPastRound_empty() public {
        vm.warp(START + 6 * DURATION);
        assertEq(book.currentBatchId(), 6);
        _settle(5); // round 5 never used
        assertEq(uint8(book.getBatch(5).status), uint8(BatchStatus.Settled));
    }

    function test_settle_invalidBatchId() public {
        vm.expectRevert(abi.encodeWithSelector(IIntentBook.InvalidParam.selector, bytes32("batchId")));
        book.settle(uint256(type(uint64).max) + 1);
        vm.expectRevert(abi.encodeWithSelector(IIntentBook.InvalidParam.selector, bytes32("batchId")));
        book.expire(uint256(type(uint64).max) + 1);
        vm.expectRevert(abi.encodeWithSelector(IIntentBook.InvalidParam.selector, bytes32("batchId")));
        book.preview(uint256(type(uint64).max) + 1);
        vm.expectRevert(abi.encodeWithSelector(IIntentBook.InvalidParam.selector, bytes32("batchId")));
        book.batchTimes(uint256(type(uint64).max) + 1);
    }

    // ------------------------------------------------------------------ settle: clearing paths
    function test_settle_musdExcess_matchesAtMidAndRoutesNet() public {
        uint256 p = _spot();
        uint256 a = _sellBtc(alice, 0.05e18, 1);
        uint256 b = _sellMusd(bob, 4000e18, 1);
        _warpToClose(0);
        uint256 aliceMusd = musd.balanceOf(alice);
        uint256 bobBtc = bob.balance;
        _settle(0);

        uint256 aOut = 0.05e18 * p / 1e18; // BTC seller at mid
        Intent memory ia = book.getIntent(a);
        assertEq(ia.amountOut, aOut);
        assertEq(musd.balanceOf(alice) - aliceMusd, aOut);
        uint256 net = 4000e18 - aOut;
        uint256 netOut = pool.getAmountOut(net, address(musd)); // pre-swap quote is gone, recompute below
        Batch memory bt = book.getBatch(0);
        assertEq(bt.routedIn, net);
        assertFalse(bt.routedBtc);
        assertEq(router.swapCalls(), 1);
        Intent memory ib = book.getIntent(b);
        assertEq(ib.amountOut, 0.05e18 + bt.routedOut);
        assertEq(bob.balance - bobBtc, ib.amountOut);
        assertEq(uint8(ib.status), uint8(IntentStatus.Filled));
        assertEq(bt.priceBtcSide, p);
        assertGt(bt.priceMusdSide, 0);
        assertGt(netOut, 0);
        assertEq(book.escrowed(address(musd)), 0);
        assertEq(book.escrowed(address(btc)), 0);
    }

    function test_settle_btcExcess_routesBtcViaPrecompileApprove() public {
        uint256 p = _spot();
        uint256 a = _sellBtc(alice, 1e18, 1);
        uint256 b = _sellMusd(bob, 20_000e18, 1);
        _warpToClose(0);
        uint256 quote = pool.getAmountOut(1e18 - (20_000e18 * 1e18 / p), address(btc));
        _settle(0);

        Batch memory bt = book.getBatch(0);
        assertTrue(bt.routedBtc);
        assertEq(bt.routedIn, 1e18 - (20_000e18 * 1e18 / p));
        assertEq(bt.routedOut, quote);
        assertEq(router.swapCalls(), 1);
        // the router pulled BTC with transferFrom on the precompile ERC-20 -> approve happened and was fully used
        assertEq(btc.allowance(address(book), address(router)), 0);
        assertEq(book.getIntent(b).amountOut, 20_000e18 * 1e18 / p);
        assertEq(book.getIntent(a).amountOut, 20_000e18 + quote);
    }

    function test_settle_exactBalance_noRouterCall() public {
        uint256 p = _spot();
        uint256 a = _sellBtc(alice, 1e18, 1);
        uint256 b = _sellMusd(bob, p, 1);
        _warpToClose(0);
        _settle(0);
        assertEq(router.swapCalls(), 0);
        Batch memory bt = book.getBatch(0);
        assertEq(bt.routedIn, 0);
        assertEq(bt.routedOut, 0);
        assertEq(book.getIntent(a).amountOut, p);
        assertEq(book.getIntent(b).amountOut, 1e18);
        assertEq(address(book).balance, 0);
        assertEq(musd.balanceOf(address(book)), 0);
    }

    function test_settle_oneSidedMusd_equalsAloneQuote() public {
        uint256 alone = pool.getAmountOut(500e18, address(musd));
        uint256 id = _sellMusd(bob, 500e18, 1);
        _warpToClose(0);
        uint256 before = bob.balance;
        _settle(0);
        assertEq(book.getIntent(id).amountOut, alone);
        assertEq(bob.balance - before, alone);
        assertEq(book.getBatch(0).routedIn, 500e18);
    }

    function _example1() internal returns (uint256 a, uint256 b, uint256 c) {
        a = _sellBtc(alice, 0.05e18, 3880e18);
        b = _sellMusd(bob, 3000e18, 0.038e18);
        c = _sellMusd(carol, 1000e18, 0.0128e18);
    }

    function test_settle_refundsTightMinOut_andFlipsDirection() public {
        // brief §6.3 example 1, real reserves, to the wei (expected values computed independently in Python)
        assertEq(_spot(), 78222484473804130513824);
        (uint256 a, uint256 b, uint256 c) = _example1();
        _warpToClose(0);
        uint256 aliceM = musd.balanceOf(alice);
        uint256 bobB = bob.balance;
        uint256 carolM = musd.balanceOf(carol);
        uint256 carolB = carol.balance;
        _settle(0);

        Intent memory ia = book.getIntent(a);
        Intent memory ib = book.getIntent(b);
        Intent memory ic = book.getIntent(c);
        // B (Y side at mid): 0.038352144 BTC; alone it would get 0.038335679
        assertEq(ib.amountOut, 38352144146030899);
        assertEq(ib.refundIn, 0);
        // A (X side): 3,910.751662 MUSD; alone 3,909.410307
        assertEq(ia.amountOut, 3910751662331430998202);
        // C is refunded in full
        assertEq(uint8(ic.status), uint8(IntentStatus.Refunded));
        assertEq(ic.refundIn, 1000e18);
        assertEq(ic.amountOut, 0);

        assertEq(musd.balanceOf(alice) - aliceM, 3910751662331430998202);
        assertEq(bob.balance - bobB, 38352144146030899);
        assertEq(musd.balanceOf(carol) - carolM, 1000e18);
        assertEq(carol.balance, carolB);

        Batch memory bt = book.getBatch(0);
        assertTrue(bt.routedBtc); // direction flipped to BTC excess
        assertEq(bt.routedIn, 11647855853969101); // 0.011647856 BTC
        assertEq(bt.routedOut, 910751662331430998202); // 910.751662 MUSD
        assertEq(bt.refPrice, 78222484473804130513824);
        assertEq(bt.priceMusdSide, 78222484473804130513824);
        assertEq(router.swapCalls(), 1);
        // kept vs alone: B +16,465,093,... wei BTC, A +1.341355 MUSD
        assertEq(ib.amountOut - 38335679053412706, 16465092618193);
        assertEq(ia.amountOut - 3909410306926059474463, 1341355405371523739);
        // no dust: both books are empty
        assertEq(musd.balanceOf(address(book)), 0);
        assertEq(address(book).balance, 0);
    }

    function test_settle_allRefunded_noRouterCall() public {
        uint256 a = _sellBtc(alice, 1e18, 1_000_000e18);
        uint256 b = _sellMusd(bob, 1000e18, 100e18);
        _warpToClose(0);
        uint256 aliceB = alice.balance;
        _settle(0);
        assertEq(router.swapCalls(), 0);
        assertEq(uint8(book.getIntent(a).status), uint8(IntentStatus.Refunded));
        assertEq(uint8(book.getIntent(b).status), uint8(IntentStatus.Refunded));
        assertEq(alice.balance, aliceB + 1e18);
        assertEq(uint8(book.getBatch(0).status), uint8(BatchStatus.Settled));
        assertEq(book.getBatch(0).routedIn, 0);
        assertEq(address(book).balance, 0);
        assertEq(musd.balanceOf(address(book)), 0);
    }

    function test_settle_unroutableDust_partialRefundIn() public {
        // thin-BTC pool: a 5 wei MUSD remainder quotes to 0 BTC
        pool.setReserves(7.8e16, 1e12);
        pool.setTwap(7.8e22);
        feed.setPrice(78_000e18);
        uint256 p = _spot();
        assertEq(p, 7.8e22);
        assertEq(pool.getAmountOut(5, address(musd)), 0);
        uint256 sellBtc = 1e15;
        uint256 musdIn = (sellBtc * p / 1e18) + 5;
        uint256 a = _sellBtc(alice, sellBtc, 1);
        uint256 b = _sellMusd(bob, musdIn, 1);
        _warpToClose(0);
        uint256 bobM = musd.balanceOf(bob);
        uint256 bobB = bob.balance;
        _settle(0);
        assertEq(router.swapCalls(), 0);
        Batch memory bt = book.getBatch(0);
        assertEq(bt.routedIn, 0);
        assertEq(bt.routedOut, 0);
        Intent memory ib = book.getIntent(b);
        assertEq(ib.refundIn, 5);
        assertEq(ib.amountOut, sellBtc);
        assertEq(musd.balanceOf(bob) - bobM, 5);
        assertEq(bob.balance - bobB, sellBtc);
        assertEq(book.getIntent(a).amountOut, sellBtc * p / 1e18);
        assertEq(address(book).balance, 0);
        assertEq(musd.balanceOf(address(book)), 0);
    }

    function test_settle_revertsSpotTwapDeviation() public {
        _sellBtc(alice, 1e18, 1);
        _sellMusd(bob, 1000e18, 1);
        pool.setTwap(_spot() * 99 / 100); // spot ~ 101 bps above twap (limit 50)
        _warpToClose(0);
        vm.expectPartialRevert(IPriceGuard.SpotTwapDeviation.selector);
        book.settle(0);
        // equality passes: exactly 50 bps -> ceil(|s-t|*1e4/t) == 50
        pool.setTwap(_spot() * 10_000 / 10_050);
        uint256 s = _spot();
        uint256 t = (s * 10_000 / 10_050) / 100 * 100;
        pool.setTwap(t);
        IPriceGuard.Prices memory pr = guard.read();
        if (pr.spotTwapBps <= 50) _settle(0);
    }

    function test_settle_revertsOracleDeviation() public {
        _sellBtc(alice, 1e18, 1);
        _sellMusd(bob, 1000e18, 1);
        feed.setPrice(60_000e18); // far outside the 300 bps band
        _warpToClose(0);
        vm.expectPartialRevert(IPriceGuard.OracleDeviation.selector);
        book.settle(0);
    }

    function test_settle_revertsOracleStale_OracleUnavailable() public {
        _sellBtc(alice, 1e18, 1);
        feed.setStale(true);
        _warpToClose(0);
        vm.expectRevert(IPriceGuard.OracleUnavailable.selector);
        book.settle(0);
    }

    function test_settle_revertsPoolPaused_whenRoutingNeeded() public {
        _sellMusd(bob, 1000e18, 1); // one-sided -> needs the Router
        factory.setPaused(true);
        _warpToClose(0);
        vm.expectRevert(IIntentBook.PoolPaused.selector);
        book.settle(0);
        vm.expectRevert(IIntentBook.PoolPaused.selector);
        book.preview(0);
    }

    function test_settle_fullyMatched_succeedsEvenIfPoolPaused() public {
        uint256 p = _spot();
        _sellBtc(alice, 1e18, 1);
        _sellMusd(bob, p, 1);
        factory.setPaused(true);
        _warpToClose(0);
        _settle(0);
        assertEq(uint8(book.getBatch(0).status), uint8(BatchStatus.Settled));
    }

    function test_settle_failedPushCreditsClaimable() public {
        uint256 p = _spot();
        uint256 a = _sellBtc(alice, 1e18, 1);
        _sellMusd(bob, 90_000e18, 1);
        musd.setBlocked(alice, true); // alice's MUSD payout will revert
        _warpToClose(0);
        vm.expectEmit(true, true, false, false, address(book));
        emit IIntentBook.PayoutDeferred(alice, address(musd), 0);
        _settle(0);
        uint256 owed = book.getIntent(a).amountOut;
        assertGt(owed, p / 2);
        assertEq(book.claimable(alice, address(musd)), owed);
        assertEq(book.totalClaimable(address(musd)), owed);
        assertEq(uint8(book.getBatch(0).status), uint8(BatchStatus.Settled));
        assertGe(musd.balanceOf(address(book)), book.totalClaimable(address(musd)));
        // bob still got paid
        assertGt(bob.balance, 1000e18);
    }

    // ------------------------------------------------------------------ claim / expire / pause / owner
    function test_claim_paysAndZeroes() public {
        _sellBtc(alice, 1e18, 1);
        _sellMusd(bob, 90_000e18, 1);
        musd.setBlocked(alice, true);
        _warpToClose(0);
        _settle(0);
        uint256 owed = book.claimable(alice, address(musd));
        assertGt(owed, 0);
        // still blocked: claim reverts and keeps the credit
        vm.prank(alice);
        vm.expectRevert();
        book.claim(address(musd));
        assertEq(book.claimable(alice, address(musd)), owed);
        musd.setBlocked(alice, false);
        uint256 before = musd.balanceOf(alice);
        vm.expectEmit(true, true, false, true, address(book));
        emit IIntentBook.Claimed(alice, address(musd), owed);
        vm.prank(alice);
        assertEq(book.claim(address(musd)), owed);
        assertEq(musd.balanceOf(alice) - before, owed);
        assertEq(book.claimable(alice, address(musd)), 0);
        assertEq(book.totalClaimable(address(musd)), 0);
    }

    function test_claim_revertsNothing() public {
        vm.prank(alice);
        vm.expectRevert(IIntentBook.NothingToClaim.selector);
        book.claim(address(musd));
        vm.prank(alice);
        vm.expectRevert(IIntentBook.NothingToClaim.selector);
        book.claim(address(0xdead));
    }

    function test_expire_refundsAll() public {
        uint256 a = _sellBtc(alice, 1e18, 1);
        uint256 b = _sellMusd(bob, 500e18, 1);
        uint256 c = _sellBtc(carol, 1e18, 1);
        vm.prank(carol);
        book.cancel(c);
        uint256 aliceB = alice.balance;
        uint256 bobM = musd.balanceOf(bob);
        vm.warp(_expireAt(0));
        vm.expectEmit(true, true, false, true, address(book));
        emit IIntentBook.IntentRefunded(a, 0, alice, 1e18, RefundReason.Expired);
        vm.expectEmit(true, true, false, true, address(book));
        emit IIntentBook.BatchExpired(0, keeper);
        vm.prank(keeper);
        book.expire(0);
        assertEq(alice.balance, aliceB + 1e18);
        assertEq(musd.balanceOf(bob), bobM + 500e18);
        assertEq(uint8(book.getIntent(a).status), uint8(IntentStatus.Refunded));
        assertEq(uint8(book.getIntent(b).status), uint8(IntentStatus.Refunded));
        assertEq(uint8(book.getIntent(c).status), uint8(IntentStatus.Cancelled));
        Batch memory bt = book.getBatch(0);
        assertEq(uint8(bt.status), uint8(BatchStatus.Expired));
        assertEq(bt.live, 0);
        assertEq(bt.totalBtcIn, 1e18); // frozen (alice only; carol cancelled before)
        assertEq(book.escrowed(address(btc)), 0);
        assertEq(book.escrowed(address(musd)), 0);
        assertEq(address(book).balance, 0);
        // terminal
        vm.expectRevert(abi.encodeWithSelector(IIntentBook.BatchNotOpen.selector, BatchStatus.Expired));
        book.expire(0);
        vm.expectRevert(abi.encodeWithSelector(IIntentBook.BatchNotOpen.selector, BatchStatus.Expired));
        book.settle(0);
    }

    function test_expire_revertsBeforeExpireAt() public {
        _sellBtc(alice, 1e18, 1);
        vm.warp(_expireAt(0) - 1);
        vm.expectRevert(abi.encodeWithSelector(IIntentBook.SettleWindowNotOver.selector, uint256(0), _expireAt(0)));
        book.expire(0);
    }

    function test_expire_emptyRound() public {
        vm.warp(_expireAt(0));
        vm.recordLogs();
        book.expire(0);
        assertEq(vm.getRecordedLogs().length, 1); // only BatchExpired
        assertEq(uint8(book.getBatch(0).status), uint8(BatchStatus.Expired));
    }

    function test_pause_doesNotBlockCancelSettleExpireClaim() public {
        // round 0: settle works while paused; round 1: expire works; claim works
        uint256 a = _sellBtc(alice, 1e18, 1);
        _sellMusd(bob, 90_000e18, 1);
        uint256 c = _sellBtc(carol, 1e18, 1);
        musd.setBlocked(alice, true);
        vm.prank(owner);
        book.setPaused(true);
        vm.prank(carol);
        book.cancel(c);
        _warpToClose(0);
        _settle(0);
        assertEq(uint8(book.getBatch(0).status), uint8(BatchStatus.Settled));
        assertGt(book.claimable(alice, address(musd)), 0);
        musd.setBlocked(alice, false);
        vm.prank(alice);
        book.claim(address(musd));
        // expire in a later round: unpause, submit, pause, expire
        vm.warp(START + 3 * DURATION);
        vm.prank(owner);
        book.setPaused(false);
        uint256 d = _sellBtc(alice, 1e18, 1);
        vm.prank(owner);
        book.setPaused(true);
        vm.warp(_expireAt(3));
        book.expire(3);
        assertEq(uint8(book.getIntent(d).status), uint8(IntentStatus.Refunded));
        assertEq(a, 1);
    }

    function test_owner_hasNoFundPath() public {
        _sellBtc(alice, 1e18, 1);
        _sellMusd(bob, 1000e18, 1);
        uint256 bBtc = address(book).balance;
        uint256 bMusd = musd.balanceOf(address(book));

        // non-owner cannot touch any owner function
        vm.prank(alice);
        vm.expectRevert();
        book.setPaused(true);
        vm.prank(alice);
        vm.expectRevert();
        book.transferOwnership(alice);

        // the owner calls every owner function that exists; nothing moves
        vm.startPrank(owner);
        book.setPaused(true);
        book.setPaused(false);
        book.transferOwnership(carol);
        vm.stopPrank();
        vm.prank(carol);
        book.acceptOwnership();
        vm.prank(carol);
        book.renounceOwnership();
        assertEq(book.owner(), address(0));
        assertEq(address(book).balance, bBtc);
        assertEq(musd.balanceOf(address(book)), bMusd);

        // probe plausible fund-moving / config selectors: none exist (no fallback, so each call reverts)
        string[14] memory sigs = [
            "sweep(address)",
            "sweep(address,uint256)",
            "withdraw(address,uint256)",
            "rescue(address,address,uint256)",
            "rescueFunds(address)",
            "setFee(uint256)",
            "setFeeRecipient(address)",
            "setRouter(address)",
            "setGuard(address)",
            "setSettler(address)",
            "upgradeTo(address)",
            "upgradeToAndCall(address,bytes)",
            "emergencyWithdraw()",
            "skim(address)"
        ];
        for (uint256 i; i < sigs.length; ++i) {
            vm.prank(owner);
            (bool ok,) = address(book).call(abi.encodeWithSignature(sigs[i], address(this), uint256(1)));
            assertFalse(ok);
            vm.prank(carol);
            (ok,) = address(book).call(abi.encodeWithSignature(sigs[i], address(this), uint256(1)));
            assertFalse(ok);
        }
        // no receive / fallback: plain native sends revert
        (bool sent,) = address(book).call{value: 1}("");
        assertFalse(sent);
        assertEq(address(book).balance, bBtc);
    }

    function test_owner_transferOwnership2Step() public {
        vm.prank(owner);
        book.transferOwnership(bob);
        assertEq(book.owner(), owner);
        vm.prank(bob);
        book.acceptOwnership();
        assertEq(book.owner(), bob);
    }

    // ------------------------------------------------------------------ preview / router
    function test_preview_openRoundNoTimeCheck() public {
        _sellBtc(alice, 0.05e18, 1);
        _sellMusd(bob, 4000e18, 1);
        // round still open: preview works with no time check
        (IBatchSettler.Clearing memory c, IPriceGuard.Prices memory p) = book.preview(0);
        assertEq(c.fills.length, 2);
        assertEq(p.spot, _spot());
        assertGt(c.routeIn, 0);
    }

    function test_preview_emptyRound_zeroStructsNoReads() public {
        feed.setStale(true);
        (IBatchSettler.Clearing memory c, IPriceGuard.Prices memory p) = book.preview(0);
        assertEq(c.fills.length, 0);
        assertEq(p.spot, 0);
    }

    function test_preview_matchesSettleOutcome() public {
        (uint256 a, uint256 b, uint256 c) = _example1();
        (IBatchSettler.Clearing memory cl, IPriceGuard.Prices memory pr) = book.preview(0);
        _warpToClose(0);
        (cl, pr) = book.preview(0);
        _settle(0);
        assertEq(cl.fills.length, 3);
        assertEq(cl.fills[0].id, a);
        assertEq(cl.fills[1].id, b);
        assertEq(cl.fills[2].id, c);
        for (uint256 i; i < 3; ++i) {
            Intent memory it = book.getIntent(cl.fills[i].id);
            assertEq(it.amountOut, cl.fills[i].amountOut);
            assertEq(it.refundIn, cl.fills[i].refundIn);
            assertEq(it.status == IntentStatus.Filled, cl.fills[i].filled);
        }
        Batch memory bt = book.getBatch(0);
        assertEq(bt.routedIn, cl.routeIn);
        assertEq(bt.routedOut, cl.routeOut);
        assertEq(bt.refPrice, pr.spot);
        assertEq(cl.rounds, 2);
        vm.expectRevert(abi.encodeWithSelector(IIntentBook.BatchNotOpen.selector, BatchStatus.Settled));
        book.preview(0);
    }

    function test_routerOutMismatch_reverts() public {
        _sellMusd(bob, 1000e18, 1);
        router.setShortChange(1);
        _warpToClose(0);
        vm.expectPartialRevert(IIntentBook.RouterOutMismatch.selector);
        book.settle(0);
        // all state rolled back
        assertEq(uint8(book.getBatch(0).status), uint8(BatchStatus.Open));
        assertEq(book.escrowed(address(musd)), 1000e18);
    }

    // ------------------------------------------------------------------ gas

    // ------------------------------------------------------------------ audit regressions
    function test_audit_cancelFreesSlot() public {
        for (uint256 i; i < MAX_INTENTS; ++i) {
            uint256 id = _sellBtc(alice, 1e15, 1);
            vm.prank(alice);
            book.cancel(id);
        }
        assertEq(book.getBatch(0).count, 0);
        assertEq(book.batchIntentIds(0).length, 0);
        assertEq(book.intentsOf(alice).length, MAX_INTENTS); // history kept
        uint256 honest = _sellMusd(bob, 100e18, 1);
        assertEq(uint8(book.getIntent(honest).status), uint8(IntentStatus.Open));
        assertEq(book.batchIntentIds(0).length, 1);
    }

    function test_audit_roundStillFullWith40OpenIntents() public {
        for (uint256 i; i < MAX_INTENTS; ++i) {
            _sellBtc(alice, 1e15, 1);
        }
        assertEq(book.getBatch(0).count, MAX_INTENTS);
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(IIntentBook.BatchFull.selector, uint256(0), uint256(MAX_INTENTS)));
        book.submitSellBtc{value: 1e15}(1);
    }

    function test_audit_cancelMiddle_settlePaysRightOwners() public {
        uint256 a = _sellBtc(alice, 0.05e18, 1);
        uint256 b = _sellMusd(bob, 3000e18, 1);
        uint256 c = _sellBtc(carol, 0.03e18, 1);
        uint256 d = _sellMusd(bob, 1000e18, 1);
        vm.prank(bob);
        book.cancel(b); // middle: d is swapped into its slot
        uint256[] memory ids = book.batchIntentIds(0);
        assertEq(ids.length, 3);
        assertEq(ids[0], a);
        assertEq(ids[1], d);
        assertEq(ids[2], c);
        assertEq(book.getBatch(0).count, 3);
        assertEq(book.getBatch(0).live, 3);

        uint256 aliceM = musd.balanceOf(alice);
        uint256 carolM = musd.balanceOf(carol);
        uint256 bobB = bob.balance;
        uint256 bobM = musd.balanceOf(bob);
        _warpToClose(0);
        _settle(0);
        Intent memory ia = book.getIntent(a);
        Intent memory ib = book.getIntent(b);
        Intent memory ic = book.getIntent(c);
        Intent memory id_ = book.getIntent(d);
        assertEq(uint8(ib.status), uint8(IntentStatus.Cancelled));
        assertEq(uint8(ia.status), uint8(IntentStatus.Filled));
        assertEq(uint8(ic.status), uint8(IntentStatus.Filled));
        assertEq(uint8(id_.status), uint8(IntentStatus.Filled));
        assertEq(musd.balanceOf(alice) - aliceM, ia.amountOut);
        assertEq(musd.balanceOf(carol) - carolM, ic.amountOut);
        assertEq(bob.balance - bobB, id_.amountOut);
        assertEq(musd.balanceOf(bob), bobM); // bob's cancel refund was paid at cancel time, nothing more
        assertEq(book.getBatch(0).count, 3);
    }

    /// @dev Finding 2: a dust refund set while an order is on the excess side must not survive a side flip.
    function test_audit_staleRefundAfterFlip_settles() public {
        _deployAll(7_800_000e18, 100e18, 300); // spot 78,000 MUSD/BTC
        _fund(alice);
        _fund(bob);
        _fund(carol);
        _sellBtc(alice, 2.6e14, 1);
        uint256 b = _sellMusd(bob, 1e19, 1);
        uint256 c = _sellMusd(carol, 1.028e19 + 5e4, 2e14);
        _warpToClose(0);
        (IBatchSettler.Clearing memory pc,) = book.preview(0);
        assertEq(pc.rounds, 2);
        assertFalse(pc.fills[2].filled);
        assertTrue(pc.fills[1].filled);
        assertEq(pc.fills[1].refundIn, 0);
        _settle(0); // reverted with Conservation(MUSD) before the fix
        assertEq(book.getIntent(b).refundIn, 0);
        assertEq(uint8(book.getIntent(c).status), uint8(IntentStatus.Refunded));
        assertEq(uint8(book.getBatch(0).status), uint8(BatchStatus.Settled));
    }

    function _mixedIntents(uint256 n) internal {
        for (uint256 i; i < n; ++i) {
            if (i % 2 == 0) _sellBtc(alice, 0.01e18 + i * 1e12, 1);
            else _sellMusd(bob, 700e18 + i * 1e15, 1);
        }
    }

    function test_gas_settle_maxIntents() public {
        _mixedIntents(40);
        assertEq(book.getBatch(0).count, 40);
        _warpToClose(0);
        vm.prank(keeper);
        uint256 g = gasleft();
        book.settle(0);
        uint256 used = g - gasleft();
        emit log_named_uint("settle gas, 40 mixed intents", used);
        assertLt(used, 5_000_000);
    }

    /// @dev Worst case for the one-removal-per-pass rule: all 40 orders fail, one is removed per pass, so the
    ///      settler runs 41 passes. Every order asks for 2x its mid-rate output with a different shortfall, so each
    ///      pass still fails on every remaining order.
    function test_gas_worstCaseCascade() public {
        uint256 p = _spot();
        IBatchSettler.Order[] memory o = _allFailBook(p);
        for (uint256 i; i < o.length; ++i) {
            if (o[i].side == Side.SellBtc) _sellBtc(alice, o[i].amountIn, o[i].minOut);
            else _sellMusd(bob, o[i].amountIn, o[i].minOut);
        }
        _warpToClose(0);
        (IBatchSettler.Clearing memory pc,) = book.preview(0);
        assertEq(pc.rounds, 41);
        uint256 g = gasleft();
        _settle(0);
        uint256 used = g - gasleft();
        emit log_named_uint("worst-case cascade rounds", pc.rounds);
        emit log_named_uint("worst-case cascade settle gas, 40 intents, 41 passes", used);
        uint256 g2 = gasleft();
        settler.clear(o, p);
        emit log_named_uint("BatchSettler.clear gas for that book", g2 - gasleft());
        assertLt(used, 5_000_000);
    }

    function _allFailBook(uint256 p) internal pure returns (IBatchSettler.Order[] memory o) {
        o = new IBatchSettler.Order[](40);
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
    }
}
