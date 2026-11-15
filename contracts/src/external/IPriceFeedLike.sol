// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title IPriceFeedLike (FROZEN in P1)
/// @notice MUSD-system PriceFeed 0x86bCF0841622a5dAC14A313a15f96A95421b9366 (Appendix A).
interface IPriceFeedLike {
    /// @notice BTC/USD, 18 decimals. Reverts "PriceFeed: Oracle is stale." if the oracle is > 60 s old.
    function fetchPrice() external view returns (uint256);
}
