// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

interface IVmDeal {
    function deal(address who, uint256 newBalance) external;
}

/// @notice Mimics the Mezo BTC precompile ERC-20: balanceOf(a) == a.balance, transfer/transferFrom move NATIVE
///         balance (via the deal cheatcode) and run no recipient code. Has no constructor state so its runtime code
///         can be `vm.etch`ed at 0x7b7C...0000.
contract MockNativeBtc {
    IVmDeal private constant VM = IVmDeal(address(uint160(uint256(keccak256("hevm cheat code")))));

    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    function name() external pure returns (string memory) {
        return "Bitcoin";
    }

    function symbol() external pure returns (string memory) {
        return "BTC";
    }

    function decimals() external pure returns (uint8) {
        return 18;
    }

    function totalSupply() external pure returns (uint256) {
        return 21_000_000e18;
    }

    function balanceOf(address a) external view returns (uint256) {
        return a.balance;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _move(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 a = allowance[from][msg.sender];
        if (a != type(uint256).max) {
            require(a >= amount, "BTC: allowance");
            allowance[from][msg.sender] = a - amount;
        }
        _move(from, to, amount);
        return true;
    }

    function _move(address from, address to, uint256 amount) internal {
        require(from.balance >= amount, "BTC: balance");
        VM.deal(from, from.balance - amount);
        VM.deal(to, to.balance + amount);
        emit Transfer(from, to, amount);
    }
}
