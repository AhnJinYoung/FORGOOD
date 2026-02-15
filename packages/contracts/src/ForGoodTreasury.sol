// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20Minimal {
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

contract ForGoodTreasury {
    error Unauthorized();
    error ZeroAddress();
    error TransferFailed();
    error InsufficientBalance();

    event AuthorizedAgentUpdated(address indexed agent);
    event AuthorizedRegistryUpdated(address indexed registry);
    event TokenUpdated(address indexed token);
    event RewardReleased(address indexed recipient, uint256 amount);
    event EmergencyWithdrawal(address indexed recipient, uint256 amount);

    address public owner;
    address public token;
    address public authorizedAgent;
    address public authorizedRegistry;

    constructor(address token_, address agent_) {
        if (token_ == address(0) || agent_ == address(0)) revert ZeroAddress();
        owner = msg.sender;
        token = token_;
        authorizedAgent = agent_;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    modifier onlyRewarder() {
        if (msg.sender != authorizedAgent && msg.sender != authorizedRegistry) revert Unauthorized();
        _;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        owner = newOwner;
    }

    function setAuthorizedAgent(address agent_) external onlyOwner {
        if (agent_ == address(0)) revert ZeroAddress();
        authorizedAgent = agent_;
        emit AuthorizedAgentUpdated(agent_);
    }

    function setAuthorizedRegistry(address registry_) external onlyOwner {
        if (registry_ == address(0)) revert ZeroAddress();
        authorizedRegistry = registry_;
        emit AuthorizedRegistryUpdated(registry_);
    }

    function setToken(address token_) external onlyOwner {
        if (token_ == address(0)) revert ZeroAddress();
        token = token_;
        emit TokenUpdated(token_);
    }

    function releaseReward(address recipient, uint256 amount) external onlyRewarder {
        if (recipient == address(0)) revert ZeroAddress();
        if (IERC20Minimal(token).balanceOf(address(this)) < amount) revert InsufficientBalance();
        bool ok = IERC20Minimal(token).transfer(recipient, amount);
        if (!ok) revert TransferFailed();
        emit RewardReleased(recipient, amount);
    }

    function emergencyWithdraw(address recipient, uint256 amount) external onlyOwner {
        if (recipient == address(0)) revert ZeroAddress();
        bool ok = IERC20Minimal(token).transfer(recipient, amount);
        if (!ok) revert TransferFailed();
        emit EmergencyWithdrawal(recipient, amount);
    }
}
