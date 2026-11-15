// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IMezoRouter} from "../../src/external/IMezoRouter.sol";
import {MockPool} from "./MockPool.sol";

/// @notice Same semantics as the verified Router for one volatile pool: getAmountsOut -> pool.getAmountOut, reverts
///         InsufficientOutputAmount, pulls amountIn from msg.sender into the pool, then pool.swap.
///         `shortChange` (wei) makes it deliver less than it quoted (malicious-router test).
contract MockRouter is IMezoRouter {
    error InsufficientOutputAmount();

    MockPool public immutable pool;
    uint256 public shortChange;
    uint256 public swapCalls;

    constructor(MockPool p) {
        pool = p;
    }

    function setShortChange(uint256 s) external {
        shortChange = s;
    }

    function poolFor(address, address, bool, address) external view returns (address) {
        return address(pool);
    }

    function getAmountsOut(uint256 amountIn, Route[] calldata routes) external view returns (uint256[] memory a) {
        a = new uint256[](2);
        a[0] = amountIn;
        a[1] = pool.getAmountOut(amountIn, routes[0].from);
    }

    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        Route[] calldata routes,
        address to,
        uint256 deadline
    ) external returns (uint256[] memory amounts) {
        require(deadline >= block.timestamp, "Router: expired");
        swapCalls++;
        address from = routes[0].from;
        uint256 out = pool.getAmountOut(amountIn, from);
        if (out < amountOutMin) revert InsufficientOutputAmount();
        require(IERC20(from).transferFrom(msg.sender, address(pool), amountIn), "Router: pull");
        uint256 send = out - shortChange;
        if (from == pool.token0()) pool.swap(0, send, to, "");
        else pool.swap(send, 0, to, "");
        amounts = new uint256[](2);
        amounts[0] = amountIn;
        amounts[1] = send;
    }
}
