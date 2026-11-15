// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {PriceGuard} from "../src/PriceGuard.sol";
import {BatchSettler} from "../src/BatchSettler.sol";
import {IntentBook} from "../src/IntentBook.sol";

/// @notice Deploys PriceGuard -> BatchSettler -> IntentBook on Mezo testnet (SPEC D40, brief §11.3).
///
///   PRIVATE_KEY=0x... ORACLE_BAND_BPS=2114 GAP_BPS=1714 \
///   forge script script/Deploy.s.sol --rpc-url $R --broadcast --skip-simulation --gas-estimate-multiplier 150
///
/// Env: PRIVATE_KEY (deployer = owner), ORACLE_BAND_BPS = min(3000, gapBps + 400) re-measured right before deploy,
/// GAP_BPS (recorded only), FORCE=1 to overwrite an existing deployments/31611.json. The key is read from env for
/// this one command and never written anywhere.
contract Deploy is Script {
    // Mezo testnet (docs/FACTS.md, shared §3.1)
    address internal constant MUSD = 0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503;
    address internal constant BTC = 0x7b7C000000000000000000000000000000000000;
    address internal constant POOL = 0xd16A5Df82120ED8D626a1a15232bFcE2366d6AA9;
    address internal constant ROUTER = 0x9a1ff7FE3a0F69959A3fBa1F1e5ee18e1A9CD7E9;
    address internal constant FACTORY = 0x4947243CC818b627A5D06d14C4eCe7398A23Ce1A;
    address internal constant PRICE_FEED = 0x86bCF0841622a5dAC14A313a15f96A95421b9366;

    string internal constant OUT = "deployments/31611.json";

    function run() external {
        if (vm.exists(OUT) && !vm.envOr("FORCE", false)) {
            revert("deployments/31611.json exists; set FORCE=1 to overwrite");
        }
        uint256 key = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(key);
        uint256 band = vm.envUint("ORACLE_BAND_BPS");
        uint256 gap = vm.envOr("GAP_BPS", uint256(0));
        require(band >= 1 && band <= 3000, "ORACLE_BAND_BPS out of range");

        // startTime = deploy time rounded up to the next minute
        uint64 startTime = uint64((block.timestamp / 60 + 1) * 60);

        vm.startBroadcast(key);
        PriceGuard guard = new PriceGuard(POOL, FACTORY, PRICE_FEED, MUSD, BTC, 2, 50, band);
        BatchSettler settler = new BatchSettler(POOL, MUSD, BTC);
        IntentBook book = new IntentBook(
            IntentBook.Params({
                musd: MUSD,
                btc: BTC,
                router: ROUTER,
                factory: FACTORY,
                pool: POOL,
                guard: address(guard),
                settler: address(settler),
                startTime: startTime,
                batchDuration: 120,
                settleTimeout: 7200,
                maxIntents: 40,
                minMusdIn: 10e18,
                minBtcIn: 1e14,
                owner: deployer
            })
        );
        vm.stopBroadcast();

        string memory k = "deploy";
        vm.serializeAddress(k, "PriceGuard", address(guard));
        vm.serializeAddress(k, "BatchSettler", address(settler));
        vm.serializeAddress(k, "IntentBook", address(book));
        vm.serializeUint(k, "deployBlock", block.number);
        vm.serializeUint(k, "oracleBandBps", band);
        string memory json = vm.serializeUint(k, "gapBps", gap);
        vm.writeJson(json, OUT);

        console2.log("PriceGuard   ", address(guard));
        console2.log("BatchSettler ", address(settler));
        console2.log("IntentBook   ", address(book));
        console2.log("startTime    ", startTime);
        console2.log("owner        ", deployer);
        console2.log("written      ", OUT);
    }
}
