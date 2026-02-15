// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract MockToken {
    string public name = "FORGOOD";
    string public symbol = "FORGOOD";
    uint8 public decimals = 18;

    mapping(address => uint256) public balanceOf;

    event Transfer(address indexed from, address indexed to, uint256 amount);

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        address owner = msg.sender;
        require(balanceOf[owner] >= amount, "INSUFFICIENT");
        balanceOf[owner] -= amount;
        balanceOf[to] += amount;
        emit Transfer(owner, to, amount);
        return true;
    }
}
