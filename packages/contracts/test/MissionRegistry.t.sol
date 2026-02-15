// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/MissionRegistry.sol";
import "../src/ForGoodTreasury.sol";
import "../src/MockToken.sol";

contract MissionRegistryTest is Test {
    MockToken private token;
    ForGoodTreasury private treasury;
    MissionRegistry private registry;

    address private agent = address(0xA11CE);
    address private proposer = address(0xB0B);
    address private claimer = address(0xCAFE);

    function setUp() public {
        token = new MockToken();
        treasury = new ForGoodTreasury(address(token), agent);
        registry = new MissionRegistry(address(treasury), agent);
        treasury.setAuthorizedRegistry(address(registry));
        token.mint(address(treasury), 1_000 ether);
    }

    function testLifecycleHappyPath() public {
        bytes32 metadataHash = keccak256("cleanup-park");
        bytes32 proofHash = keccak256("proof-1");

        vm.prank(proposer);
        uint256 missionId = registry.proposeMission(metadataHash);

        vm.prank(agent);
        registry.evaluateMission(missionId, 100 ether);

        vm.prank(agent);
        registry.activateMission(missionId);

        vm.prank(claimer);
        registry.submitProof(missionId, proofHash);

        vm.prank(agent);
        registry.verifyMission(missionId, true);

        uint256 before = token.balanceOf(claimer);
        vm.prank(agent);
        registry.rewardMission(missionId);
        uint256 afterBalance = token.balanceOf(claimer);

        assertEq(afterBalance - before, 100 ether);

        (, , , , , MissionRegistry.Status status) = registry.missions(missionId);
        assertEq(uint256(status), uint256(MissionRegistry.Status.Rewarded));
    }

    function testEvaluateUnauthorized() public {
        vm.prank(proposer);
        uint256 missionId = registry.proposeMission(keccak256("mission"));

        vm.expectRevert(MissionRegistry.Unauthorized.selector);
        registry.evaluateMission(missionId, 1 ether);
    }

    function testRewardInsufficientTreasury() public {
        vm.prank(proposer);
        uint256 missionId = registry.proposeMission(keccak256("mission"));

        vm.prank(agent);
        registry.evaluateMission(missionId, 2_000 ether);

        vm.prank(agent);
        registry.activateMission(missionId);

        vm.prank(claimer);
        registry.submitProof(missionId, keccak256("proof"));

        vm.prank(agent);
        registry.verifyMission(missionId, true);

        vm.expectRevert(ForGoodTreasury.InsufficientBalance.selector);
        vm.prank(agent);
        registry.rewardMission(missionId);
    }
}
