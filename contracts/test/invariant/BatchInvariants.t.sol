// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {StdInvariant} from "forge-std/StdInvariant.sol";
import {Fixture} from "../Fixture.sol";
import {BatchHandler} from "./BatchHandler.sol";
import {IntentStatus, Intent} from "../../src/interfaces/IBatchTypes.sol";
import {IntentBook} from "../../src/IntentBook.sol";

/// @notice Brief §8 invariants I1-I9 against mocks. Short rounds (60 s) and the minimum settle timeout (600 s) so the
///         handler can reach settle, expire and claim within depth 100.
contract BatchInvariants is StdInvariant, Fixture {
    BatchHandler internal handler;

    function setUp() public override {
        super.setUp();
        IntentBook.Params memory a = _params();
        a.batchDuration = 60;
        a.settleTimeout = 600;
        book = new IntentBook(a);

        address[5] memory actors = [alice, bob, carol, makeAddr("dave"), makeAddr("erin")];
        for (uint256 i; i < 5; ++i) {
            vm.deal(actors[i], 1_000e18);
            musd.mint(actors[i], 1_000_000_000e18);
            vm.prank(actors[i]);
            musd.approve(address(book), type(uint256).max);
        }
        handler = new BatchHandler(book, pool, feed, musd, btc, owner, actors);
        targetContract(address(handler));
    }

    function _owed(address token) internal view returns (uint256) {
        return book.escrowed(token) + book.totalClaimable(token);
    }

    /// I1 solvency
    function invariant_I1_solvency() public view {
        assertGe(address(book).balance, _owed(address(btc)));
        assertEq(address(book).balance, btc.balanceOf(address(book)));
        assertGe(musd.balanceOf(address(book)), _owed(address(musd)));
    }

    /// I2 every Filled intent got at least its minOut
    function invariant_I2_minOut() public view {
        uint256 n = book.intentCount();
        for (uint256 id = 1; id <= n; ++id) {
            Intent memory it = book.getIntent(id);
            if (it.status == IntentStatus.Filled) assertGe(it.amountOut, it.minOut);
        }
    }

    /// I3 uniform price per side, recomputed from the avail / S ghosts
    function invariant_I3_uniformPrice() public view {
        assertEq(handler.vUniform(), 0);
    }

    /// I4 deficit side exactly at mid, excess side never better
    function invariant_I4_yAtMid_xNotBetter() public view {
        assertEq(handler.vMid(), 0);
    }

    /// I5 per-round conservation with dust <= number of fills
    function invariant_I5_conservation() public view {
        assertEq(handler.vConserve(), 0);
    }

    /// I6 terminal states never change; a round settles at most once
    function invariant_I6_terminalStates() public view {
        assertEq(handler.vTerminal(), 0);
    }

    /// I7 whatever the book holds beyond what it owes is bounded by the recorded dust plus donations
    function invariant_I7_dustBound() public view {
        uint256 exM = musd.balanceOf(address(book)) - _owed(address(musd));
        uint256 exB = address(book).balance - _owed(address(btc));
        assertLe(exM, handler.ghostDustMusd() + handler.ghostDonMusd());
        assertLe(exB, handler.ghostDustBtc() + handler.ghostDonBtc());
    }

    /// I8 random owner calls never change a balance or an intent
    function invariant_I8_ownerPowerless() public view {
        assertEq(handler.vOwner(), 0);
    }

    /// I9 no intent was cancelled at or after its round's close
    function invariant_I9_cancelTiming() public view {
        uint256 n = handler.cancelledCount();
        for (uint256 i; i < n; ++i) {
            uint256 id = handler.cancelledAt(i);
            Intent memory it = book.getIntent(id);
            (, uint256 closeAt,) = book.batchTimes(it.batchId);
            assertLt(handler.cancelTs(id), closeAt);
        }
    }

    /// Coverage counters of the last run (visible with -vv): a run that never settles anything proves nothing.
    function afterInvariant() public {
        emit log_named_uint("settled", handler.nSettled());
        emit log_named_uint("routed", handler.nRouted());
        emit log_named_uint("refunded fills", handler.nRefunds());
        emit log_named_uint("expired", handler.nExpired());
        emit log_named_uint("cancelled", handler.nCancelled());
        emit log_named_uint("intents", book.intentCount());
        emit log_named_uint("dust musd", handler.ghostDustMusd());
        emit log_named_uint("deferred musd", book.totalClaimable(address(musd)));
    }
}
