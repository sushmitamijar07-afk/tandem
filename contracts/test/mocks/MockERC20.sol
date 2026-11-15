// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice MUSD stand-in. `setBlocked(addr)` makes any transfer TO addr revert (failing-receiver tests); like the
///         real MUSD it also blocks transfers to address(0) and to itself (OZ already rejects address(0)).
contract MockERC20 is ERC20 {
    mapping(address => bool) public blocked;

    constructor(string memory n, string memory s) ERC20(n, s) {}

    function mint(address to, uint256 amt) external {
        _mint(to, amt);
    }

    function burn(address from, uint256 amt) external {
        _burn(from, amt);
    }

    function setBlocked(address a, bool b) external {
        blocked[a] = b;
    }

    function _update(address from, address to, uint256 value) internal override {
        require(!blocked[to], "MockERC20: blocked receiver");
        require(to != address(this), "MockERC20: to self");
        super._update(from, to, value);
    }
}
