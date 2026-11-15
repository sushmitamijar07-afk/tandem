// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IMezoRouter} from "../src/external/IMezoRouter.sol";
import {IIntentBook} from "../src/interfaces/IIntentBook.sol";

/// @notice Phased demo driver (SPEC D39, docs/DEMO.md). A forge script cannot wait for a round to close between
///         broadcasts, so it runs one PHASE at a time. Always run with:
///           --rpc-url $R --broadcast --skip-simulation --gas-estimate-multiplier 150
///         (the BTC token and oracle are precompiles, absent from local simulation).
///
///   PHASE=fund   PRIVATE_KEY=0x... W1_ADDR W2_ADDR W3_ADDR         buy MUSD on the pool, fund the three wallets
///   PHASE=submit W1_KEY=0x... W2_KEY=0x... W3_KEY=0x...            the three submits of brief §6.3 example 1, scaled to testnet-faucet size
///   PHASE=settle BATCH_ID=<n> PRIVATE_KEY=0x...                    settle a closed round
///
/// Keys come only from env for the one command and are never printed or written. Transaction hashes are printed by
/// forge as it broadcasts and are saved in broadcast/Demo.s.sol/31611/run-latest.json.
contract Demo is Script {
    address internal constant MUSD = 0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503;
    address internal constant BTC = 0x7b7C000000000000000000000000000000000000;
    address internal constant ROUTER = 0x9a1ff7FE3a0F69959A3fBa1F1e5ee18e1A9CD7E9;
    address internal constant FACTORY = 0x4947243CC818b627A5D06d14C4eCe7398A23Ce1A;

    function run() external {
        string memory phase = vm.envString("PHASE");
        bytes32 h = keccak256(bytes(phase));
        if (h == keccak256("fund")) _fund();
        else if (h == keccak256("submit")) _submit();
        else if (h == keccak256("settle")) _settle();
        else revert("PHASE must be fund, submit or settle");
    }

    function _book() internal view returns (IIntentBook) {
        string memory json = vm.readFile("deployments/31611.json");
        return IIntentBook(vm.parseJsonAddress(json, ".IntentBook"));
    }

    function _fund() internal {
        uint256 k = vm.envUint("PRIVATE_KEY");
        address w1 = vm.envAddress("W1_ADDR");
        address w2 = vm.envAddress("W2_ADDR");
        address w3 = vm.envAddress("W3_ADDR");
        IMezoRouter.Route[] memory r = new IMezoRouter.Route[](1);
        r[0] = IMezoRouter.Route({from: BTC, to: MUSD, stable: false, factory: FACTORY});
        vm.startBroadcast(k);
        // buy the demo MUSD from the live pool (no trove needed), then fund the three wallets
        IERC20(BTC).approve(ROUTER, 0.0011 ether);
        IMezoRouter(ROUTER).swapExactTokensForTokens(0.0011 ether, 80e18, r, vm.addr(k), block.timestamp + 600);
        IERC20(MUSD).transfer(w2, 60e18);
        IERC20(MUSD).transfer(w3, 20e18);
        payable(w1).transfer(0.00105 ether);
        payable(w2).transfer(0.00005 ether);
        payable(w3).transfer(0.00005 ether);
        vm.stopBroadcast();
        console2.log("bought MUSD with 0.0011 BTC; sent 60 MUSD to W2, 20 MUSD to W3, 0.00105 BTC to W1");
    }

    function _submit() internal {
        IIntentBook book = _book();
        uint256 id = book.currentBatchId();
        (, uint256 closeAt,) = book.batchTimes(id);
        if (closeAt < block.timestamp + 60) {
            console2.log("less than 60 s left in round", id, "- wait for the next round");
            revert("wait for the next round");
        }

        // A sells 0.001 BTC, wants at least 77 MUSD
        vm.startBroadcast(vm.envUint("W1_KEY"));
        book.submitSellBtc{value: 0.001 ether}(77e18);
        vm.stopBroadcast();

        // B sells 60 MUSD, wants at least 0.00076 BTC
        vm.startBroadcast(vm.envUint("W2_KEY"));
        IERC20(MUSD).approve(address(book), 60e18);
        book.submitSellMusd(60e18, 0.00076e18);
        vm.stopBroadcast();

        // C sells 20 MUSD with a minimum set too high (0.00026 BTC): refunded
        vm.startBroadcast(vm.envUint("W3_KEY"));
        IERC20(MUSD).approve(address(book), 20e18);
        book.submitSellMusd(20e18, 0.00026e18);
        vm.stopBroadcast();

        console2.log("submitted three intents into round", id);
        console2.log("round closes at", closeAt);
        console2.log("BATCH_ID for the settle phase:", id);
    }

    function _settle() internal {
        IIntentBook book = _book();
        uint256 id = vm.envUint("BATCH_ID");
        vm.startBroadcast(vm.envUint("PRIVATE_KEY"));
        book.settle(id);
        vm.stopBroadcast();
        console2.log("settled round", id);
    }
}
