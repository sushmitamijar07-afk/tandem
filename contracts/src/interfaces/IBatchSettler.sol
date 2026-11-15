// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Side} from "./IBatchTypes.sol";

/// @title IBatchSettler (FROZEN in P1)
/// @notice Stateless clearing engine; holds no funds and has no owner.
/// @dev constructor(address pool, address musd, address btc). Zero address -> ZeroAddress().
interface IBatchSettler {
    struct Order {
        uint256 id; // intentId
        Side side;
        uint256 amountIn;
        uint256 minOut;
    }

    struct Fill {
        uint256 id; // intentId (copied from Order.id)
        bool filled;
        uint256 amountOut; // tokenOut owed (0 if !filled)
        uint256 refundIn; // tokenIn returned: amountIn if !filled; unroutable-dust share if filled
    }

    struct Clearing {
        uint256 refPrice;
        bool routeBtc; // excess side is BTC (Router sells BTC); false if no order filled
        uint256 routeIn; // tokenIn actually sent to the Router (0 = no Router call)
        uint256 routeOut; // exact pool.getAmountOut(routeIn) at current reserves (0 iff routeIn == 0)
        uint256 priceBtcSide; // 0 if no BTC seller filled
        uint256 priceMusdSide; // 0 if no MUSD seller filled
        uint256 rounds;
        Fill[] fills; // same order as the input orders
    }

    error TooManyOrders(uint256 n, uint256 max);
    error ZeroPrice();
    error ZeroAddress();

    /// @notice Deterministic clearing at refPrice (brief §5.2 + docs/SPEC.md). View: reads only pool.getAmountOut.
    function clear(Order[] calldata orders, uint256 refPrice) external view returns (Clearing memory);

    /// @notice constant 64
    function MAX_ORDERS() external view returns (uint256);
    function POOL() external view returns (address);
    function MUSD() external view returns (address);
    function BTC() external view returns (address);
}
