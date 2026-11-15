// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title IMezoRouter (FROZEN in P1)
/// @notice Minimal interface of the Mezo Router 0x9a1ff7FE3a0F69959A3fBa1F1e5ee18e1A9CD7E9,
///         copied from BUILD_PROMPT Appendix A.
interface IMezoRouter {
    struct Route {
        address from;
        address to;
        bool stable;
        address factory;
    }

    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        Route[] calldata routes,
        address to,
        uint256 deadline
    ) external returns (uint256[] memory amounts);

    /// @notice Returns 0 (does not revert) for a route whose pool does not exist.
    function getAmountsOut(uint256 amountIn, Route[] calldata routes) external view returns (uint256[] memory amounts);

    function poolFor(address tokenA, address tokenB, bool stable, address _factory) external view returns (address pool);
}
