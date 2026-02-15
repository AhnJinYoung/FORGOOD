// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ITreasury {
    function releaseReward(address recipient, uint256 amount) external;
}

contract MissionRegistry {
    error Unauthorized();
    error InvalidStatus();
    error ZeroAddress();
    error EmptyHash();

    event MissionProposed(uint256 indexed missionId, address indexed proposer, bytes32 metadataHash);
    event MissionEvaluated(uint256 indexed missionId, uint256 rewardAmount);
    event MissionActivated(uint256 indexed missionId);
    event ProofSubmitted(uint256 indexed missionId, address indexed claimer, bytes32 proofHash);
    event MissionVerified(uint256 indexed missionId, bool approved);
    event MissionRewarded(uint256 indexed missionId, address indexed claimer, uint256 rewardAmount);
    event AgentUpdated(address indexed agent);
    event TreasuryUpdated(address indexed treasury);

    enum Status {
        Proposed,
        Evaluated,
        Active,
        ProofSubmitted,
        Verified,
        Rejected,
        Rewarded
    }

    struct Mission {
        address proposer;
        address claimer;
        bytes32 metadataHash;
        bytes32 proofHash;
        uint256 rewardAmount;
        Status status;
    }

    address public owner;
    address public agent;
    ITreasury public treasury;
    uint256 public nextMissionId = 1;

    mapping(uint256 => Mission) public missions;

    constructor(address treasury_, address agent_) {
        if (treasury_ == address(0) || agent_ == address(0)) revert ZeroAddress();
        owner = msg.sender;
        treasury = ITreasury(treasury_);
        agent = agent_;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    modifier onlyAgent() {
        if (msg.sender != agent) revert Unauthorized();
        _;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        owner = newOwner;
    }

    function setAgent(address agent_) external onlyOwner {
        if (agent_ == address(0)) revert ZeroAddress();
        agent = agent_;
        emit AgentUpdated(agent_);
    }

    function setTreasury(address treasury_) external onlyOwner {
        if (treasury_ == address(0)) revert ZeroAddress();
        treasury = ITreasury(treasury_);
        emit TreasuryUpdated(treasury_);
    }

    function proposeMission(bytes32 metadataHash) external returns (uint256 missionId) {
        if (metadataHash == bytes32(0)) revert EmptyHash();
        missionId = nextMissionId++;
        missions[missionId] = Mission({
            proposer: msg.sender,
            claimer: address(0),
            metadataHash: metadataHash,
            proofHash: bytes32(0),
            rewardAmount: 0,
            status: Status.Proposed
        });
        emit MissionProposed(missionId, msg.sender, metadataHash);
    }

    function evaluateMission(uint256 missionId, uint256 rewardAmount) external onlyAgent {
        Mission storage mission = missions[missionId];
        if (mission.status != Status.Proposed) revert InvalidStatus();
        mission.rewardAmount = rewardAmount;
        mission.status = Status.Evaluated;
        emit MissionEvaluated(missionId, rewardAmount);
    }

    function activateMission(uint256 missionId) external onlyAgent {
        Mission storage mission = missions[missionId];
        if (mission.status != Status.Evaluated) revert InvalidStatus();
        mission.status = Status.Active;
        emit MissionActivated(missionId);
    }

    function submitProof(uint256 missionId, bytes32 proofHash) external {
        if (proofHash == bytes32(0)) revert EmptyHash();
        Mission storage mission = missions[missionId];
        if (mission.status != Status.Active) revert InvalidStatus();
        mission.status = Status.ProofSubmitted;
        mission.proofHash = proofHash;
        if (mission.claimer == address(0)) {
            mission.claimer = msg.sender;
        }
        emit ProofSubmitted(missionId, mission.claimer, proofHash);
    }

    function verifyMission(uint256 missionId, bool approved) external onlyAgent {
        Mission storage mission = missions[missionId];
        if (mission.status != Status.ProofSubmitted) revert InvalidStatus();
        if (approved) {
            mission.status = Status.Verified;
        } else {
            mission.status = Status.Rejected;
        }
        emit MissionVerified(missionId, approved);
    }

    function rewardMission(uint256 missionId) external onlyAgent {
        Mission storage mission = missions[missionId];
        if (mission.status != Status.Verified) revert InvalidStatus();
        if (mission.claimer == address(0)) revert ZeroAddress();
        mission.status = Status.Rewarded;
        treasury.releaseReward(mission.claimer, mission.rewardAmount);
        emit MissionRewarded(missionId, mission.claimer, mission.rewardAmount);
    }
}
