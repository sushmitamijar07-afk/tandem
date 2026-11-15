// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title IBorrowerOperations (FROZEN in P1)
/// @notice MUSD BorrowerOperations 0xCdF7028ceAB81fA0C6971208e83fa7872994beE5 (Appendix A). Used ONLY by
///         script/Demo.s.sol to mint MUSD for the demo wallets. Collateral is native BTC sent as msg.value.
interface IBorrowerOperations {
    function openTrove(uint256 _debtAmount, address _upperHint, address _lowerHint) external payable;
}
