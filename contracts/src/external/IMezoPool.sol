// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title IMezoPool (FROZEN in P1)
/// @notice Minimal interface of the Mezo (Velodrome-style) Pool, copied from BUILD_PROMPT Appendix A.
///         MUSD/BTC volatile pool: 0xd16A5Df82120ED8D626a1a15232bFcE2366d6AA9 (token0 = MUSD, token1 = BTC).
interface IMezoPool {
    /// @notice Shape of lastObservation() / observations(i).
    struct Observation {
        uint256 timestamp;
        uint256 reserve0Cumulative;
        uint256 reserve1Cumulative;
    }

    function getReserves() external view returns (uint256 _reserve0, uint256 _reserve1, uint256 _blockTimestampLast);

    /// @notice TWAP over the last `granularity` completed observation intervals (no fee).
    function quote(address tokenIn, uint256 amountIn, uint256 granularity) external view returns (uint256 amountOut);

    /// @notice Spot output net of the pool fee (same formula the Router uses).
    function getAmountOut(uint256 amountIn, address tokenIn) external view returns (uint256);

    function token0() external view returns (address);
    function token1() external view returns (address);
    function stable() external view returns (bool);

    function metadata()
        external
        view
        returns (uint256 dec0, uint256 dec1, uint256 r0, uint256 r1, bool st, address t0, address t1);

    function lastObservation() external view returns (Observation memory);
    function observationLength() external view returns (uint256);
    function observations(uint256)
        external
        view
        returns (uint256 timestamp, uint256 reserve0Cumulative, uint256 reserve1Cumulative);

    /// @notice Permissionless; writes a TWAP observation when >= PERIOD_SIZE has passed (keeper only).
    function sync() external;
}
