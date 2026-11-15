// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

contract MockPriceFeed {
    uint256 public price;
    bool public stale;

    constructor(uint256 p) {
        price = p;
    }

    function setPrice(uint256 p) external {
        price = p;
    }

    function setStale(bool s) external {
        stale = s;
    }

    function fetchPrice() external view returns (uint256) {
        require(!stale, "PriceFeed: Oracle is stale.");
        return price;
    }
}
