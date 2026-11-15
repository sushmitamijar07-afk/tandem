// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title IMezoPoolFactory (FROZEN in P1)
/// @notice Minimal interface of the Mezo PoolFactory 0x4947243CC818b627A5D06d14C4eCe7398A23Ce1A,
///         copied from BUILD_PROMPT Appendix A.
interface IMezoPoolFactory {
    /// @notice Fee in basis points of 10,000 (volatile today: 4).
    function getFee(address pool, bool _stable) external view returns (uint256);

    function isPaused() external view returns (bool);
}
