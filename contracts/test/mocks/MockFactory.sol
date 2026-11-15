// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

contract MockFactory {
    uint256 public fee = 4;
    bool public isPaused;

    function setFee(uint256 f) external {
        fee = f;
    }

    function setPaused(bool p) external {
        isPaused = p;
    }

    function getFee(address, bool) external view returns (uint256) {
        return fee;
    }
}
