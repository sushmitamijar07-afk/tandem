// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IMezoPoolFactory} from "../../src/external/IMezoPoolFactory.sol";
import {MockERC20} from "./MockERC20.sol";

interface IVmDealPool {
    function deal(address who, uint256 newBalance) external;
}

/// @notice Volatile constant-product pool with Velodrome semantics: fee read from the factory in bps of 10,000,
///         `amountIn -= amountIn * fee / 10000` before the x*y/(x+y) formula, reserves refreshed from balances after a
///         swap. token0 = MUSD (MockERC20), token1 = BTC (MockNativeBtc, balance == native balance).
contract MockPool {
    IVmDealPool private constant VM = IVmDealPool(address(uint160(uint256(keccak256("hevm cheat code")))));

    address public immutable token0;
    address public immutable token1;
    IMezoPoolFactory public immutable factory;
    bool public stable;
    uint256 public dec0 = 1e18;
    uint256 public dec1 = 1e18;

    uint256 public reserve0;
    uint256 public reserve1;
    /// @notice settable TWAP, MUSD per BTC, 1e18-scaled
    uint256 public twapPrice;
    /// @notice incremented whenever getAmountOut runs (for gas / call-count tests it is a view, so unused there)
    uint256 public swaps;

    constructor(address t0, address t1, address f) {
        token0 = t0;
        token1 = t1;
        factory = IMezoPoolFactory(f);
    }

    function setStable(bool s) external {
        stable = s;
    }

    function setDecimals(uint256 d0, uint256 d1) external {
        dec0 = d0;
        dec1 = d1;
    }

    function setTwap(uint256 p) external {
        twapPrice = p;
    }

    /// @notice Test helper: set reserves AND make the real balances match (mint/burn MUSD, deal native BTC).
    function setReserves(uint256 r0, uint256 r1) external {
        uint256 b0 = IERC20(token0).balanceOf(address(this));
        if (r0 > b0) MockERC20(token0).mint(address(this), r0 - b0);
        else if (r0 < b0) MockERC20(token0).burn(address(this), b0 - r0);
        VM.deal(address(this), r1);
        reserve0 = r0;
        reserve1 = r1;
    }

    function getReserves() external view returns (uint256, uint256, uint256) {
        return (reserve0, reserve1, block.timestamp);
    }

    function metadata() external view returns (uint256, uint256, uint256, uint256, bool, address, address) {
        return (dec0, dec1, reserve0, reserve1, stable, token0, token1);
    }

    function getAmountOut(uint256 amountIn, address tokenIn) public view returns (uint256) {
        uint256 fee = factory.getFee(address(this), stable);
        amountIn -= (amountIn * fee) / 10000;
        (uint256 rIn, uint256 rOut) = tokenIn == token0 ? (reserve0, reserve1) : (reserve1, reserve0);
        if (rIn + amountIn == 0) return 0;
        return (amountIn * rOut) / (rIn + amountIn);
    }

    function quote(address tokenIn, uint256 amountIn, uint256) external view returns (uint256) {
        if (tokenIn == token1) return (amountIn * twapPrice) / 1e18;
        return (amountIn * 1e18) / twapPrice;
    }

    /// @dev Pays out first, then refreshes reserves from balances and checks k did not fall (like the real pool).
    function swap(uint256 amount0Out, uint256 amount1Out, address to, bytes calldata) external {
        require(amount0Out > 0 || amount1Out > 0, "Pool: insufficient output");
        uint256 k0 = reserve0 * reserve1;
        if (amount0Out > 0) require(IERC20(token0).transfer(to, amount0Out), "Pool: t0");
        if (amount1Out > 0) require(IERC20(token1).transfer(to, amount1Out), "Pool: t1");
        reserve0 = IERC20(token0).balanceOf(address(this));
        reserve1 = IERC20(token1).balanceOf(address(this));
        require(reserve0 * reserve1 >= k0, "Pool: K");
    }

    function sync() external {}
}
