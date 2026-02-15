// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "forge-std/console2.sol";
import { MockToken } from "../src/MockToken.sol";
import { ForGoodTreasury } from "../src/ForGoodTreasury.sol";
import { MissionRegistry } from "../src/MissionRegistry.sol";

/**
 * @title Deploy
 * @notice Deploys the full FORGOOD stack to Monad:
 *         1. MockToken (ERC-20)
 *         2. ForGoodTreasury (holds tokens, releases rewards)
 *         3. MissionRegistry (state machine, calls treasury)
 *         Then wires them together and mints initial supply.
 *
 * Usage:
 *   forge script script/Deploy.s.sol:Deploy \
 *     --rpc-url $MONAD_RPC_URL \
 *     --broadcast \
 *     --account monad-deployer
 *
 * Environment variables:
 *   DEPLOYER_PRIVATE_KEY   - private key for deployment
 *   AUTHORIZED_AGENT       - address of the AI agent wallet
 *   FORGOOD_TOKEN_ADDRESS  - (optional) existing token address; deploys MockToken if unset
 */
contract Deploy is Script {
    uint256 constant INITIAL_SUPPLY = 1_000_000 ether; // 1M FORGOOD tokens to treasury

    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address agent = vm.envAddress("AUTHORIZED_AGENT");

        // Use existing token if set, otherwise deploy MockToken
        address tokenAddr;
        bool deployMock = true;
        try vm.envAddress("FORGOOD_TOKEN_ADDRESS") returns (address existing) {
            if (existing != address(0)) {
                tokenAddr = existing;
                deployMock = false;
            }
        } catch {}

        vm.startBroadcast(deployerKey);

        // Step 1: Token
        MockToken token;
        if (deployMock) {
            token = new MockToken();
            tokenAddr = address(token);
            console2.log("MockToken deployed:", tokenAddr);
        } else {
            console2.log("Using existing token:", tokenAddr);
        }

        // Step 2: Treasury
        ForGoodTreasury treasury = new ForGoodTreasury(tokenAddr, agent);
        console2.log("ForGoodTreasury deployed:", address(treasury));

        // Step 3: Registry
        MissionRegistry registry = new MissionRegistry(address(treasury), agent);
        console2.log("MissionRegistry deployed:", address(registry));

        // Step 4: Wire treasury ← registry (so registry can call releaseReward)
        treasury.setAuthorizedRegistry(address(registry));
        console2.log("Treasury authorized registry:", address(registry));

        // Step 5: Mint initial supply to treasury
        if (deployMock) {
            token.mint(address(treasury), INITIAL_SUPPLY);
            console2.log("Minted", INITIAL_SUPPLY / 1 ether, "FORGOOD to treasury");
        }

        vm.stopBroadcast();

        // Summary
        console2.log("--- DEPLOYMENT SUMMARY ---");
        console2.log("Token:    ", tokenAddr);
        console2.log("Treasury: ", address(treasury));
        console2.log("Registry: ", address(registry));
        console2.log("Agent:    ", agent);
        console2.log("--------------------------");
    }
}
