// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title IPriceGuard (FROZEN in P1)
/// @notice View-only price reader for the Mezo MUSD/BTC pool: spot mid, pool TWAP and the MUSD PriceFeed,
///         plus band checks. Holds no funds, has no owner. All parameters are immutable.
/// @dev constructor(address pool, address factory, address priceSource, address musd, address btc,
///                  uint256 granularity, uint256 maxSpotTwapBps, uint256 oracleBandBps)
///      Checks: no zero address (InvalidParam("pool"|"factory"|"priceSource"|"musd"|"btc")), bounds
///      (InvalidParam("granularity"|"maxSpotTwapBps"|"oracleBandBps")), and BadPool unless
///      pool.token0()==musd, pool.token1()==btc, !pool.stable(), metadata() dec0==dec1==1e18.
interface IPriceGuard {
    /// @notice All prices are MUSD per 1 BTC, 1e18-scaled.
    struct Prices {
        uint256 spot; // r0*1e18/r1 (0 if r1 == 0)
        uint256 twap; // quote(BTC, PROBE, G) * 1e18 / PROBE
        uint256 oracle; // PriceFeed.fetchPrice(); 0 if it reverted
        uint256 spotTwapBps; // ceil(|spot-twap|*1e4/twap); type(uint256).max if spot == 0 or twap == 0
        uint256 twapOracleBps; // ceil(|twap-oracle|*1e4/oracle); type(uint256).max if oracle == 0
        uint256 reserveMusd;
        uint256 reserveBtc;
        uint256 feeBps; // PoolFactory.getFee(pool, false)
    }

    error SpotTwapDeviation(uint256 spot, uint256 twap, uint256 bps, uint256 maxBps);
    error OracleDeviation(uint256 twap, uint256 oracle, uint256 bps, uint256 maxBps);
    error OracleUnavailable();
    error BadPool();
    error InvalidParam(bytes32 which);

    /// @notice Never reverts on the bands (the UI uses it). It can revert only if the pool or factory reverts.
    function read() external view returns (Prices memory);

    /// @notice read() + band checks, in this order: SpotTwapDeviation (bps > MAX_SPOT_TWAP_BPS),
    ///         OracleUnavailable (oracle == 0), OracleDeviation (bps > ORACLE_BAND_BPS). Equality passes.
    function checked() external view returns (Prices memory);

    // immutables: PRICE_SOURCE is the PriceFeed on testnet and a mock in tests
    function POOL() external view returns (address);
    function FACTORY() external view returns (address);
    function PRICE_SOURCE() external view returns (address);
    function MUSD() external view returns (address);
    function BTC() external view returns (address);
    /// @notice [1,8]; default 2
    function GRANULARITY() external view returns (uint256);
    /// @notice constant 1e16 (0.01 BTC)
    function PROBE() external view returns (uint256);
    /// @notice [1,500]; default 50
    function MAX_SPOT_TWAP_BPS() external view returns (uint256);
    /// @notice [1,3000]; testnet value measured in P0 (docs/FACTS.md)
    function ORACLE_BAND_BPS() external view returns (uint256);
}
